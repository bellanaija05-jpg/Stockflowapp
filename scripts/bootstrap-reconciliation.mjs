#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const manifestPath = path.join(root, 'scripts', 'reconciliation-bootstrap-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const exportIndex = args.indexOf('--supabase-export');
if (apply && exportIndex < 0) throw new Error('--supabase-export <csv> is required with --apply.');
const exportPath = exportIndex >= 0 ? path.resolve(args[exportIndex + 1]) : '';

const ALLOWED_WRITES = new Set([
  'reconciliation_source_snapshots',
  'reconciliation_reviews',
]);
const assertAllowedWrite = (table) => {
  if (!ALLOWED_WRITES.has(table)) throw new Error(`Bootstrap write denied: ${table}`);
};

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); field = ''; if (row.some((v) => v !== '')) rows.push(row); row = []; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); if (row.some((v) => v !== '')) rows.push(row); }
  const headers = rows.shift();
  return rows.map((values) => Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ''])));
}

const nullish = (value) => value === null || value === undefined || value === '' || value === 'null' ? null : value;
const numberish = (value) => value === null || value === undefined || value === '' || value === 'null' ? null : Number(value);
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
const deterministicUuid = (value) => {
  const bytes = Buffer.from(crypto.createHash('sha256').update(value).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const hashSnapshot = (row) => crypto.createHash('sha256')
  .update(JSON.stringify(stable({ ...row, snapshot_hash: undefined, captured_at: undefined, created_at: undefined })))
  .digest('hex');

async function loadLocalCatalog() {
  const result = esbuild.buildSync({ entryPoints: [path.join(root, 'src/db/seedData.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require, console, process, Date, JSON, Map, Set });
  return module.exports;
}

function localSnapshots(local) {
  const categories = new Map(local.SEED_CATEGORIES.map((category) => [category.id, category]));
  return local.SEED_PRODUCTS.map((product) => {
    const category = categories.get(product.categoryId);
    const row = {
      source_side: 'LOCAL', source_record_reference: product.id, sku: product.sku, name: product.name,
      barcode: nullish(product.barcode), brand: nullish(product.brand), model: nullish(product.model),
      variant: nullish(product.variant), description: nullish(product.description),
      category_id: nullish(product.categoryId), category_name: nullish(category?.name),
      category_created_at: nullish(category?.createdAt), category_updated_at: null,
      selling_price: Number(product.sellingPrice), cost_price: Number(product.costPrice),
      reorder_level: Number(product.reorderLevel), status: nullish(product.status),
      source_created_at: nullish(product.createdAt), source_updated_at: nullish(product.updatedAt),
      captured_at: new Date().toISOString(), evidence_basis_version: manifest.evidenceBasisVersion,
    };
    return { ...row, snapshot_hash: hashSnapshot(row) };
  });
}

function supabaseSnapshots(csvPath) {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  if (rows.length !== 42) throw new Error(`Expected 42 Supabase rows, found ${rows.length}.`);
  return rows.map((product) => {
    const row = {
      source_side: 'SUPABASE', source_record_reference: product.id, sku: nullish(product.sku), name: nullish(product.name),
      barcode: nullish(product.barcode), brand: nullish(product.brand), model: nullish(product.model),
      variant: nullish(product.variant), description: nullish(product.description),
      category_id: nullish(product.category_id), category_name: nullish(product.category_name),
      category_created_at: nullish(product.category_created_at), category_updated_at: nullish(product.category_updated_at),
      selling_price: numberish(product.selling_price), cost_price: numberish(product.cost_price),
      reorder_level: numberish(product.reorder_level), status: nullish(product.status),
      source_created_at: nullish(product.created_at), source_updated_at: nullish(product.updated_at),
      captured_at: new Date().toISOString(), evidence_basis_version: manifest.evidenceBasisVersion,
    };
    return { ...row, snapshot_hash: hashSnapshot(row) };
  });
}

function buildReviewPlan(localRows, supabaseRows) {
  const byLocalSku = new Map(localRows.map((row) => [row.sku, row]));
  const bySupabaseSku = new Map(supabaseRows.map((row) => [row.sku, row]));
  const reviews = [];
  const usedLocal = new Set();
  const usedSupabase = new Set();

  for (const item of manifest.candidateReviews) {
    const local = byLocalSku.get(item.localSku);
    const supabase = bySupabaseSku.get(item.supabaseSku);
    if (!local || !supabase) throw new Error(`Candidate ${item.reviewId} references a missing SKU.`);
    if (usedLocal.has(local.source_record_reference) || usedSupabase.has(supabase.source_record_reference)) {
      throw new Error(`Candidate ${item.reviewId} duplicates a source product.`);
    }
    usedLocal.add(local.source_record_reference);
    usedSupabase.add(supabase.source_record_reference);
    reviews.push({
      review_id: item.reviewId, review_scope: item.reviewScope,
      local_source_reference: local.source_record_reference,
      supabase_source_reference: supabase.source_record_reference,
      local_snapshot_id: local.snapshot_id, supabase_snapshot_id: supabase.snapshot_id,
      classification: item.classification, coverage_state: 'PAIRED',
      evidence_basis_version: manifest.evidenceBasisVersion,
    });
  }

  for (const sku of manifest.unmatchedLocalSkus) {
    const snapshot = byLocalSku.get(sku);
    if (!snapshot || usedLocal.has(snapshot.source_record_reference)) throw new Error(`Unmatched local SKU mismatch: ${sku}`);
    usedLocal.add(snapshot.source_record_reference);
    reviews.push({
      review_id: `LOCAL-ONLY-${sku}`, review_scope: 'LOCAL_ONLY',
      local_source_reference: snapshot.source_record_reference, supabase_source_reference: null,
      local_snapshot_id: snapshot.snapshot_id, supabase_snapshot_id: null,
      classification: 'UNMATCHED_LOCAL', coverage_state: 'UNMATCHED_LOCAL',
      evidence_basis_version: manifest.evidenceBasisVersion,
    });
  }

  for (const sku of manifest.unmatchedSupabaseSkus) {
    const snapshot = bySupabaseSku.get(sku);
    if (!snapshot || usedSupabase.has(snapshot.source_record_reference)) throw new Error(`Unmatched Supabase SKU mismatch: ${sku}`);
    usedSupabase.add(snapshot.source_record_reference);
    reviews.push({
      review_id: `SUPABASE-ONLY-${sku}`, review_scope: 'SUPABASE_ONLY',
      local_source_reference: null, supabase_source_reference: snapshot.source_record_reference,
      local_snapshot_id: null, supabase_snapshot_id: snapshot.snapshot_id,
      classification: 'UNMATCHED_SUPABASE', coverage_state: 'UNMATCHED_SUPABASE',
      evidence_basis_version: manifest.evidenceBasisVersion,
    });
  }

  if (localRows.length !== 42 || supabaseRows.length !== 42) throw new Error('Expected 42 snapshots per source.');
  if (reviews.length !== 57) throw new Error(`Expected 57 reviews, found ${reviews.length}.`);
  if (usedLocal.size !== 42 || usedSupabase.size !== 42) throw new Error('Every source product must appear exactly once.');
  return reviews;
}

function validatePlan(snapshots, reviews) {
  const counts = {
    localSnapshots: snapshots.filter((row) => row.source_side === 'LOCAL').length,
    supabaseSnapshots: snapshots.filter((row) => row.source_side === 'SUPABASE').length,
    totalSnapshots: snapshots.length,
    candidateReviews: reviews.filter((row) => ['CANDIDATE_PAIR', 'EXACT_SKU'].includes(row.review_scope)).length,
    localOnlyReviews: reviews.filter((row) => row.review_scope === 'LOCAL_ONLY').length,
    supabaseOnlyReviews: reviews.filter((row) => row.review_scope === 'SUPABASE_ONLY').length,
    totalReviews: reviews.length,
    businessDecisions: 0,
  };
  const expected = { localSnapshots: 42, supabaseSnapshots: 42, totalSnapshots: 84, candidateReviews: 27, localOnlyReviews: 15, supabaseOnlyReviews: 15, totalReviews: 57, businessDecisions: 0 };
  if (JSON.stringify(counts) !== JSON.stringify(expected)) throw new Error(`Bootstrap count mismatch: ${JSON.stringify(counts)}`);
  if (snapshots.some((row) => !row.snapshot_hash || !row.evidence_basis_version)) throw new Error('Snapshot hash/version missing.');
  if (manifest.candidateReviews.length !== 27 || manifest.unmatchedLocalSkus.length !== 15 || manifest.unmatchedSupabaseSkus.length !== 15) {
    throw new Error('Manifest cardinality is invalid.');
  }
  return counts;
}

function comparableReview(row) {
  return stable({
    review_id: row.review_id, review_scope: row.review_scope,
    local_source_reference: row.local_source_reference,
    supabase_source_reference: row.supabase_source_reference,
    classification: row.classification, coverage_state: row.coverage_state,
    evidence_basis_version: row.evidence_basis_version,
    local_snapshot_id: row.local_snapshot_id,
    supabase_snapshot_id: row.supabase_snapshot_id,
  });
}

async function verifyAppliedState(client, snapshots, reviewsWithIds) {
  const expectedSnapshotKeys = new Set(snapshots.map((row) => `${row.source_side}:${row.source_record_reference}`));
  const expectedReviewIds = new Set(reviewsWithIds.map((row) => row.review_id));
  const [snapshotResult, reviewResult, decisionResult, evidenceResult, conflictResult, gateResult] = await Promise.all([
    client.from('reconciliation_source_snapshots').select('source_side,source_record_reference,snapshot_hash,evidence_basis_version'),
    client.from('reconciliation_reviews').select('review_id,review_scope,local_source_reference,supabase_source_reference,classification,coverage_state,evidence_basis_version'),
    client.from('reconciliation_decisions').select('decision_id', { count: 'exact', head: true }),
    client.from('reconciliation_evidence').select('evidence_id', { count: 'exact', head: true }),
    client.from('reconciliation_conflicts').select('conflict_id', { count: 'exact', head: true }),
    client.from('reconciliation_gate_evaluations').select('gate_evaluation_id', { count: 'exact', head: true }),
  ]);
  for (const result of [snapshotResult, reviewResult, decisionResult, evidenceResult, conflictResult, gateResult]) {
    if (result.error) throw result.error;
  }
  const actualSnapshotKeys = new Set((snapshotResult.data || []).map((row) => `${row.source_side}:${row.source_record_reference}`));
  const actualReviewIds = new Set((reviewResult.data || []).map((row) => row.review_id));
  if (actualSnapshotKeys.size !== 84 || expectedSnapshotKeys.size !== actualSnapshotKeys.size
      || [...expectedSnapshotKeys].some((key) => !actualSnapshotKeys.has(key))) {
    throw new Error('Post-apply snapshot coverage verification failed.');
  }
  if (actualReviewIds.size !== 57 || expectedReviewIds.size !== actualReviewIds.size
      || [...expectedReviewIds].some((id) => !actualReviewIds.has(id))) {
    throw new Error('Post-apply review coverage verification failed.');
  }
  for (const [table, result] of [['decisions', decisionResult], ['evidence', evidenceResult], ['conflicts', conflictResult], ['gates', gateResult]]) {
    if (result.count !== 0) throw new Error(`Post-apply ${table} count was not zero.`);
  }
  return {
    snapshots: snapshotResult.data.length,
    reviews: reviewResult.data.length,
    decisions: decisionResult.count,
    evidence: evidenceResult.count,
    conflicts: conflictResult.count,
    gateEvaluations: gateResult.count,
  };
}

async function applyPlan(snapshots, reviews) {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Trusted bootstrap requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  if (serviceRoleKey === process.env.VITE_SUPABASE_ANON_KEY) throw new Error('Bootstrap refuses a non-service-role key.');
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  assertAllowedWrite('reconciliation_source_snapshots');
  assertAllowedWrite('reconciliation_reviews');
  const reviewsWithIds = reviews.map((review) => ({
    ...review,
    local_snapshot_id: review.local_source_reference
      ? snapshots.find((snapshot) => snapshot.source_side === 'LOCAL' && snapshot.source_record_reference === review.local_source_reference)?.snapshot_id ?? null
      : null,
    supabase_snapshot_id: review.supabase_source_reference
      ? snapshots.find((snapshot) => snapshot.source_side === 'SUPABASE' && snapshot.source_record_reference === review.supabase_source_reference)?.snapshot_id ?? null
      : null,
  }));
  const { data, error } = await client.rpc('bootstrap_reconciliation', {
    p_snapshots: snapshots,
    p_reviews: reviewsWithIds,
  });
  if (error) throw error;
  const verification = await verifyAppliedState(client, snapshots, reviewsWithIds);
  return { mode: 'atomic-rpc', bootstrapResult: data, verification };
}

const localCatalog = await loadLocalCatalog();
const local = localSnapshots(localCatalog);
const supabase = supabaseSnapshots(exportPath || path.join(process.env.USERPROFILE || '', 'Downloads', manifest.supabaseExportFileName));
const snapshots = [...local, ...supabase].map((row) => ({
  ...row,
  snapshot_id: deterministicUuid(`${manifest.evidenceBasisVersion}:${row.source_side}:${row.source_record_reference}`),
}));
const reviewPlan = buildReviewPlan(snapshots.filter((row) => row.source_side === 'LOCAL'), snapshots.filter((row) => row.source_side === 'SUPABASE'));
const counts = validatePlan(snapshots, reviewPlan);
const result = apply ? await applyPlan(snapshots, reviewPlan) : { insertedSnapshots: 0, insertedReviews: 0, mode: 'dry-run' };
console.log(JSON.stringify({ ok: true, counts, ...result, allowedWrites: [...ALLOWED_WRITES] }, null, 2));
