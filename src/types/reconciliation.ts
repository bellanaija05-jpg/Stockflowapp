export type ReconciliationReviewScope =
  | 'CANDIDATE_PAIR'
  | 'EXACT_SKU'
  | 'LOCAL_ONLY'
  | 'SUPABASE_ONLY';

export type ReconciliationCoverageState =
  | 'PAIRED'
  | 'UNMATCHED_LOCAL'
  | 'UNMATCHED_SUPABASE';

export type ReconciliationIdentityState =
  | 'PENDING'
  | 'CONFIRMED_SAME'
  | 'CONFIRMED_DIFFERENT'
  | 'NEEDS_VERIFICATION'
  | null;

export type ReconciliationReviewDisposition = 'ACTIVE' | 'DEFERRED';
export type IdentityDecisionValue = 'NEEDS_VERIFICATION' | 'CONFIRMED_SAME' | 'CONFIRMED_DIFFERENT';
export type ReconciliationDecisionStatus = 'COMPLETED' | 'NOT_APPLICABLE';
export type DecisionStatus = ReconciliationDecisionStatus;
export type ReconciliationConflictScope = ConflictScope;
export type ProductStatusDecisionValue = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';

export type InventoryTreatmentAction =
  | 'KEEP_REFERENCE_AND_QUANTITY'
  | 'REASSIGN_REFERENCE_PRESERVE_QUANTITY'
  | 'PRESERVE_HISTORICAL_MOVEMENTS_ONLY'
  | 'REQUIRE_MANUAL_STOCK_RECONCILIATION';

export interface InventoryTreatmentValue {
  action: InventoryTreatmentAction;
  source_product_reference: string;
  target_product_reference: string | null;
  operational_scope: 'ALL_INVENTORY_ROWS' | 'SELECTED_STORES';
  store_ids: string[];
  quantity_handling: 'PRESERVE' | 'REQUIRES_RECONCILIATION' | 'NOT_APPLICABLE';
  movement_handling: 'PRESERVE_HISTORY' | 'REQUIRES_MANUAL_REVIEW' | 'NO_OPERATION';
  transfer_handling: 'PRESERVE_REFERENCES' | 'REQUIRES_MANUAL_REVIEW' | 'NO_RELATED_TRANSFERS';
  adjustment_handling: 'PRESERVE_HISTORY' | 'REQUIRES_MANUAL_REVIEW' | 'NO_RELATED_ADJUSTMENTS';
  reason: string;
}

export type SalesHistoryTreatmentAction =
  | 'PRESERVE_HISTORICAL_RECORDS'
  | 'DISPLAY_MAPPING_ONLY'
  | 'REASSIGN_REFERENCE_PRESERVE_HISTORICAL_VALUES'
  | 'REQUIRE_MANUAL_SALES_REVIEW';

export interface SalesHistoryTreatmentValue {
  action: SalesHistoryTreatmentAction;
  source_product_reference: string;
  target_product_reference: string | null;
  sale_scope: 'ALL_SALES' | 'SELECTED_SALES';
  sale_ids: string[];
  sale_item_ids: string[];
  product_name_handling: 'PRESERVE' | 'DISPLAY_MAPPING';
  sku_handling: 'PRESERVE' | 'DISPLAY_MAPPING';
  unit_price_handling: 'PRESERVE' | 'REQUIRE_REVIEW';
  line_total_handling: 'PRESERVE' | 'REQUIRE_REVIEW';
  receipt_handling: 'PRESERVE' | 'DISPLAY_MAPPING';
  reason: string;
}

export interface LocalOnlyTreatmentValue {
  action: 'CREATE_IN_SUPABASE_LATER' | 'INTENTIONALLY_ABSENT' | 'REQUIRES_INVESTIGATION';
  source_product_reference: string;
  target_product_reference: null;
  operational_scope: 'LOCAL_CATALOG_ONLY';
  reason: string;
}

export interface SupabaseOnlyTreatmentValue {
  action:
    | 'KEEP_SUPABASE_ONLY'
    | 'MATCH_TO_FUTURE_LOCAL_REVIEW'
    | 'INTENTIONALLY_SEPARATE'
    | 'REQUIRES_INVESTIGATION';
  source_product_reference: string;
  target_local_product_reference: string | null;
  operational_scope: 'SUPABASE_CATALOG_ONLY';
  reason: string;
}

export type ReconciliationTreatmentValue =
  | InventoryTreatmentValue
  | SalesHistoryTreatmentValue
  | LocalOnlyTreatmentValue
  | SupabaseOnlyTreatmentValue;

export type ReconciliationDecisionValue =
  | string
  | number
  | IdentityDecisionValue
  | ReconciliationReviewDisposition
  | ProductStatusDecisionValue
  | ReconciliationTreatmentValue;

export type ReconciliationCompletedDecisionInput =
  | { decisionType: 'IDENTITY'; decisionValue: IdentityDecisionValue }
  | { decisionType: 'SKU'; decisionValue: string }
  | { decisionType: 'BARCODE'; decisionValue: string }
  | { decisionType: 'SELLING_PRICE'; decisionValue: number }
  | { decisionType: 'COST_PRICE'; decisionValue: number }
  | { decisionType: 'CATEGORY'; decisionValue: string }
  | { decisionType: 'STATUS'; decisionValue: ProductStatusDecisionValue }
  | { decisionType: 'BRAND'; decisionValue: string }
  | { decisionType: 'MODEL'; decisionValue: string }
  | { decisionType: 'VARIANT'; decisionValue: string }
  | { decisionType: 'DESCRIPTION'; decisionValue: string }
  | { decisionType: 'INVENTORY_TREATMENT'; decisionValue: InventoryTreatmentValue }
  | { decisionType: 'SALES_HISTORY_TREATMENT'; decisionValue: SalesHistoryTreatmentValue }
  | { decisionType: 'LOCAL_ONLY_TREATMENT'; decisionValue: LocalOnlyTreatmentValue }
  | { decisionType: 'SUPABASE_ONLY_TREATMENT'; decisionValue: SupabaseOnlyTreatmentValue }
  | { decisionType: 'REVIEW_DISPOSITION'; decisionValue: ReconciliationReviewDisposition };

export type ReconciliationNotApplicableDecisionInput = {
  decisionType: Exclude<ReconciliationDecisionType, 'IDENTITY' | 'REVIEW_DISPOSITION' | 'LOCAL_ONLY_TREATMENT' | 'SUPABASE_ONLY_TREATMENT'>;
  decisionStatus: 'NOT_APPLICABLE';
  decisionValue: null;
  decisionNote: string;
};

export type AppendBusinessDecisionInput =
  | (ReconciliationCompletedDecisionInput & {
      reviewId: string;
      decisionStatus: 'COMPLETED';
      decisionNote?: string | null;
    })
  | (ReconciliationNotApplicableDecisionInput & { reviewId: string });

export type ReconciliationConflictResolution = {
  decisionType: 'IDENTITY' | 'BARCODE' | 'SELLING_PRICE' | 'COST_PRICE'
    | 'CATEGORY' | 'STATUS' | 'MODEL' | 'VARIANT' | 'DESCRIPTION'
    | 'INVENTORY_TREATMENT' | 'SALES_HISTORY_TREATMENT';
  status: 'COMPLETED';
  identityState?: 'CONFIRMED_SAME' | 'CONFIRMED_DIFFERENT';
};

export type TreatmentAction = InventoryTreatmentAction | SalesHistoryTreatmentAction
  | LocalOnlyTreatmentValue['action'] | SupabaseOnlyTreatmentValue['action'];

export type ConflictScope =
  | 'IDENTITY'
  | 'SKU'
  | 'BARCODE'
  | 'SELLING_PRICE'
  | 'COST_PRICE'
  | 'CATEGORY'
  | 'STATUS'
  | 'BRAND'
  | 'MODEL'
  | 'VARIANT'
  | 'DESCRIPTION'
  | 'PHYSICAL_FORM'
  | 'CONNECTOR'
  | 'CAPACITY'
  | 'FORM_FACTOR'
  | 'INVENTORY_TREATMENT'
  | 'SALES_HISTORY_TREATMENT';
export type ReconciliationGateState = 'READY' | 'BLOCKED' | 'DEFERRED';
export type ReconciliationRequirementState =
  | 'REQUIRED'
  | 'COMPLETED'
  | 'NOT_APPLICABLE'
  | 'BLOCKED';
export type ReconciliationSourceSide = 'LOCAL' | 'SUPABASE';

export type ReconciliationDecisionType =
  | 'IDENTITY'
  | 'SKU'
  | 'BARCODE'
  | 'SELLING_PRICE'
  | 'COST_PRICE'
  | 'CATEGORY'
  | 'STATUS'
  | 'BRAND'
  | 'MODEL'
  | 'VARIANT'
  | 'DESCRIPTION'
  | 'INVENTORY_TREATMENT'
  | 'SALES_HISTORY_TREATMENT'
  | 'LOCAL_ONLY_TREATMENT'
  | 'SUPABASE_ONLY_TREATMENT'
  | 'REVIEW_DISPOSITION';

export type ReconciliationEvidenceType =
  | 'PHYSICAL_INSPECTION'
  | 'BARCODE_SCAN'
  | 'PACKAGE_PHOTO'
  | 'MANUFACTURER_MODEL'
  | 'SUPPLIER_INVOICE'
  | 'PURCHASE_RECORD'
  | 'PRODUCT_PHOTO'
  | 'OPERATOR_NOTE';

export type ReconciliationConflictType =
  | 'SAME_SKU_DIFFERENT_BARCODE'
  | 'SAME_NAME_DIFFERENT_PHYSICAL_FORM'
  | 'DIFFERENT_CONNECTOR'
  | 'DIFFERENT_CAPACITY'
  | 'DIFFERENT_FORM_FACTOR'
  | 'CONFLICTING_CATEGORY'
  | 'CONFLICTING_STATUS'
  | 'UNRESOLVED_PRICE'
  | 'UNRESOLVED_BARCODE'
  | 'MISSING_METADATA'
  | 'UNRESOLVED_INVENTORY_TREATMENT'
  | 'UNRESOLVED_SALES_HISTORY_TREATMENT';

export type ReconciliationConflictSeverity = 'BLOCKING' | 'WARNING';
export type ReconciliationConflictState = 'OPEN' | 'RESOLVED' | 'DEFERRED';

export interface ReconciliationSourceSnapshot {
  snapshot_id: string;
  source_side: ReconciliationSourceSide;
  source_record_reference: string;
  sku: string | null;
  name: string | null;
  barcode: string | null;
  brand: string | null;
  model: string | null;
  variant: string | null;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  category_created_at: string | null;
  category_updated_at: string | null;
  selling_price: number | null;
  cost_price: number | null;
  reorder_level: number | null;
  status: string | null;
  source_created_at: string | null;
  source_updated_at: string | null;
  captured_at: string;
  snapshot_hash: string;
  evidence_basis_version: string;
  created_at: string;
}

export interface ReconciliationReview {
  review_id: string;
  review_scope: ReconciliationReviewScope;
  local_source_reference: string | null;
  supabase_source_reference: string | null;
  local_snapshot_id: string | null;
  supabase_snapshot_id: string | null;
  classification: string;
  coverage_state: ReconciliationCoverageState;
  evidence_basis_version: string;
  created_at: string;
  updated_at: string;
}

export interface ReconciliationReviewState extends ReconciliationReview {
  derived_identity_state: ReconciliationIdentityState;
  derived_review_disposition: ReconciliationReviewDisposition;
}

export interface ReconciliationDecision {
  decision_id: string;
  review_id: string;
  decision_type: ReconciliationDecisionType;
  decision_status: ReconciliationDecisionStatus;
  decision_value: ReconciliationDecisionValue | null;
  decision_note: string | null;
  previous_value: ReconciliationDecisionValue | null;
  operator_user_id: string;
  operator_role_at_decision: 'ADMIN';
  decided_at: string;
  created_at: string;
  supersedes_decision_id: string | null;
}

export interface ReconciliationEvidence {
  evidence_id: string;
  review_id: string;
  decision_id: string | null;
  evidence_type: ReconciliationEvidenceType;
  description: string;
  reference_text: string | null;
  attachment_reference: string | null;
  evidence_metadata: Record<string, unknown> | null;
  operator_user_id: string;
  captured_at: string;
  created_at: string;
}

export interface ReconciliationConflict {
  conflict_id: string;
  review_id: string;
  conflict_type: ReconciliationConflictType;
  conflict_scope: ConflictScope;
  severity: ReconciliationConflictSeverity;
  conflict_state: ReconciliationConflictState;
  description: string;
  local_observed_value: unknown | null;
  supabase_observed_value: unknown | null;
  resolution_decision_id: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ReconciliationGateEvaluation {
  gate_evaluation_id: string;
  gate_name: 'REVIEW_GATE' | 'CATALOG_SYNC_READY';
  evaluation_scope: 'REVIEW' | 'GLOBAL';
  review_id: string | null;
  gate_state: ReconciliationGateState;
  decision_requirement_summary: Record<ReconciliationDecisionType, ReconciliationRequirementState>;
  blocking_summary: string[];
  input_digest: string;
  evaluated_at: string;
  evaluated_by: string | null;
  created_at: string;
}

export interface ReconciliationOperationResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}
