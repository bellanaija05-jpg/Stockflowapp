import { supabase, isSupabaseConfigured } from '../db/supabase';
import { ReconciliationRepository, type ReconciliationReviewFilters } from '../db/reconciliationRepository';
import type {
  AppendBusinessDecisionInput,
  ConflictScope,
  ReconciliationConflictType,
  ReconciliationDecisionType,
  ReconciliationDecisionValue,
  ReconciliationOperationResult,
  ReconciliationReviewDisposition,
  ReconciliationReviewScope,
  ReconciliationReviewState,
  ProductStatusDecisionValue,
} from '../types/reconciliation';

const decisionTypes = new Set<ReconciliationDecisionType>([
  'IDENTITY', 'SKU', 'BARCODE', 'SELLING_PRICE', 'COST_PRICE', 'CATEGORY', 'STATUS',
  'BRAND', 'MODEL', 'VARIANT', 'DESCRIPTION', 'INVENTORY_TREATMENT',
  'SALES_HISTORY_TREATMENT', 'LOCAL_ONLY_TREATMENT', 'SUPABASE_ONLY_TREATMENT',
  'REVIEW_DISPOSITION',
]);

const textDecisionTypes = new Set<ReconciliationDecisionType>([
  'SKU', 'BARCODE', 'CATEGORY', 'STATUS', 'BRAND', 'MODEL', 'VARIANT', 'DESCRIPTION',
]);
const pairDecisionTypes = new Set<ReconciliationDecisionType>([
  'IDENTITY', 'SKU', 'BARCODE', 'SELLING_PRICE', 'COST_PRICE', 'CATEGORY', 'STATUS',
  'BRAND', 'MODEL', 'VARIANT', 'DESCRIPTION', 'INVENTORY_TREATMENT',
  'SALES_HISTORY_TREATMENT', 'REVIEW_DISPOSITION',
]);
const localOnlyDecisionTypes = new Set<ReconciliationDecisionType>([
  'LOCAL_ONLY_TREATMENT', 'INVENTORY_TREATMENT', 'SALES_HISTORY_TREATMENT', 'REVIEW_DISPOSITION',
]);
const supabaseOnlyDecisionTypes = new Set<ReconciliationDecisionType>([
  'SUPABASE_ONLY_TREATMENT', 'INVENTORY_TREATMENT', 'SALES_HISTORY_TREATMENT', 'REVIEW_DISPOSITION',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);
const isEnum = (value: unknown, values: readonly string[]): boolean =>
  typeof value === 'string' && values.includes(value);
const conflictScopesByType: Record<string, readonly string[]> = {
  SAME_SKU_DIFFERENT_BARCODE: ['BARCODE'],
  SAME_NAME_DIFFERENT_PHYSICAL_FORM: ['PHYSICAL_FORM'],
  DIFFERENT_CONNECTOR: ['CONNECTOR'],
  DIFFERENT_CAPACITY: ['CAPACITY'],
  DIFFERENT_FORM_FACTOR: ['FORM_FACTOR'],
  CONFLICTING_CATEGORY: ['CATEGORY'],
  CONFLICTING_STATUS: ['STATUS'],
  UNRESOLVED_PRICE: ['SELLING_PRICE', 'COST_PRICE'],
  UNRESOLVED_BARCODE: ['BARCODE'],
  MISSING_METADATA: ['BRAND', 'MODEL', 'VARIANT', 'DESCRIPTION'],
  UNRESOLVED_INVENTORY_TREATMENT: ['INVENTORY_TREATMENT'],
  UNRESOLVED_SALES_HISTORY_TREATMENT: ['SALES_HISTORY_TREATMENT'],
};

const physicalResolutionTypesByType: Record<string, readonly string[]> = {
  SAME_NAME_DIFFERENT_PHYSICAL_FORM: ['MODEL', 'VARIANT', 'DESCRIPTION'],
  DIFFERENT_CONNECTOR: ['VARIANT', 'DESCRIPTION'],
  DIFFERENT_CAPACITY: ['VARIANT', 'DESCRIPTION'],
  DIFFERENT_FORM_FACTOR: ['MODEL', 'VARIANT', 'DESCRIPTION'],
};

const validateConflictResolution = (
  conflictType: ReconciliationConflictType,
  conflictScope: ConflictScope,
  identity: ReconciliationReviewState['derived_identity_state'],
  decisionType: ReconciliationDecisionType,
  decisionValue: ReconciliationDecisionValue | null,
): string | null => {
  if (decisionType === 'REVIEW_DISPOSITION') return 'REVIEW_DISPOSITION cannot resolve a product-data conflict.';
  if (!conflictScopesByType[conflictType]?.includes(conflictScope)) {
    return `${conflictType} is not valid with conflict scope ${conflictScope}.`;
  }
  if (['UNRESOLVED_INVENTORY_TREATMENT', 'UNRESOLVED_SALES_HISTORY_TREATMENT'].includes(conflictType)) {
    return decisionType === (conflictType === 'UNRESOLVED_INVENTORY_TREATMENT' ? 'INVENTORY_TREATMENT' : 'SALES_HISTORY_TREATMENT')
      ? null
      : 'Operational conflict requires its matching treatment decision.';
  }
  if (identity === 'CONFIRMED_DIFFERENT') {
    const canResolveByIdentity = conflictType === 'SAME_SKU_DIFFERENT_BARCODE'
      || conflictType === 'UNRESOLVED_BARCODE'
      || conflictType === 'SAME_NAME_DIFFERENT_PHYSICAL_FORM'
      || conflictType === 'DIFFERENT_CONNECTOR'
      || conflictType === 'DIFFERENT_CAPACITY'
      || conflictType === 'DIFFERENT_FORM_FACTOR';
    return canResolveByIdentity && decisionType === 'IDENTITY' && decisionValue === 'CONFIRMED_DIFFERENT'
      ? null
      : 'A confirmed-different identity decision may resolve only barcode or physical conflicts.';
  }
  if (identity !== 'CONFIRMED_SAME') return 'Identity must be resolved before this conflict can be resolved.';
  if (['SAME_SKU_DIFFERENT_BARCODE', 'UNRESOLVED_BARCODE'].includes(conflictType)) {
    return decisionType === 'BARCODE' ? null : 'Barcode conflict requires a BARCODE decision.';
  }
  if (conflictType === 'CONFLICTING_CATEGORY') return decisionType === 'CATEGORY' ? null : 'Category conflict requires a CATEGORY decision.';
  if (conflictType === 'CONFLICTING_STATUS') return decisionType === 'STATUS' ? null : 'Status conflict requires a STATUS decision.';
  if (conflictType === 'UNRESOLVED_PRICE') return decisionType === conflictScope ? null : 'Price conflict requires the matching price decision.';
  if (conflictType === 'MISSING_METADATA') return decisionType === conflictScope ? null : 'Metadata conflict requires the matching metadata decision.';
  if (physicalResolutionTypesByType[conflictType]) {
    return physicalResolutionTypesByType[conflictType].includes(decisionType)
      ? null
      : 'Physical conflict requires a compatible model, variant, or description decision.';
  }
  return 'Conflict resolution decision is not compatible with the conflict.';
};

const validateConflict = (input: Parameters<typeof ReconciliationRepository.appendConflict>[0]): string | null => {
  if (!input.reviewId.trim() || !input.conflictType || !input.conflictScope || !input.severity || !input.description.trim()) {
    return 'Conflict review ID, type, scope, severity, and description are required.';
  }
  const validScopes = conflictScopesByType[input.conflictType];
  if (!validScopes?.includes(input.conflictScope)) return `${input.conflictType} is not valid with conflict scope ${input.conflictScope}.`;
  return null;
};

const hasExactKeys = (value: Record<string, unknown>, keys: string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
const validateTreatment = (type: ReconciliationDecisionType, value: unknown): string | null => {
  if (!isRecord(value)) return `${type} requires a structured object value.`;
  if (type === 'INVENTORY_TREATMENT') {
    if (!hasExactKeys(value, ['action', 'source_product_reference', 'target_product_reference', 'operational_scope', 'store_ids', 'quantity_handling', 'movement_handling', 'transfer_handling', 'adjustment_handling', 'reason'])) return 'INVENTORY_TREATMENT has an invalid shape.';
    if (!isEnum(value.action, ['KEEP_REFERENCE_AND_QUANTITY', 'REASSIGN_REFERENCE_PRESERVE_QUANTITY', 'PRESERVE_HISTORICAL_MOVEMENTS_ONLY', 'REQUIRE_MANUAL_STOCK_RECONCILIATION']) || !isNonEmptyString(value.source_product_reference) || !isNonEmptyString(value.reason)) return 'Invalid INVENTORY_TREATMENT value.';
    if (value.target_product_reference !== null && !isNonEmptyString(value.target_product_reference)) return 'Invalid INVENTORY_TREATMENT target reference.';
    if (!isEnum(value.operational_scope, ['ALL_INVENTORY_ROWS', 'SELECTED_STORES']) || !isStringArray(value.store_ids)) return 'Invalid INVENTORY_TREATMENT scope.';
    if (value.operational_scope === 'ALL_INVENTORY_ROWS' ? value.store_ids.length !== 0 : value.store_ids.length === 0) return 'INVENTORY_TREATMENT scope and store_ids disagree.';
    if (!isEnum(value.quantity_handling, ['PRESERVE', 'REQUIRES_RECONCILIATION', 'NOT_APPLICABLE']) || !isEnum(value.movement_handling, ['PRESERVE_HISTORY', 'REQUIRES_MANUAL_REVIEW', 'NO_OPERATION']) || !isEnum(value.transfer_handling, ['PRESERVE_REFERENCES', 'REQUIRES_MANUAL_REVIEW', 'NO_RELATED_TRANSFERS']) || !isEnum(value.adjustment_handling, ['PRESERVE_HISTORY', 'REQUIRES_MANUAL_REVIEW', 'NO_RELATED_ADJUSTMENTS'])) return 'Invalid INVENTORY_TREATMENT handling value.';
    if (value.action === 'REASSIGN_REFERENCE_PRESERVE_QUANTITY' && value.target_product_reference === null) return 'REASSIGN_REFERENCE_PRESERVE_QUANTITY requires a target reference.';
    if (value.action !== 'REASSIGN_REFERENCE_PRESERVE_QUANTITY' && value.target_product_reference === '') return 'INVENTORY_TREATMENT target reference cannot be empty.';
  } else if (type === 'SALES_HISTORY_TREATMENT') {
    if (!hasExactKeys(value, ['action', 'source_product_reference', 'target_product_reference', 'sale_scope', 'sale_ids', 'sale_item_ids', 'product_name_handling', 'sku_handling', 'unit_price_handling', 'line_total_handling', 'receipt_handling', 'reason'])) return 'SALES_HISTORY_TREATMENT has an invalid shape.';
    if (!isEnum(value.action, ['PRESERVE_HISTORICAL_RECORDS', 'DISPLAY_MAPPING_ONLY', 'REASSIGN_REFERENCE_PRESERVE_HISTORICAL_VALUES', 'REQUIRE_MANUAL_SALES_REVIEW']) || !isNonEmptyString(value.source_product_reference) || !isNonEmptyString(value.reason)) return 'Invalid SALES_HISTORY_TREATMENT value.';
    if (value.target_product_reference !== null && !isNonEmptyString(value.target_product_reference)) return 'Invalid SALES_HISTORY_TREATMENT target reference.';
    if (['DISPLAY_MAPPING_ONLY', 'REASSIGN_REFERENCE_PRESERVE_HISTORICAL_VALUES'].includes(value.action as string)
      ? value.target_product_reference === null
      : value.target_product_reference !== null) return 'Invalid SALES_HISTORY_TREATMENT target reference.';
    if (value.action === 'DISPLAY_MAPPING_ONLY' && value.target_product_reference === null) return 'DISPLAY_MAPPING_ONLY requires a target reference.';
    if (value.action === 'REASSIGN_REFERENCE_PRESERVE_HISTORICAL_VALUES' && value.target_product_reference === null) return 'REASSIGN_REFERENCE_PRESERVE_HISTORICAL_VALUES requires a target reference.';
    if (!isEnum(value.sale_scope, ['ALL_SALES', 'SELECTED_SALES']) || !isStringArray(value.sale_ids) || !isStringArray(value.sale_item_ids)) return 'Invalid SALES_HISTORY_TREATMENT scope or IDs.';
    if (value.sale_scope === 'ALL_SALES' ? value.sale_ids.length + value.sale_item_ids.length !== 0 : value.sale_ids.length + value.sale_item_ids.length === 0) return 'SALES_HISTORY_TREATMENT scope and IDs disagree.';
    if (!isEnum(value.product_name_handling, ['PRESERVE', 'DISPLAY_MAPPING']) || !isEnum(value.sku_handling, ['PRESERVE', 'DISPLAY_MAPPING']) || !isEnum(value.unit_price_handling, ['PRESERVE', 'REQUIRE_REVIEW']) || !isEnum(value.line_total_handling, ['PRESERVE', 'REQUIRE_REVIEW']) || !isEnum(value.receipt_handling, ['PRESERVE', 'DISPLAY_MAPPING'])) return 'Invalid SALES_HISTORY_TREATMENT handling value.';
  } else if (type === 'LOCAL_ONLY_TREATMENT') {
    if (!hasExactKeys(value, ['action', 'source_product_reference', 'target_product_reference', 'operational_scope', 'reason']) || !isEnum(value.action, ['CREATE_IN_SUPABASE_LATER', 'INTENTIONALLY_ABSENT', 'REQUIRES_INVESTIGATION']) || !isNonEmptyString(value.source_product_reference) || value.target_product_reference !== null || value.operational_scope !== 'LOCAL_CATALOG_ONLY' || !isNonEmptyString(value.reason)) return 'Invalid LOCAL_ONLY_TREATMENT value.';
  } else if (type === 'SUPABASE_ONLY_TREATMENT') {
    if (!hasExactKeys(value, ['action', 'source_product_reference', 'target_local_product_reference', 'operational_scope', 'reason'])
      || !isEnum(value.action, ['KEEP_SUPABASE_ONLY', 'MATCH_TO_FUTURE_LOCAL_REVIEW', 'INTENTIONALLY_SEPARATE', 'REQUIRES_INVESTIGATION'])
      || !isNonEmptyString(value.source_product_reference)
      || (value.action === 'MATCH_TO_FUTURE_LOCAL_REVIEW' ? !isNonEmptyString(value.target_local_product_reference) : value.target_local_product_reference !== null)
      || value.operational_scope !== 'SUPABASE_CATALOG_ONLY'
      || !isNonEmptyString(value.reason)) return 'Invalid SUPABASE_ONLY_TREATMENT value.';
  }
  return null;
};

export class CatalogReconciliationService {
  private static async requireActiveAdmin(): Promise<ReconciliationOperationResult<{ id: string }>> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Supabase is not configured or connected.' };
    }
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) return { success: false, error: sessionError.message };
    const userId = sessionData.session?.user?.id;
    if (!userId) return { success: false, error: 'Authentication required.' };

    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, status')
      .eq('id', userId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data || data.role !== 'ADMIN' || data.status !== 'ACTIVE') {
      return { success: false, error: 'Only active Super Admins may access reconciliation.' };
    }
    return { success: true, data: { id: userId } };
  }

  private static validateDecision(
    input: AppendBusinessDecisionInput,
    reviewScope?: ReconciliationReviewScope,
    currentIdentity?: ReconciliationReviewState['derived_identity_state'],
  ): string | null {
    if (!decisionTypes.has(input.decisionType)) return 'Invalid reconciliation decision type.';
    if (input.decisionStatus !== 'COMPLETED' && input.decisionStatus !== 'NOT_APPLICABLE') {
      return 'Decision status must be COMPLETED or NOT_APPLICABLE.';
    }
    if (!input.reviewId.trim()) return 'Review ID is required.';
    if (reviewScope) {
      const allowed = reviewScope === 'CANDIDATE_PAIR' || reviewScope === 'EXACT_SKU'
        ? pairDecisionTypes
        : reviewScope === 'LOCAL_ONLY' ? localOnlyDecisionTypes : supabaseOnlyDecisionTypes;
      if (!allowed.has(input.decisionType)) return `Decision type ${input.decisionType} is not valid for ${reviewScope}.`;
    }
    if (input.decisionStatus === 'COMPLETED' && input.decisionValue == null) {
      return 'COMPLETED decisions require a decision value.';
    }
    if (input.decisionStatus === 'NOT_APPLICABLE') {
      if (input.decisionValue !== null) return 'NOT_APPLICABLE decisions must have a null decision value.';
      if (!input.decisionNote?.trim()) return 'NOT_APPLICABLE decisions require an explanatory note.';
      if (['IDENTITY', 'REVIEW_DISPOSITION', 'LOCAL_ONLY_TREATMENT', 'SUPABASE_ONLY_TREATMENT'].includes(input.decisionType)) {
        return `${input.decisionType} cannot be NOT_APPLICABLE.`;
      }
      return null;
    }
    if (input.decisionType === 'IDENTITY' && !['NEEDS_VERIFICATION', 'CONFIRMED_SAME', 'CONFIRMED_DIFFERENT'].includes(String(input.decisionValue))) {
      return 'IDENTITY requires NEEDS_VERIFICATION, CONFIRMED_SAME, or CONFIRMED_DIFFERENT.';
    }
    if (input.decisionType === 'REVIEW_DISPOSITION') {
      if (!['ACTIVE', 'DEFERRED'].includes(String(input.decisionValue))) return 'REVIEW_DISPOSITION requires ACTIVE or DEFERRED.';
      if (input.decisionValue === 'DEFERRED' && !input.decisionNote?.trim()) return 'DEFERRED disposition requires a reason.';
    }
    if (input.decisionType === 'STATUS' && !isEnum(input.decisionValue, ['ACTIVE', 'INACTIVE', 'DISCONTINUED'] as ProductStatusDecisionValue[])) {
      return 'STATUS requires ACTIVE, INACTIVE, or DISCONTINUED.';
    }
    if (textDecisionTypes.has(input.decisionType) && !isNonEmptyString(input.decisionValue)) {
      return `${input.decisionType} requires a trimmed, non-empty string value.`;
    }
    if (['SELLING_PRICE', 'COST_PRICE'].includes(input.decisionType)) {
      if (typeof input.decisionValue !== 'number' || !Number.isFinite(input.decisionValue) || input.decisionValue < 0 || input.decisionValue > 9999999999.99
          || Math.abs(input.decisionValue * 100 - Math.round(input.decisionValue * 100)) > 1e-8) {
        return `${input.decisionType} requires a finite, non-negative NUMERIC(12,2) value.`;
      }
    }
    if (['INVENTORY_TREATMENT', 'SALES_HISTORY_TREATMENT', 'LOCAL_ONLY_TREATMENT', 'SUPABASE_ONLY_TREATMENT'].includes(input.decisionType)) {
      const treatmentError = validateTreatment(input.decisionType, input.decisionValue);
      if (treatmentError) return treatmentError;
      if (input.decisionType === 'INVENTORY_TREATMENT' && isRecord(input.decisionValue)
        && input.decisionValue.action === 'REASSIGN_REFERENCE_PRESERVE_QUANTITY'
        && currentIdentity !== 'CONFIRMED_SAME') {
        return 'REASSIGN_REFERENCE_PRESERVE_QUANTITY requires current identity CONFIRMED_SAME.';
      }
    }
    return null;
  }

  public static async loadReviewQueue(filters: ReconciliationReviewFilters = {}) {
    const admin = await this.requireActiveAdmin();
    return admin.success ? ReconciliationRepository.listReviews(filters) : admin;
  }

  public static async loadReviewDetail(reviewId: string) {
    const admin = await this.requireActiveAdmin();
    return admin.success ? ReconciliationRepository.getReviewSnapshots(reviewId) : admin;
  }

  public static async loadDecisionHistory(reviewId: string) {
    const admin = await this.requireActiveAdmin();
    return admin.success ? ReconciliationRepository.listDecisions(reviewId) : admin;
  }

  public static async appendBusinessDecision(input: AppendBusinessDecisionInput) {
    const admin = await this.requireActiveAdmin();
    if (!admin.success) return admin;
    const reviewResult = await ReconciliationRepository.getReview(input.reviewId);
    if (!reviewResult.success || !reviewResult.data) return reviewResult;
    const validationError = this.validateDecision(input, reviewResult.data.review_scope, reviewResult.data.derived_identity_state);
    if (validationError) return { success: false, error: validationError };
    return ReconciliationRepository.appendDecision(input);
  }

  public static async appendReviewDisposition(
    reviewId: string,
    disposition: ReconciliationReviewDisposition,
    note?: string | null,
  ) {
    return this.appendBusinessDecision({
      reviewId,
      decisionType: 'REVIEW_DISPOSITION',
      decisionStatus: 'COMPLETED',
      decisionValue: disposition,
      decisionNote: note,
    });
  }

  public static async appendEvidence(input: Parameters<typeof ReconciliationRepository.appendEvidence>[0]) {
    const admin = await this.requireActiveAdmin();
    if (!admin.success) return { success: false, error: admin.error };
    return ReconciliationRepository.appendEvidence(input);
  }

  public static async appendConflict(input: Parameters<typeof ReconciliationRepository.appendConflict>[0]) {
    const validationError = validateConflict(input);
    if (validationError) return { success: false, error: validationError };
    const admin = await this.requireActiveAdmin();
    if (!admin.success) return { success: false, error: admin.error };
    return ReconciliationRepository.appendConflict(input);
  }

  public static async resolveConflict(conflictId: string, resolutionDecisionId: string) {
    const admin = await this.requireActiveAdmin();
    if (!admin.success) return { success: false, error: admin.error };
    const conflictResult = await ReconciliationRepository.getConflict(conflictId);
    if (!conflictResult.success || !conflictResult.data) return { success: false, error: conflictResult.error || 'Conflict not found.' };
    const reviewResult = await ReconciliationRepository.getReview(conflictResult.data.review_id);
    if (!reviewResult.success || !reviewResult.data) return { success: false, error: reviewResult.error || 'Review not found.' };
    const decisionsResult = await ReconciliationRepository.getCurrentDecisions(conflictResult.data.review_id);
    if (!decisionsResult.success) return { success: false, error: decisionsResult.error };
    const currentDecisions = decisionsResult.data ?? [];
    const resolution = currentDecisions.find((decision) => decision.decision_id === resolutionDecisionId);
    if (!resolution) return { success: false, error: 'Conflict resolution requires the current decision leaf.' };
    const identity = currentDecisions.find((decision) => decision.decision_type === 'IDENTITY');
    const identityState = identity?.decision_value === 'CONFIRMED_SAME'
      ? 'CONFIRMED_SAME'
      : identity?.decision_value === 'CONFIRMED_DIFFERENT'
        ? 'CONFIRMED_DIFFERENT'
        : identity?.decision_value === 'NEEDS_VERIFICATION' ? 'NEEDS_VERIFICATION' : null;
    const fullDecisionValidation = this.validateDecision({
      reviewId: conflictResult.data.review_id,
      decisionType: resolution.decision_type,
      decisionStatus: resolution.decision_status,
      decisionValue: resolution.decision_value,
      decisionNote: resolution.decision_note,
    } as AppendBusinessDecisionInput, reviewResult.data.review_scope, identityState);
    if (fullDecisionValidation) return { success: false, error: fullDecisionValidation };
    const validationError = validateConflictResolution(
      conflictResult.data.conflict_type,
      conflictResult.data.conflict_scope,
      identityState,
      resolution.decision_type,
      resolution.decision_value,
    );
    if (validationError) return { success: false, error: validationError };
    return ReconciliationRepository.resolveConflict(conflictId, resolutionDecisionId);
  }

  public static async evaluateReviewGate(reviewId: string) {
    const admin = await this.requireActiveAdmin();
    if (!admin.success) return { success: false, error: admin.error };
    return ReconciliationRepository.evaluateReviewGate(reviewId);
  }

  public static async evaluateCatalogSyncReady() {
    const admin = await this.requireActiveAdmin();
    if (!admin.success) return { success: false, error: admin.error };
    return ReconciliationRepository.evaluateCatalogSyncReady();
  }
}