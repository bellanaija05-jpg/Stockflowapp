import { supabase, isSupabaseConfigured } from './supabase';
import type {
  ReconciliationConflict,
  ConflictScope,
  ReconciliationConflictSeverity,
  ReconciliationConflictType,
  ReconciliationDecision,
  ReconciliationDecisionType,
  ReconciliationDecisionValue,
  ReconciliationEvidence,
  ReconciliationEvidenceType,
  ReconciliationGateEvaluation,
  ReconciliationOperationResult,
  ReconciliationReviewState,
  ReconciliationSourceSnapshot,
} from '../types/reconciliation';

const requireSupabase = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured or connected.');
  }
  return supabase;
};

const errorMessage = (error: { message: string } | null): string =>
  error?.message || 'Reconciliation database request failed.';

export interface ReconciliationReviewFilters {
  reviewScope?: ReconciliationReviewState['review_scope'];
  coverageState?: ReconciliationReviewState['coverage_state'];
  identityState?: ReconciliationReviewState['derived_identity_state'];
  gateState?: ReconciliationGateEvaluation['gate_state'];
}

export class ReconciliationRepository {
  public static async listReviews(filters: ReconciliationReviewFilters = {}): Promise<ReconciliationOperationResult<ReconciliationReviewState[]>> {
    try {
      let query = requireSupabase().from('reconciliation_review_state').select('*');
      if (filters.reviewScope) query = query.eq('review_scope', filters.reviewScope);
      if (filters.coverageState) query = query.eq('coverage_state', filters.coverageState);
      if (filters.identityState) query = query.eq('derived_identity_state', filters.identityState);
      const { data, error } = await query.order('review_id', { ascending: true });
      if (error) return { success: false, error: errorMessage(error) };
      return { success: true, data: (data || []) as ReconciliationReviewState[] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  public static async getReview(reviewId: string): Promise<ReconciliationOperationResult<ReconciliationReviewState>> {
    try {
      const { data, error } = await requireSupabase()
        .from('reconciliation_review_state').select('*').eq('review_id', reviewId).maybeSingle();
      if (error) return { success: false, error: errorMessage(error) };
      if (!data) return { success: false, error: 'Reconciliation review not found.' };
      return { success: true, data: data as ReconciliationReviewState };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  public static async getReviewSnapshots(reviewId: string): Promise<ReconciliationOperationResult<{
    review: ReconciliationReviewState;
    local: ReconciliationSourceSnapshot | null;
    supabase: ReconciliationSourceSnapshot | null;
  }>> {
    const reviewResult = await this.getReview(reviewId);
    if (!reviewResult.success || !reviewResult.data) return { success: false, error: reviewResult.error };
    const review = reviewResult.data;
    const ids = [review.local_snapshot_id, review.supabase_snapshot_id].filter((id): id is string => Boolean(id));
    if (ids.length === 0) return { success: true, data: { review, local: null, supabase: null } };
    const { data, error } = await requireSupabase().from('reconciliation_source_snapshots').select('*').in('snapshot_id', ids);
    if (error) return { success: false, error: errorMessage(error) };
    const rows = (data || []) as ReconciliationSourceSnapshot[];
    return {
      success: true,
      data: {
        review,
        local: rows.find((row) => row.snapshot_id === review.local_snapshot_id) || null,
        supabase: rows.find((row) => row.snapshot_id === review.supabase_snapshot_id) || null,
      },
    };
  }

  public static async listDecisions(reviewId: string): Promise<ReconciliationOperationResult<ReconciliationDecision[]>> {
    const { data, error } = await requireSupabase().from('reconciliation_decisions').select('*')
      .eq('review_id', reviewId).order('created_at', { ascending: true });
    if (error) return { success: false, error: errorMessage(error) };
    return { success: true, data: (data || []) as ReconciliationDecision[] };
  }

  public static async getCurrentDecisions(reviewId?: string): Promise<ReconciliationOperationResult<ReconciliationDecision[]>> {
    const { data, error } = await requireSupabase().rpc('reconciliation_current_decisions', { p_review_id: reviewId || null });
    if (error) return { success: false, error: errorMessage(error) };
    return { success: true, data: (data || []) as ReconciliationDecision[] };
  }


  public static async appendDecision(input: {
    reviewId: string;
    decisionType: ReconciliationDecisionType;
    decisionStatus: 'COMPLETED' | 'NOT_APPLICABLE';
    decisionValue: ReconciliationDecisionValue | null;
    decisionNote?: string | null;
  }): Promise<ReconciliationOperationResult<string>> {
    const { data, error } = await requireSupabase().rpc('append_reconciliation_decision', {
      p_review_id: input.reviewId,
      p_decision_type: input.decisionType,
      p_decision_status: input.decisionStatus,
      p_decision_value: input.decisionValue,
      p_decision_note: input.decisionNote || null,
    });
    if (error) return { success: false, error: errorMessage(error) };
    return { success: true, data: data as string };
  }

  public static async appendEvidence(input: {
    reviewId: string;
    decisionId?: string | null;
    evidenceType: ReconciliationEvidenceType;
    description: string;
    referenceText?: string | null;
    attachmentReference?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<ReconciliationOperationResult<string>> {
    const { data, error } = await requireSupabase().rpc('append_reconciliation_evidence', {
      p_review_id: input.reviewId,
      p_decision_id: input.decisionId || null,
      p_evidence_type: input.evidenceType,
      p_description: input.description,
      p_reference_text: input.referenceText || null,
      p_attachment_reference: input.attachmentReference || null,
      p_evidence_metadata: input.metadata || null,
    });
    if (error) return { success: false, error: errorMessage(error) };
    return { success: true, data: data as string };
  }

  public static async getConflict(conflictId: string): Promise<ReconciliationOperationResult<ReconciliationConflict>> {
    const { data, error } = await requireSupabase().from('reconciliation_conflicts').select('*')
      .eq('conflict_id', conflictId).maybeSingle();
    if (error) return { success: false, error: errorMessage(error) };
    if (!data) return { success: false, error: 'Reconciliation conflict not found.' };
    return { success: true, data: data as ReconciliationConflict };
  }

  public static async listEvidence(reviewId: string): Promise<ReconciliationOperationResult<ReconciliationEvidence[]>> {
    const { data, error } = await requireSupabase().from('reconciliation_evidence').select('*')
      .eq('review_id', reviewId).order('captured_at', { ascending: true });
    if (error) return { success: false, error: errorMessage(error) };
    return { success: true, data: (data || []) as ReconciliationEvidence[] };
  }

  public static async listConflicts(reviewId: string): Promise<ReconciliationOperationResult<ReconciliationConflict[]>> {
    const { data, error } = await requireSupabase().from('reconciliation_conflicts').select('*')
      .eq('review_id', reviewId).order('created_at', { ascending: true });
    if (error) return { success: false, error: errorMessage(error) };
    return { success: true, data: (data || []) as ReconciliationConflict[] };
  }

  public static async appendConflict(input: {
    reviewId: string;
    conflictType: ReconciliationConflictType;
    conflictScope: ConflictScope;
    severity: ReconciliationConflictSeverity;
    description: string;
    localObservedValue?: unknown;
    supabaseObservedValue?: unknown;
  }): Promise<ReconciliationOperationResult<string>> {
    const { data, error } = await requireSupabase().rpc('append_reconciliation_conflict', {
      p_review_id: input.reviewId,
      p_conflict_type: input.conflictType,
      p_conflict_scope: input.conflictScope,
      p_severity: input.severity,
      p_description: input.description,
      p_local_observed_value: input.localObservedValue ?? null,
      p_supabase_observed_value: input.supabaseObservedValue ?? null,
    });
    if (error) return { success: false, error: errorMessage(error) };
    return { success: true, data: data as string };
  }

  public static async resolveConflict(conflictId: string, resolutionDecisionId: string): Promise<ReconciliationOperationResult> {
    const { error } = await requireSupabase().rpc('resolve_reconciliation_conflict', {
      p_conflict_id: conflictId,
      p_resolution_decision_id: resolutionDecisionId,
    });
    return error ? { success: false, error: errorMessage(error) } : { success: true };
  }

  public static async listGateEvaluations(reviewId?: string): Promise<ReconciliationOperationResult<ReconciliationGateEvaluation[]>> {
    let query = requireSupabase().from('reconciliation_gate_evaluations').select('*');
    if (reviewId) query = query.eq('review_id', reviewId);
    const { data, error } = await query.order('evaluated_at', { ascending: false });
    if (error) return { success: false, error: errorMessage(error) };
    return { success: true, data: (data || []) as ReconciliationGateEvaluation[] };
  }

  public static async evaluateReviewGate(reviewId: string): Promise<ReconciliationOperationResult<string>> {
    const { data, error } = await requireSupabase().rpc('evaluate_reconciliation_review_gate', { p_review_id: reviewId });
    if (error) return { success: false, error: errorMessage(error) };
    return { success: true, data: data as string };
  }

  public static async evaluateCatalogSyncReady(): Promise<ReconciliationOperationResult<string>> {
    const { data, error } = await requireSupabase().rpc('evaluate_catalog_sync_ready');
    if (error) return { success: false, error: errorMessage(error) };
    return { success: true, data: data as string };
  }
}