-- =============================================================================
-- MILESTONE 8F — RECONCILIATION FOUNDATION
-- =============================================================================
-- Persistent decision-capture layer only. This script never creates a foreign key
-- to products/inventory/sales/sale_items/transfers/movements/audit_logs and
-- contains no product or operational data mutation path.
--
-- The existing StockFlow schema already enables uuid-ossp. This is retained
-- here as a defensive prerequisite for standalone migration execution.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Apply as a separate, reviewed Supabase SQL migration. Normal clients may read
-- only through Admin RLS and may append through the protected functions below.

-- 1. Immutable source snapshots -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reconciliation_source_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_side TEXT NOT NULL CHECK (source_side IN ('LOCAL', 'SUPABASE')),
    source_record_reference TEXT NOT NULL,
    sku TEXT,
    name TEXT,
    barcode TEXT,
    brand TEXT,
    model TEXT,
    variant TEXT,
    description TEXT,
    category_id TEXT,
    category_name TEXT,
    category_created_at TIMESTAMPTZ,
    category_updated_at TIMESTAMPTZ,
    selling_price NUMERIC(12, 2),
    cost_price NUMERIC(12, 2),
    reorder_level INTEGER,
    status TEXT,
    source_created_at TIMESTAMPTZ,
    source_updated_at TIMESTAMPTZ,
    captured_at TIMESTAMPTZ NOT NULL,
    snapshot_hash TEXT NOT NULL,
    evidence_basis_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reconciliation_snapshots_source_key_unique
        UNIQUE (source_side, source_record_reference, evidence_basis_version),
    CONSTRAINT reconciliation_snapshots_hash_nonempty CHECK (BTRIM(snapshot_hash) <> ''),
    CONSTRAINT reconciliation_snapshots_basis_nonempty CHECK (BTRIM(evidence_basis_version) <> ''),
    CONSTRAINT reconciliation_snapshots_prices_nonnegative CHECK (
        (selling_price IS NULL OR selling_price >= 0)
        AND (cost_price IS NULL OR cost_price >= 0)
    )
);

-- 2. Review contexts ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reconciliation_reviews (
    review_id TEXT PRIMARY KEY,
    review_scope TEXT NOT NULL CHECK (review_scope IN ('CANDIDATE_PAIR', 'EXACT_SKU', 'LOCAL_ONLY', 'SUPABASE_ONLY')),
    local_source_reference TEXT,
    supabase_source_reference TEXT,
    local_snapshot_id UUID REFERENCES public.reconciliation_source_snapshots(snapshot_id),
    supabase_snapshot_id UUID REFERENCES public.reconciliation_source_snapshots(snapshot_id),
    classification TEXT NOT NULL,
    coverage_state TEXT NOT NULL CHECK (coverage_state IN ('PAIRED', 'UNMATCHED_LOCAL', 'UNMATCHED_SUPABASE')),
    evidence_basis_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reconciliation_reviews_scope_shape CHECK (
        (review_scope IN ('CANDIDATE_PAIR', 'EXACT_SKU')
            AND local_snapshot_id IS NOT NULL AND supabase_snapshot_id IS NOT NULL
            AND local_source_reference IS NOT NULL AND supabase_source_reference IS NOT NULL
            AND coverage_state = 'PAIRED')
        OR
        (review_scope = 'LOCAL_ONLY'
            AND local_snapshot_id IS NOT NULL AND supabase_snapshot_id IS NULL
            AND local_source_reference IS NOT NULL AND supabase_source_reference IS NULL
            AND coverage_state = 'UNMATCHED_LOCAL')
        OR
        (review_scope = 'SUPABASE_ONLY'
            AND local_snapshot_id IS NULL AND supabase_snapshot_id IS NOT NULL
            AND local_source_reference IS NULL AND supabase_source_reference IS NOT NULL
            AND coverage_state = 'UNMATCHED_SUPABASE')
    ),
    CONSTRAINT reconciliation_reviews_snapshots_distinct CHECK (
        local_snapshot_id IS NULL OR supabase_snapshot_id IS NULL
        OR local_snapshot_id <> supabase_snapshot_id
    )
);

-- 3. Immutable decision chains --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reconciliation_decisions (
    decision_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id TEXT NOT NULL REFERENCES public.reconciliation_reviews(review_id),
    decision_type TEXT NOT NULL CHECK (decision_type IN (
        'IDENTITY', 'SKU', 'BARCODE', 'SELLING_PRICE', 'COST_PRICE', 'CATEGORY', 'STATUS',
        'BRAND', 'MODEL', 'VARIANT', 'DESCRIPTION', 'INVENTORY_TREATMENT',
        'SALES_HISTORY_TREATMENT', 'LOCAL_ONLY_TREATMENT', 'SUPABASE_ONLY_TREATMENT',
        'REVIEW_DISPOSITION'
    )),
    decision_status TEXT NOT NULL CHECK (decision_status IN ('COMPLETED', 'NOT_APPLICABLE')),
    decision_value JSONB,
    decision_note TEXT,
    previous_value JSONB,
    operator_user_id UUID NOT NULL,
    operator_role_at_decision TEXT NOT NULL CHECK (operator_role_at_decision = 'ADMIN'),
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    supersedes_decision_id UUID,
    CONSTRAINT reconciliation_decisions_decision_target_unique
        UNIQUE (decision_id, review_id, decision_type),
    CONSTRAINT reconciliation_decisions_status_semantics CHECK (
        (decision_status = 'COMPLETED'
            AND decision_value IS NOT NULL
            AND jsonb_typeof(decision_value) <> 'null')
        OR
        (decision_status = 'NOT_APPLICABLE'
            AND decision_value IS NULL
            AND decision_note IS NOT NULL
            AND BTRIM(decision_note) <> '')
    ),
    CONSTRAINT reconciliation_decisions_not_self CHECK (
        supersedes_decision_id IS NULL OR supersedes_decision_id <> decision_id
    ),
    -- The composite FK is the database-level guarantee that a superseding
    -- decision references the same review_id and decision_type as its parent.
    CONSTRAINT reconciliation_decisions_same_chain_fk
        FOREIGN KEY (supersedes_decision_id, review_id, decision_type)
        REFERENCES public.reconciliation_decisions(decision_id, review_id, decision_type)
        ON DELETE RESTRICT
);


-- 4. Append-only evidence --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reconciliation_evidence (
    evidence_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id TEXT NOT NULL REFERENCES public.reconciliation_reviews(review_id),
    decision_id UUID REFERENCES public.reconciliation_decisions(decision_id),
    evidence_type TEXT NOT NULL CHECK (evidence_type IN (
        'PHYSICAL_INSPECTION', 'BARCODE_SCAN', 'PACKAGE_PHOTO', 'MANUFACTURER_MODEL',
        'SUPPLIER_INVOICE', 'PURCHASE_RECORD', 'PRODUCT_PHOTO', 'OPERATOR_NOTE'
    )),
    description TEXT NOT NULL,
    reference_text TEXT,
    attachment_reference TEXT,
    evidence_metadata JSONB,
    operator_user_id UUID NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reconciliation_evidence_description_nonempty CHECK (BTRIM(description) <> ''),
    CONSTRAINT reconciliation_evidence_metadata_object CHECK (
        evidence_metadata IS NULL OR jsonb_typeof(evidence_metadata) = 'object'
    )
);

-- 5. Structured conflicts -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reconciliation_conflicts (
    conflict_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id TEXT NOT NULL REFERENCES public.reconciliation_reviews(review_id),
    conflict_type TEXT NOT NULL CHECK (conflict_type IN (
        'SAME_SKU_DIFFERENT_BARCODE', 'SAME_NAME_DIFFERENT_PHYSICAL_FORM',
        'DIFFERENT_CONNECTOR', 'DIFFERENT_CAPACITY', 'DIFFERENT_FORM_FACTOR',
        'CONFLICTING_CATEGORY', 'CONFLICTING_STATUS', 'UNRESOLVED_PRICE',
        'UNRESOLVED_BARCODE', 'MISSING_METADATA',
        'UNRESOLVED_INVENTORY_TREATMENT', 'UNRESOLVED_SALES_HISTORY_TREATMENT'
    )),
    conflict_scope TEXT NOT NULL CHECK (conflict_scope IN (
        'IDENTITY', 'SKU', 'BARCODE', 'SELLING_PRICE', 'COST_PRICE', 'CATEGORY', 'STATUS',
        'BRAND', 'MODEL', 'VARIANT', 'DESCRIPTION', 'PHYSICAL_FORM', 'CONNECTOR',
        'CAPACITY', 'FORM_FACTOR', 'INVENTORY_TREATMENT', 'SALES_HISTORY_TREATMENT'
    )),
    severity TEXT NOT NULL CHECK (severity IN ('BLOCKING', 'WARNING')),
    conflict_state TEXT NOT NULL DEFAULT 'OPEN' CHECK (conflict_state IN ('OPEN', 'RESOLVED', 'DEFERRED')),
    description TEXT NOT NULL,
    local_observed_value JSONB,
    supabase_observed_value JSONB,
    resolution_decision_id UUID REFERENCES public.reconciliation_decisions(decision_id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reconciliation_conflicts_description_nonempty CHECK (BTRIM(description) <> ''),
    CONSTRAINT reconciliation_conflicts_resolution_shape CHECK (
        (conflict_state = 'RESOLVED' AND resolution_decision_id IS NOT NULL AND resolved_at IS NOT NULL)
        OR
        (conflict_state IN ('OPEN', 'DEFERRED') AND resolved_at IS NULL)
    )
);

-- 6. Append-only technical gate evaluations ------------------------------------
CREATE TABLE IF NOT EXISTS public.reconciliation_gate_evaluations (
    gate_evaluation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gate_name TEXT NOT NULL CHECK (gate_name IN ('REVIEW_GATE', 'CATALOG_SYNC_READY')),
    evaluation_scope TEXT NOT NULL CHECK (evaluation_scope IN ('REVIEW', 'GLOBAL')),
    review_id TEXT REFERENCES public.reconciliation_reviews(review_id),
    gate_state TEXT NOT NULL CHECK (gate_state IN ('READY', 'BLOCKED', 'DEFERRED')),
    decision_requirement_summary JSONB NOT NULL,
    blocking_summary JSONB NOT NULL,
    input_digest TEXT NOT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reconciliation_gate_scope_shape CHECK (
        (evaluation_scope = 'REVIEW' AND gate_name = 'REVIEW_GATE' AND review_id IS NOT NULL)
        OR
        (evaluation_scope = 'GLOBAL' AND gate_name = 'CATALOG_SYNC_READY' AND review_id IS NULL)
    ),
    CONSTRAINT reconciliation_gate_summary_shapes CHECK (
        jsonb_typeof(decision_requirement_summary) = 'object'
        AND jsonb_typeof(blocking_summary) = 'array'
    )
);

-- 7. Append-only / same-chain indexes -------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_decisions_one_root_per_slot
    ON public.reconciliation_decisions(review_id, decision_type)
    WHERE supersedes_decision_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_decisions_one_child_per_parent
    ON public.reconciliation_decisions(supersedes_decision_id)
    WHERE supersedes_decision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reconciliation_snapshots_source_idx
    ON public.reconciliation_source_snapshots(source_side, source_record_reference);
CREATE INDEX IF NOT EXISTS reconciliation_snapshots_basis_idx
    ON public.reconciliation_source_snapshots(evidence_basis_version);
CREATE INDEX IF NOT EXISTS reconciliation_reviews_scope_idx
    ON public.reconciliation_reviews(review_scope, coverage_state);
CREATE INDEX IF NOT EXISTS reconciliation_reviews_local_ref_idx
    ON public.reconciliation_reviews(local_source_reference);
CREATE INDEX IF NOT EXISTS reconciliation_reviews_supabase_ref_idx
    ON public.reconciliation_reviews(supabase_source_reference);
CREATE INDEX IF NOT EXISTS reconciliation_decisions_review_idx
    ON public.reconciliation_decisions(review_id, decision_type, created_at);
CREATE INDEX IF NOT EXISTS reconciliation_evidence_review_idx
    ON public.reconciliation_evidence(review_id, created_at);
CREATE INDEX IF NOT EXISTS reconciliation_conflicts_review_idx
    ON public.reconciliation_conflicts(review_id, conflict_state, severity);
CREATE INDEX IF NOT EXISTS reconciliation_gate_review_idx
    ON public.reconciliation_gate_evaluations(review_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS reconciliation_gate_global_idx
    ON public.reconciliation_gate_evaluations(evaluated_at DESC)
    WHERE evaluation_scope = 'GLOBAL';

-- 8. Current decision leaves -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconciliation_current_decisions(
    p_review_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    decision_id UUID,
    review_id TEXT,
    decision_type TEXT,
    decision_status TEXT,
    decision_value JSONB,
    decision_note TEXT,
    previous_value JSONB,
    operator_user_id UUID,
    operator_role_at_decision TEXT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    supersedes_decision_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id UUID := auth.uid();
    v_role TEXT;
    v_status TEXT;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT pf.role::text, pf.status
      INTO v_role, v_status
      FROM public.profiles AS pf
     WHERE pf.id = v_actor_id;

    IF NOT FOUND OR v_role IS DISTINCT FROM 'ADMIN' OR v_status IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'Only active Super Admins may access reconciliation decisions.';
    END IF;

    RETURN QUERY
    SELECT d.decision_id,
           d.review_id,
           d.decision_type,
           d.decision_status,
           d.decision_value,
           d.decision_note,
           d.previous_value,
           d.operator_user_id,
           d.operator_role_at_decision,
           d.decided_at,
           d.created_at,
           d.supersedes_decision_id
      FROM public.reconciliation_decisions AS d
     WHERE (p_review_id IS NULL OR d.review_id = p_review_id)
       AND NOT EXISTS (
            SELECT 1
              FROM public.reconciliation_decisions AS child
             WHERE child.supersedes_decision_id = d.decision_id
       )
     ORDER BY d.review_id, d.decision_type;
END;
$function$;

-- Derived UI state: identity/disposition are never stored as mutable truth.
CREATE OR REPLACE VIEW public.reconciliation_review_state
WITH (security_invoker = true)
AS
SELECT
    r.review_id,
    r.review_scope,
    r.local_source_reference,
    r.supabase_source_reference,
    r.local_snapshot_id,
    r.supabase_snapshot_id,
    r.classification,
    r.coverage_state,
    r.evidence_basis_version,
    r.created_at,
    r.updated_at,
    CASE
        WHEN r.review_scope IN ('LOCAL_ONLY', 'SUPABASE_ONLY') THEN NULL
        WHEN identity.decision_id IS NULL THEN 'PENDING'
        ELSE identity.decision_value #>> '{}'
    END AS derived_identity_state,
    CASE
        WHEN disposition.decision_id IS NULL THEN 'ACTIVE'
        ELSE disposition.decision_value #>> '{}'
    END AS derived_review_disposition
FROM public.reconciliation_reviews AS r
LEFT JOIN LATERAL (
    SELECT d.decision_id, d.decision_value
      FROM public.reconciliation_decisions AS d
     WHERE d.review_id = r.review_id
       AND d.decision_type = 'IDENTITY'
       AND NOT EXISTS (
            SELECT 1 FROM public.reconciliation_decisions AS child
             WHERE child.supersedes_decision_id = d.decision_id
       )
) AS identity ON TRUE
LEFT JOIN LATERAL (
    SELECT d.decision_id, d.decision_value
      FROM public.reconciliation_decisions AS d
     WHERE d.review_id = r.review_id
       AND d.decision_type = 'REVIEW_DISPOSITION'
       AND NOT EXISTS (
            SELECT 1 FROM public.reconciliation_decisions AS child

             WHERE child.supersedes_decision_id = d.decision_id
       )
) AS disposition ON TRUE;



-- Shared conflict compatibility checks used by conflict creation and resolution.
CREATE OR REPLACE FUNCTION public.validate_reconciliation_conflict_scope(
    p_conflict_type TEXT,
    p_conflict_scope TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    IF p_conflict_type NOT IN (
        'SAME_SKU_DIFFERENT_BARCODE','SAME_NAME_DIFFERENT_PHYSICAL_FORM',
        'DIFFERENT_CONNECTOR','DIFFERENT_CAPACITY','DIFFERENT_FORM_FACTOR',
        'CONFLICTING_CATEGORY','CONFLICTING_STATUS','UNRESOLVED_PRICE',
        'UNRESOLVED_BARCODE','MISSING_METADATA',
        'UNRESOLVED_INVENTORY_TREATMENT','UNRESOLVED_SALES_HISTORY_TREATMENT'
    ) THEN
        RAISE EXCEPTION 'Invalid reconciliation conflict type.';
    END IF;
    IF p_conflict_scope NOT IN ('IDENTITY','SKU','BARCODE','SELLING_PRICE','COST_PRICE','CATEGORY','STATUS',
        'BRAND','MODEL','VARIANT','DESCRIPTION','PHYSICAL_FORM','CONNECTOR','CAPACITY','FORM_FACTOR',
        'INVENTORY_TREATMENT','SALES_HISTORY_TREATMENT') THEN
        RAISE EXCEPTION 'Invalid reconciliation conflict scope.';
    END IF;
    IF (p_conflict_type = 'SAME_SKU_DIFFERENT_BARCODE' AND p_conflict_scope <> 'BARCODE')
       OR (p_conflict_type = 'UNRESOLVED_BARCODE' AND p_conflict_scope <> 'BARCODE')
       OR (p_conflict_type = 'CONFLICTING_CATEGORY' AND p_conflict_scope <> 'CATEGORY')
       OR (p_conflict_type = 'CONFLICTING_STATUS' AND p_conflict_scope <> 'STATUS')
       OR (p_conflict_type = 'UNRESOLVED_PRICE' AND p_conflict_scope NOT IN ('SELLING_PRICE','COST_PRICE'))
       OR (p_conflict_type = 'MISSING_METADATA' AND p_conflict_scope NOT IN ('BRAND','MODEL','VARIANT','DESCRIPTION'))
       OR (p_conflict_type = 'UNRESOLVED_INVENTORY_TREATMENT' AND p_conflict_scope <> 'INVENTORY_TREATMENT')
       OR (p_conflict_type = 'UNRESOLVED_SALES_HISTORY_TREATMENT' AND p_conflict_scope <> 'SALES_HISTORY_TREATMENT')
       OR (p_conflict_type = 'SAME_NAME_DIFFERENT_PHYSICAL_FORM' AND p_conflict_scope <> 'PHYSICAL_FORM')
       OR (p_conflict_type = 'DIFFERENT_CONNECTOR' AND p_conflict_scope <> 'CONNECTOR')
       OR (p_conflict_type = 'DIFFERENT_CAPACITY' AND p_conflict_scope <> 'CAPACITY')
       OR (p_conflict_type = 'DIFFERENT_FORM_FACTOR' AND p_conflict_scope <> 'FORM_FACTOR') THEN
        RAISE EXCEPTION 'Conflict type % is incompatible with scope %.', p_conflict_type, p_conflict_scope;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_reconciliation_conflict_resolution(
    p_conflict_type TEXT,
    p_conflict_scope TEXT,
    p_identity TEXT,
    p_resolution_type TEXT,
    p_resolution_value JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    PERFORM public.validate_reconciliation_conflict_scope(p_conflict_type, p_conflict_scope);
    IF p_resolution_type = 'REVIEW_DISPOSITION' THEN
        RAISE EXCEPTION 'REVIEW_DISPOSITION cannot resolve a product-data conflict.';
    END IF;
    IF p_conflict_type = 'UNRESOLVED_INVENTORY_TREATMENT' AND p_resolution_type <> 'INVENTORY_TREATMENT' THEN
        RAISE EXCEPTION 'Inventory conflict requires an INVENTORY_TREATMENT decision.';
    END IF;
    IF p_conflict_type = 'UNRESOLVED_SALES_HISTORY_TREATMENT' AND p_resolution_type <> 'SALES_HISTORY_TREATMENT' THEN
        RAISE EXCEPTION 'Sales-history conflict requires a SALES_HISTORY_TREATMENT decision.';
    END IF;
    IF p_conflict_type IN ('UNRESOLVED_INVENTORY_TREATMENT', 'UNRESOLVED_SALES_HISTORY_TREATMENT') THEN
        RETURN;
    END IF;
    IF p_identity = 'CONFIRMED_DIFFERENT' THEN
        IF p_conflict_type IN (
                'SAME_SKU_DIFFERENT_BARCODE', 'UNRESOLVED_BARCODE',
                'SAME_NAME_DIFFERENT_PHYSICAL_FORM', 'DIFFERENT_CONNECTOR',
                'DIFFERENT_CAPACITY', 'DIFFERENT_FORM_FACTOR'
            )
           AND p_conflict_scope IN ('BARCODE', 'PHYSICAL_FORM', 'CONNECTOR', 'CAPACITY', 'FORM_FACTOR')
           AND p_resolution_type = 'IDENTITY'
           AND p_resolution_value #>> '{}' = 'CONFIRMED_DIFFERENT' THEN
            RETURN;
        END IF;
        RAISE EXCEPTION 'A confirmed-different identity decision may resolve only barcode or physical conflicts.';
    END IF;
    IF p_identity IS NULL OR p_identity IN ('PENDING', 'NEEDS_VERIFICATION') THEN
        RAISE EXCEPTION 'Identity must be resolved before this conflict can be resolved.';
    END IF;
    IF p_conflict_type IN ('SAME_SKU_DIFFERENT_BARCODE','UNRESOLVED_BARCODE') AND p_resolution_type <> 'BARCODE' THEN
        RAISE EXCEPTION 'Barcode conflict requires a BARCODE decision.';
    ELSIF p_conflict_type = 'CONFLICTING_CATEGORY' AND p_resolution_type <> 'CATEGORY' THEN
        RAISE EXCEPTION 'Category conflict requires a CATEGORY decision.';
    ELSIF p_conflict_type = 'CONFLICTING_STATUS' AND p_resolution_type <> 'STATUS' THEN
        RAISE EXCEPTION 'Status conflict requires a STATUS decision.';
    ELSIF p_conflict_type = 'UNRESOLVED_PRICE' AND p_resolution_type <> p_conflict_scope THEN
        RAISE EXCEPTION 'Price conflict requires the matching price decision.';
    ELSIF p_conflict_type = 'MISSING_METADATA' AND p_resolution_type <> p_conflict_scope THEN
        RAISE EXCEPTION 'Metadata conflict requires the matching metadata decision.';
    ELSIF p_conflict_type = 'SAME_NAME_DIFFERENT_PHYSICAL_FORM' AND p_resolution_type NOT IN ('MODEL','VARIANT','DESCRIPTION') THEN
        RAISE EXCEPTION 'Physical-form conflict requires a compatible model, variant, or description decision.';
    ELSIF p_conflict_type = 'DIFFERENT_CONNECTOR' AND p_resolution_type NOT IN ('VARIANT','DESCRIPTION') THEN
        RAISE EXCEPTION 'Connector conflict requires a compatible variant or description decision.';
    ELSIF p_conflict_type = 'DIFFERENT_CAPACITY' AND p_resolution_type NOT IN ('VARIANT','DESCRIPTION') THEN
        RAISE EXCEPTION 'Capacity conflict requires a compatible variant or description decision.';
    ELSIF p_conflict_type = 'DIFFERENT_FORM_FACTOR' AND p_resolution_type NOT IN ('MODEL','VARIANT','DESCRIPTION') THEN
        RAISE EXCEPTION 'Form-factor conflict requires a compatible model, variant, or description decision.';
    END IF;
END;
$function$;

-- Shared JSON field predicates used by the closed treatment schema.
CREATE OR REPLACE FUNCTION public.reconciliation_is_nonempty_json_string(p_value JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
    SELECT COALESCE(p_value IS NOT NULL
        AND jsonb_typeof(p_value) = 'string'
        AND BTRIM(p_value #>> '{}') <> '', false);
$function$;

CREATE OR REPLACE FUNCTION public.reconciliation_is_json_enum(p_value JSONB, p_allowed TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
    SELECT public.reconciliation_is_nonempty_json_string(p_value)
       AND (p_value #>> '{}') = ANY(p_allowed);
$function$;

CREATE OR REPLACE FUNCTION public.reconciliation_is_json_string_or_null(p_value JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
    SELECT COALESCE(
        p_value IS NOT NULL
        AND (jsonb_typeof(p_value) = 'null' OR public.reconciliation_is_nonempty_json_string(p_value)),
        false);
$function$;


CREATE OR REPLACE FUNCTION public.reconciliation_is_json_string_array(p_value JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
    SELECT CASE
        WHEN jsonb_typeof(p_value) IS DISTINCT FROM 'array' THEN false
        ELSE NOT EXISTS (
            SELECT 1
              FROM jsonb_array_elements(p_value) AS item(value)
             WHERE NOT public.reconciliation_is_nonempty_json_string(item.value)
        )
    END;
$function$;

-- Database authority for all decision-value validation.
CREATE OR REPLACE FUNCTION public.validate_reconciliation_decision_value(
    p_decision_type TEXT,
    p_decision_status TEXT,
    p_decision_value JSONB,
    p_decision_note TEXT,
    p_review_scope TEXT,
    p_current_identity TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
    v_numeric NUMERIC;
    v_action TEXT;
    v_source TEXT;
    v_target TEXT;
    v_reason TEXT;
    v_scope TEXT;
BEGIN
    IF p_decision_status NOT IN ('COMPLETED', 'NOT_APPLICABLE') THEN
        RAISE EXCEPTION 'Invalid reconciliation decision status.';
    END IF;
    IF p_decision_status = 'COMPLETED' AND (p_decision_value IS NULL OR jsonb_typeof(p_decision_value) = 'null') THEN
        RAISE EXCEPTION 'COMPLETED decisions require a non-null JSON decision_value.';
    END IF;
    IF p_decision_status = 'NOT_APPLICABLE'
       AND (p_decision_value IS NOT NULL OR p_decision_note IS NULL OR BTRIM(p_decision_note) = '') THEN
        RAISE EXCEPTION 'NOT_APPLICABLE decisions require a null value and a non-empty note.';
    END IF;
    IF p_decision_type NOT IN (
        'IDENTITY','SKU','BARCODE','SELLING_PRICE','COST_PRICE','CATEGORY','STATUS',
        'BRAND','MODEL','VARIANT','DESCRIPTION','INVENTORY_TREATMENT',
        'SALES_HISTORY_TREATMENT','LOCAL_ONLY_TREATMENT','SUPABASE_ONLY_TREATMENT','REVIEW_DISPOSITION'
    ) THEN RAISE EXCEPTION 'Invalid reconciliation decision type.'; END IF;
    IF p_review_scope IN ('CANDIDATE_PAIR','EXACT_SKU') AND p_decision_type NOT IN (
        'IDENTITY','SKU','BARCODE','SELLING_PRICE','COST_PRICE','CATEGORY','STATUS',
        'BRAND','MODEL','VARIANT','DESCRIPTION','INVENTORY_TREATMENT',
        'SALES_HISTORY_TREATMENT','REVIEW_DISPOSITION'
    ) THEN RAISE EXCEPTION 'Decision type is not valid for a paired review.'; END IF;
    IF p_review_scope = 'LOCAL_ONLY' AND p_decision_type NOT IN (
        'LOCAL_ONLY_TREATMENT','INVENTORY_TREATMENT','SALES_HISTORY_TREATMENT','REVIEW_DISPOSITION'
    ) THEN RAISE EXCEPTION 'Decision type is not valid for LOCAL_ONLY.'; END IF;
    IF p_review_scope = 'SUPABASE_ONLY' AND p_decision_type NOT IN (
        'SUPABASE_ONLY_TREATMENT','INVENTORY_TREATMENT','SALES_HISTORY_TREATMENT','REVIEW_DISPOSITION'
    ) THEN RAISE EXCEPTION 'Decision type is not valid for SUPABASE_ONLY.'; END IF;
    IF p_decision_type IN ('IDENTITY','REVIEW_DISPOSITION') AND p_decision_status <> 'COMPLETED' THEN
        RAISE EXCEPTION '% must be COMPLETED.', p_decision_type;
    END IF;
    IF p_decision_type IN ('IDENTITY','REVIEW_DISPOSITION','LOCAL_ONLY_TREATMENT','SUPABASE_ONLY_TREATMENT')
       AND p_decision_status = 'NOT_APPLICABLE' THEN
        RAISE EXCEPTION '% cannot be NOT_APPLICABLE.', p_decision_type;
    END IF;
    IF p_decision_status = 'NOT_APPLICABLE' THEN RETURN; END IF;
    IF p_decision_type = 'IDENTITY'
       AND NOT public.reconciliation_is_json_enum(p_decision_value, ARRAY['NEEDS_VERIFICATION','CONFIRMED_SAME','CONFIRMED_DIFFERENT']) THEN
        RAISE EXCEPTION 'IDENTITY has an invalid value.';
    ELSIF p_decision_type = 'REVIEW_DISPOSITION'
       AND NOT public.reconciliation_is_json_enum(p_decision_value, ARRAY['ACTIVE','DEFERRED']) THEN
        RAISE EXCEPTION 'REVIEW_DISPOSITION has an invalid value.';
    ELSIF p_decision_type = 'REVIEW_DISPOSITION'
       AND p_decision_value #>> '{}' = 'DEFERRED'
       AND (p_decision_note IS NULL OR BTRIM(p_decision_note) = '') THEN
        RAISE EXCEPTION 'DEFERRED disposition requires a non-empty note.';
    END IF;
    IF p_decision_type IN ('SKU','BARCODE','CATEGORY','BRAND','MODEL','VARIANT','DESCRIPTION')
       AND NOT public.reconciliation_is_nonempty_json_string(p_decision_value) THEN
        RAISE EXCEPTION '% requires a non-empty string value.', p_decision_type;
    END IF;
    IF p_decision_type = 'STATUS'
       AND NOT public.reconciliation_is_json_enum(p_decision_value, ARRAY['ACTIVE','INACTIVE','DISCONTINUED']) THEN
        RAISE EXCEPTION 'STATUS must be ACTIVE, INACTIVE, or DISCONTINUED.';
    END IF;
    IF p_decision_type IN ('SELLING_PRICE','COST_PRICE') THEN
        IF p_decision_value IS NULL
           OR jsonb_typeof(p_decision_value) IS DISTINCT FROM 'number'
           OR lower(p_decision_value #>> '{}') IN ('nan', 'infinity', '-infinity')
           OR (p_decision_value #>> '{}') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
            RAISE EXCEPTION '% requires a finite JSON number.', p_decision_type;
        END IF;
        v_numeric := (p_decision_value #>> '{}')::numeric;
        IF v_numeric < 0 OR v_numeric > 9999999999.99 OR scale(v_numeric) > 2 THEN
            RAISE EXCEPTION '% must fit NUMERIC(12,2) and be non-negative.', p_decision_type;
        END IF;
    END IF;
    IF p_decision_type NOT IN ('INVENTORY_TREATMENT','SALES_HISTORY_TREATMENT','LOCAL_ONLY_TREATMENT','SUPABASE_ONLY_TREATMENT') THEN
        RETURN;
    END IF;
    IF jsonb_typeof(p_decision_value) <> 'object' THEN RAISE EXCEPTION '% requires an object value.', p_decision_type; END IF;
    v_action := p_decision_value->>'action';
    v_source := p_decision_value->>'source_product_reference';
    v_reason := p_decision_value->>'reason';
    IF NOT public.reconciliation_is_nonempty_json_string(p_decision_value->'action')
       OR NOT public.reconciliation_is_nonempty_json_string(p_decision_value->'source_product_reference')
       OR NOT public.reconciliation_is_nonempty_json_string(p_decision_value->'reason') THEN
        RAISE EXCEPTION '% requires a non-empty action, source reference, and reason.', p_decision_type;
    END IF;

    IF p_decision_type = 'INVENTORY_TREATMENT' THEN
        IF (SELECT COUNT(*) FROM jsonb_object_keys(p_decision_value)) <> 10
           OR NOT (p_decision_value ?& ARRAY['action','source_product_reference','target_product_reference','operational_scope','store_ids','quantity_handling','movement_handling','transfer_handling','adjustment_handling','reason'])
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'action', ARRAY['KEEP_REFERENCE_AND_QUANTITY','REASSIGN_REFERENCE_PRESERVE_QUANTITY','PRESERVE_HISTORICAL_MOVEMENTS_ONLY','REQUIRE_MANUAL_STOCK_RECONCILIATION'])
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'operational_scope', ARRAY['ALL_INVENTORY_ROWS','SELECTED_STORES'])
           OR NOT public.reconciliation_is_json_string_array(p_decision_value->'store_ids')
           OR (p_decision_value->>'operational_scope' = 'ALL_INVENTORY_ROWS' AND jsonb_array_length(p_decision_value->'store_ids') <> 0)
           OR (p_decision_value->>'operational_scope' = 'SELECTED_STORES' AND jsonb_array_length(p_decision_value->'store_ids') = 0)
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'quantity_handling', ARRAY['PRESERVE','REQUIRES_RECONCILIATION','NOT_APPLICABLE'])
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'movement_handling', ARRAY['PRESERVE_HISTORY','REQUIRES_MANUAL_REVIEW','NO_OPERATION'])
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'transfer_handling', ARRAY['PRESERVE_REFERENCES','REQUIRES_MANUAL_REVIEW','NO_RELATED_TRANSFERS'])
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'adjustment_handling', ARRAY['PRESERVE_HISTORY','REQUIRES_MANUAL_REVIEW','NO_RELATED_ADJUSTMENTS'])
           OR NOT public.reconciliation_is_json_string_or_null(p_decision_value->'target_product_reference') THEN
            RAISE EXCEPTION 'Invalid INVENTORY_TREATMENT value.';
        END IF;
        IF v_action = 'REASSIGN_REFERENCE_PRESERVE_QUANTITY'
           AND (p_current_identity IS DISTINCT FROM 'CONFIRMED_SAME'
                OR NOT public.reconciliation_is_nonempty_json_string(p_decision_value->'target_product_reference')) THEN
            RAISE EXCEPTION 'REASSIGN_REFERENCE_PRESERVE_QUANTITY requires CONFIRMED_SAME and a non-empty target reference.';
        END IF;
    ELSIF p_decision_type = 'SALES_HISTORY_TREATMENT' THEN
        IF (SELECT COUNT(*) FROM jsonb_object_keys(p_decision_value)) <> 12
           OR NOT (p_decision_value ?& ARRAY['action','source_product_reference','target_product_reference','sale_scope','sale_ids','sale_item_ids','product_name_handling','sku_handling','unit_price_handling','line_total_handling','receipt_handling','reason'])
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'action', ARRAY['PRESERVE_HISTORICAL_RECORDS','DISPLAY_MAPPING_ONLY','REASSIGN_REFERENCE_PRESERVE_HISTORICAL_VALUES','REQUIRE_MANUAL_SALES_REVIEW'])
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'sale_scope', ARRAY['ALL_SALES','SELECTED_SALES'])
           OR NOT public.reconciliation_is_json_string_array(p_decision_value->'sale_ids')
           OR NOT public.reconciliation_is_json_string_array(p_decision_value->'sale_item_ids')
           OR (p_decision_value->>'sale_scope' = 'ALL_SALES' AND jsonb_array_length(p_decision_value->'sale_ids') + jsonb_array_length(p_decision_value->'sale_item_ids') <> 0)
           OR (p_decision_value->>'sale_scope' = 'SELECTED_SALES' AND jsonb_array_length(p_decision_value->'sale_ids') + jsonb_array_length(p_decision_value->'sale_item_ids') = 0)
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'product_name_handling', ARRAY['PRESERVE','DISPLAY_MAPPING'])
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'sku_handling', ARRAY['PRESERVE','DISPLAY_MAPPING'])
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'unit_price_handling', ARRAY['PRESERVE','REQUIRE_REVIEW'])
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'line_total_handling', ARRAY['PRESERVE','REQUIRE_REVIEW'])
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'receipt_handling', ARRAY['PRESERVE','DISPLAY_MAPPING'])
           OR NOT public.reconciliation_is_json_string_or_null(p_decision_value->'target_product_reference')
           OR (v_action IN ('DISPLAY_MAPPING_ONLY','REASSIGN_REFERENCE_PRESERVE_HISTORICAL_VALUES')
               AND NOT public.reconciliation_is_nonempty_json_string(p_decision_value->'target_product_reference'))
           OR (v_action NOT IN ('DISPLAY_MAPPING_ONLY','REASSIGN_REFERENCE_PRESERVE_HISTORICAL_VALUES')
               AND jsonb_typeof(p_decision_value->'target_product_reference') IS DISTINCT FROM 'null') THEN
            RAISE EXCEPTION 'Invalid SALES_HISTORY_TREATMENT value.';
        END IF;
    ELSIF p_decision_type = 'LOCAL_ONLY_TREATMENT' THEN
        IF p_review_scope <> 'LOCAL_ONLY' OR (SELECT COUNT(*) FROM jsonb_object_keys(p_decision_value)) <> 5
           OR NOT (p_decision_value ?& ARRAY['action','source_product_reference','target_product_reference','operational_scope','reason'])
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'action', ARRAY['CREATE_IN_SUPABASE_LATER','INTENTIONALLY_ABSENT','REQUIRES_INVESTIGATION'])
           OR NOT public.reconciliation_is_nonempty_json_string(p_decision_value->'source_product_reference')
           OR jsonb_typeof(p_decision_value->'target_product_reference') IS DISTINCT FROM 'null'
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'operational_scope', ARRAY['LOCAL_CATALOG_ONLY'])
           OR NOT public.reconciliation_is_nonempty_json_string(p_decision_value->'reason') THEN
            RAISE EXCEPTION 'Invalid LOCAL_ONLY_TREATMENT value.';
        END IF;
    ELSIF p_decision_type = 'SUPABASE_ONLY_TREATMENT' THEN
        IF p_review_scope <> 'SUPABASE_ONLY' OR (SELECT COUNT(*) FROM jsonb_object_keys(p_decision_value)) <> 5
           OR NOT (p_decision_value ?& ARRAY['action','source_product_reference','target_local_product_reference','operational_scope','reason'])
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'action', ARRAY['KEEP_SUPABASE_ONLY','MATCH_TO_FUTURE_LOCAL_REVIEW','INTENTIONALLY_SEPARATE','REQUIRES_INVESTIGATION'])
           OR NOT public.reconciliation_is_nonempty_json_string(p_decision_value->'source_product_reference')
           OR NOT public.reconciliation_is_json_string_or_null(p_decision_value->'target_local_product_reference')
           OR (p_decision_value->>'action' = 'MATCH_TO_FUTURE_LOCAL_REVIEW'
               AND NOT public.reconciliation_is_nonempty_json_string(p_decision_value->'target_local_product_reference'))
           OR (p_decision_value->>'action' <> 'MATCH_TO_FUTURE_LOCAL_REVIEW'
               AND jsonb_typeof(p_decision_value->'target_local_product_reference') IS DISTINCT FROM 'null')
           OR NOT public.reconciliation_is_json_enum(p_decision_value->'operational_scope', ARRAY['SUPABASE_CATALOG_ONLY'])
           OR NOT public.reconciliation_is_nonempty_json_string(p_decision_value->'reason') THEN
            RAISE EXCEPTION 'Invalid SUPABASE_ONLY_TREATMENT value.';
        END IF;
    END IF;
END;
$function$;

-- 9. Protected append: decision chain -------------------------------------------
CREATE OR REPLACE FUNCTION public.append_reconciliation_decision(
    p_review_id TEXT,
    p_decision_type TEXT,
    p_decision_status TEXT,
    p_decision_value JSONB,
    p_decision_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id UUID := auth.uid();
    v_role TEXT;
    v_profile_status TEXT;
    v_current_id UUID;
    v_previous_value JSONB;
    v_new_id UUID;
    v_scope TEXT;
    v_current_identity TEXT;
    v_lock_key TEXT;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT pf.role::text, pf.status
      INTO v_role, v_profile_status
      FROM public.profiles AS pf
     WHERE pf.id = v_actor_id;
    IF NOT FOUND OR v_role IS DISTINCT FROM 'ADMIN' OR v_profile_status IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'Only active Super Admins may append reconciliation decisions.';
    END IF;

    IF p_decision_status NOT IN ('COMPLETED', 'NOT_APPLICABLE') THEN
        RAISE EXCEPTION 'Invalid reconciliation decision status.';
    END IF;
    IF p_decision_status = 'COMPLETED'
       AND (p_decision_value IS NULL OR jsonb_typeof(p_decision_value) = 'null') THEN
        RAISE EXCEPTION 'COMPLETED decisions require a non-null JSON decision_value.';
    END IF;
    IF p_decision_status = 'NOT_APPLICABLE'
       AND (p_decision_value IS NOT NULL OR p_decision_note IS NULL OR BTRIM(p_decision_note) = '') THEN
        RAISE EXCEPTION 'NOT_APPLICABLE decisions require a null value and a non-empty note.';
    END IF;
    IF p_decision_type = 'IDENTITY' THEN
        IF p_decision_status <> 'COMPLETED'
           OR p_decision_value #>> '{}' NOT IN ('NEEDS_VERIFICATION', 'CONFIRMED_SAME', 'CONFIRMED_DIFFERENT') THEN
            RAISE EXCEPTION 'IDENTITY requires NEEDS_VERIFICATION, CONFIRMED_SAME, or CONFIRMED_DIFFERENT.';
        END IF;
    ELSIF p_decision_type = 'REVIEW_DISPOSITION' THEN
        IF p_decision_status <> 'COMPLETED'
           OR p_decision_value #>> '{}' NOT IN ('ACTIVE', 'DEFERRED') THEN
            RAISE EXCEPTION 'REVIEW_DISPOSITION requires ACTIVE or DEFERRED.';
        END IF;
        IF p_decision_value #>> '{}' = 'DEFERRED'
           AND (p_decision_note IS NULL OR BTRIM(p_decision_note) = '') THEN
            RAISE EXCEPTION 'DEFERRED disposition requires a non-empty note.';
        END IF;
    END IF;

    SELECT r.review_scope INTO v_scope
      FROM public.reconciliation_reviews AS r
     WHERE r.review_id = p_review_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reconciliation review not found.';
    END IF;
    IF v_scope IN ('LOCAL_ONLY', 'SUPABASE_ONLY') AND p_decision_type = 'IDENTITY' THEN
        RAISE EXCEPTION 'Unmatched reviews do not accept IDENTITY decisions.';
    END IF;
    IF v_scope IN ('CANDIDATE_PAIR', 'EXACT_SKU')
       AND p_decision_type IN ('LOCAL_ONLY_TREATMENT', 'SUPABASE_ONLY_TREATMENT') THEN
        RAISE EXCEPTION 'Unmatched treatments are only valid on unmatched reviews.';
    END IF;

    -- Serialize every decision write for this review before reading identity,
    -- the current decision leaf, or validating dependent treatment rules.
    v_lock_key := 'reconciliation-review:' || length(p_review_id)::TEXT || ':' || p_review_id;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_key, 0));

    SELECT d.decision_value #>> '{}' INTO v_current_identity
      FROM public.reconciliation_decisions AS d
     WHERE d.review_id = p_review_id
       AND d.decision_type = 'IDENTITY'
       AND NOT EXISTS (
            SELECT 1 FROM public.reconciliation_decisions AS child
             WHERE child.supersedes_decision_id = d.decision_id
       )
     LIMIT 1;
    PERFORM public.validate_reconciliation_decision_value(
        p_decision_type, p_decision_status, p_decision_value, p_decision_note,
        v_scope, v_current_identity
    );

    SELECT d.decision_id, d.decision_value
      INTO v_current_id, v_previous_value
      FROM public.reconciliation_decisions AS d
     WHERE d.review_id = p_review_id
       AND d.decision_type = p_decision_type
       AND NOT EXISTS (
            SELECT 1 FROM public.reconciliation_decisions AS child
             WHERE child.supersedes_decision_id = d.decision_id
       )
     ORDER BY d.created_at DESC, d.decision_id DESC
     LIMIT 1;

    INSERT INTO public.reconciliation_decisions (
        review_id, decision_type, decision_status, decision_value, decision_note,
        previous_value, operator_user_id, operator_role_at_decision, supersedes_decision_id
    ) VALUES (
        p_review_id, p_decision_type, p_decision_status, p_decision_value, NULLIF(BTRIM(p_decision_note), ''),
        v_previous_value, v_actor_id, 'ADMIN', v_current_id
    ) RETURNING decision_id INTO v_new_id;
    RETURN v_new_id;
END;
$function$;


-- 10. Protected append: evidence -------------------------------------------------
CREATE OR REPLACE FUNCTION public.append_reconciliation_evidence(
    p_review_id TEXT,
    p_decision_id UUID,
    p_evidence_type TEXT,
    p_description TEXT,
    p_reference_text TEXT DEFAULT NULL,
    p_attachment_reference TEXT DEFAULT NULL,
    p_evidence_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id UUID := auth.uid();
    v_role TEXT;
    v_profile_status TEXT;
    v_evidence_id UUID;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;
    SELECT pf.role::text, pf.status INTO v_role, v_profile_status
      FROM public.profiles AS pf WHERE pf.id = v_actor_id;
    IF NOT FOUND OR v_role IS DISTINCT FROM 'ADMIN' OR v_profile_status IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'Only active Super Admins may append reconciliation evidence.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.reconciliation_reviews WHERE review_id = p_review_id) THEN
        RAISE EXCEPTION 'Reconciliation review not found.';
    END IF;
    IF p_decision_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.reconciliation_decisions
         WHERE decision_id = p_decision_id AND review_id = p_review_id
    ) THEN
        RAISE EXCEPTION 'Decision does not belong to this review.';
    END IF;
    IF p_description IS NULL OR BTRIM(p_description) = '' THEN
        RAISE EXCEPTION 'Evidence description is required.';
    END IF;
    IF p_evidence_metadata IS NOT NULL AND jsonb_typeof(p_evidence_metadata) <> 'object' THEN
        RAISE EXCEPTION 'Evidence metadata must be a JSON object.';
    END IF;

    INSERT INTO public.reconciliation_evidence (
        review_id, decision_id, evidence_type, description, reference_text,
        attachment_reference, evidence_metadata, operator_user_id
    ) VALUES (

        p_review_id, p_decision_id, p_evidence_type, BTRIM(p_description),
        NULLIF(BTRIM(p_reference_text), ''), NULLIF(BTRIM(p_attachment_reference), ''),
        p_evidence_metadata, v_actor_id
    ) RETURNING evidence_id INTO v_evidence_id;
    RETURN v_evidence_id;
END;
$function$;


-- 11. Protected conflict operations ----------------------------------------------
CREATE OR REPLACE FUNCTION public.append_reconciliation_conflict(
    p_review_id TEXT,
    p_conflict_type TEXT,
    p_conflict_scope TEXT,
    p_severity TEXT,
    p_description TEXT,
    p_local_observed_value JSONB DEFAULT NULL,
    p_supabase_observed_value JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id UUID := auth.uid();
    v_role TEXT;
    v_profile_status TEXT;
    v_conflict_id UUID;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
    SELECT pf.role::text, pf.status INTO v_role, v_profile_status
      FROM public.profiles AS pf WHERE pf.id = v_actor_id;
    IF NOT FOUND OR v_role IS DISTINCT FROM 'ADMIN' OR v_profile_status IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'Only active Super Admins may append reconciliation conflicts.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.reconciliation_reviews WHERE review_id = p_review_id) THEN
        RAISE EXCEPTION 'Reconciliation review not found.';
    END IF;
    IF p_severity NOT IN ('BLOCKING', 'WARNING') THEN
        RAISE EXCEPTION 'Invalid conflict severity.';
    END IF;
    PERFORM public.validate_reconciliation_conflict_scope(p_conflict_type, p_conflict_scope);
    IF p_description IS NULL OR BTRIM(p_description) = '' THEN
        RAISE EXCEPTION 'Conflict description is required.';
    END IF;
    INSERT INTO public.reconciliation_conflicts (
        review_id, conflict_type, conflict_scope, severity, description,
        local_observed_value, supabase_observed_value
    ) VALUES (
        p_review_id, p_conflict_type, p_conflict_scope, p_severity, BTRIM(p_description),
        p_local_observed_value, p_supabase_observed_value
    ) RETURNING conflict_id INTO v_conflict_id;
    RETURN v_conflict_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_reconciliation_conflict(
    p_conflict_id UUID,
    p_resolution_decision_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id UUID := auth.uid();
    v_role TEXT;
    v_profile_status TEXT;
    v_review_id TEXT;
    v_review_scope TEXT;
    v_conflict_type TEXT;
    v_conflict_scope TEXT;
    v_conflict_state TEXT;
    v_identity TEXT;
    v_resolution_type TEXT;
    v_resolution_status TEXT;
    v_resolution_value JSONB;
    v_resolution_note TEXT;
    v_lock_key TEXT;
    v_updated_rows INTEGER;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
    SELECT pf.role::text, pf.status INTO v_role, v_profile_status
      FROM public.profiles AS pf WHERE pf.id = v_actor_id;
    IF NOT FOUND OR v_role IS DISTINCT FROM 'ADMIN' OR v_profile_status IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'Only active Super Admins may resolve reconciliation conflicts.';
    END IF;

    SELECT c.review_id INTO v_review_id
      FROM public.reconciliation_conflicts AS c
     WHERE c.conflict_id = p_conflict_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation conflict not found.'; END IF;

    v_lock_key := 'reconciliation-review:' || length(v_review_id)::TEXT || ':' || v_review_id;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_key, 0));

    SELECT c.conflict_type, c.conflict_scope, c.conflict_state, r.review_scope
      INTO v_conflict_type, v_conflict_scope, v_conflict_state, v_review_scope
      FROM public.reconciliation_conflicts AS c
      JOIN public.reconciliation_reviews AS r ON r.review_id = c.review_id
     WHERE c.conflict_id = p_conflict_id AND c.review_id = v_review_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation conflict is not attached to the locked review.'; END IF;
    IF v_conflict_state NOT IN ('OPEN', 'DEFERRED') THEN
        RAISE EXCEPTION 'Only OPEN or DEFERRED conflicts may be resolved.';
    END IF;
    PERFORM public.validate_reconciliation_conflict_scope(v_conflict_type, v_conflict_scope);

    SELECT d.decision_value #>> '{}' INTO v_identity
      FROM public.reconciliation_decisions AS d
     WHERE d.review_id = v_review_id AND d.decision_type = 'IDENTITY'
       AND NOT EXISTS (SELECT 1 FROM public.reconciliation_decisions AS child
                        WHERE child.supersedes_decision_id = d.decision_id);

    SELECT d.decision_type, d.decision_status, d.decision_value, d.decision_note
      INTO v_resolution_type, v_resolution_status, v_resolution_value, v_resolution_note
      FROM public.reconciliation_decisions AS d
     WHERE d.decision_id = p_resolution_decision_id
       AND d.review_id = v_review_id
       AND NOT EXISTS (SELECT 1 FROM public.reconciliation_decisions AS child
                        WHERE child.supersedes_decision_id = d.decision_id);
    IF NOT FOUND OR v_resolution_type = 'REVIEW_DISPOSITION' OR v_resolution_status <> 'COMPLETED' THEN
        RAISE EXCEPTION 'Conflict resolution requires a current COMPLETED business decision.';
    END IF;
    PERFORM public.validate_reconciliation_decision_value(
        v_resolution_type, v_resolution_status, v_resolution_value, v_resolution_note,
        v_review_scope, v_identity
    );
    PERFORM public.validate_reconciliation_conflict_resolution(
        v_conflict_type, v_conflict_scope, v_identity, v_resolution_type, v_resolution_value
    );
    IF NOT EXISTS (
        SELECT 1 FROM public.reconciliation_evidence AS e
         WHERE e.review_id = v_review_id
           AND (e.decision_id = p_resolution_decision_id OR e.decision_id IS NULL)
           AND (
             (v_conflict_type IN ('SAME_SKU_DIFFERENT_BARCODE', 'UNRESOLVED_BARCODE') AND e.evidence_type IN ('BARCODE_SCAN', 'PACKAGE_PHOTO', 'PHYSICAL_INSPECTION'))
             OR (v_conflict_type IN ('DIFFERENT_CONNECTOR', 'DIFFERENT_CAPACITY', 'DIFFERENT_FORM_FACTOR', 'SAME_NAME_DIFFERENT_PHYSICAL_FORM') AND e.evidence_type IN ('PHYSICAL_INSPECTION', 'PACKAGE_PHOTO', 'PRODUCT_PHOTO', 'MANUFACTURER_MODEL'))
             OR (v_conflict_type IN ('UNRESOLVED_PRICE', 'UNRESOLVED_INVENTORY_TREATMENT', 'UNRESOLVED_SALES_HISTORY_TREATMENT') AND e.evidence_type IN ('OPERATOR_NOTE', 'PURCHASE_RECORD', 'SUPPLIER_INVOICE'))
             OR (v_conflict_type NOT IN ('SAME_SKU_DIFFERENT_BARCODE', 'UNRESOLVED_BARCODE', 'DIFFERENT_CONNECTOR', 'DIFFERENT_CAPACITY', 'DIFFERENT_FORM_FACTOR', 'SAME_NAME_DIFFERENT_PHYSICAL_FORM', 'UNRESOLVED_PRICE', 'UNRESOLVED_INVENTORY_TREATMENT', 'UNRESOLVED_SALES_HISTORY_TREATMENT') AND e.evidence_type IN ('OPERATOR_NOTE', 'PACKAGE_PHOTO', 'PRODUCT_PHOTO', 'MANUFACTURER_MODEL'))
           )
    ) THEN
        RAISE EXCEPTION 'Appropriate supporting evidence is required.';
    END IF;

    UPDATE public.reconciliation_conflicts
       SET conflict_state = 'RESOLVED',
           resolution_decision_id = p_resolution_decision_id,
           resolved_at = NOW()
     WHERE conflict_id = p_conflict_id
       AND review_id = v_review_id
       AND conflict_state IN ('OPEN', 'DEFERRED');
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
        RAISE EXCEPTION 'Conflict state changed before resolution completed.';
    END IF;
END;
$function$;


-- 12. Protected technical gate evaluation ---------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_reconciliation_review_gate(
    p_review_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id UUID := auth.uid();
    v_role TEXT;
    v_profile_status TEXT;
    v_scope TEXT;
    v_state TEXT := 'READY';
    v_summary JSONB := '{}'::jsonb;
    v_blockers JSONB := '[]'::jsonb;
    v_identity JSONB;
    v_disposition JSONB;
    v_requirement TEXT;
    v_type TEXT;
    v_has_blocking_conflict BOOLEAN;
    v_input_digest TEXT;
    v_evaluation_id UUID;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
    SELECT pf.role::text, pf.status INTO v_role, v_profile_status
      FROM public.profiles AS pf WHERE pf.id = v_actor_id;
    IF NOT FOUND OR v_role IS DISTINCT FROM 'ADMIN' OR v_profile_status IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'Only active Super Admins may evaluate reconciliation gates.';
    END IF;

    SELECT r.review_scope INTO v_scope
      FROM public.reconciliation_reviews AS r WHERE r.review_id = p_review_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation review not found.'; END IF;

    SELECT d.decision_value INTO v_disposition
      FROM public.reconciliation_decisions AS d
     WHERE d.review_id = p_review_id AND d.decision_type = 'REVIEW_DISPOSITION'
       AND NOT EXISTS (SELECT 1 FROM public.reconciliation_decisions AS child
                        WHERE child.supersedes_decision_id = d.decision_id);
    IF v_disposition #>> '{}' = 'DEFERRED' THEN
        v_state := 'DEFERRED';
        v_blockers := jsonb_build_array('Review disposition is DEFERRED.');
    END IF;

    IF v_scope IN ('CANDIDATE_PAIR', 'EXACT_SKU') THEN
        SELECT d.decision_value INTO v_identity
          FROM public.reconciliation_decisions AS d
         WHERE d.review_id = p_review_id AND d.decision_type = 'IDENTITY'
           AND NOT EXISTS (SELECT 1 FROM public.reconciliation_decisions AS child
                            WHERE child.supersedes_decision_id = d.decision_id);
        IF v_identity IS NULL THEN
            IF v_state <> 'DEFERRED' THEN v_state := 'BLOCKED'; END IF;
            v_requirement := 'BLOCKED';
            v_blockers := v_blockers || jsonb_build_array('IDENTITY decision is PENDING.');
        ELSIF v_identity #>> '{}' = 'NEEDS_VERIFICATION' THEN
            IF v_state <> 'DEFERRED' THEN v_state := 'BLOCKED'; END IF;
            v_requirement := 'BLOCKED';
            v_blockers := v_blockers || jsonb_build_array('IDENTITY requires verification.');
        ELSE
            v_requirement := 'COMPLETED';
        END IF;
        v_summary := jsonb_build_object('IDENTITY', v_requirement);

        FOREACH v_type IN ARRAY ARRAY[
            'SKU', 'BARCODE', 'SELLING_PRICE', 'COST_PRICE', 'CATEGORY', 'STATUS',
            'BRAND', 'MODEL', 'VARIANT', 'DESCRIPTION', 'INVENTORY_TREATMENT',
            'SALES_HISTORY_TREATMENT'
        ] LOOP
            IF v_identity IS NULL OR v_identity #>> '{}' = 'NEEDS_VERIFICATION' THEN
                -- Identity is unresolved, so downstream requirements are blocked;
                -- they are not silently treated as not applicable.
                v_requirement := 'BLOCKED';
            ELSIF v_identity #>> '{}' = 'CONFIRMED_SAME'
               OR v_type IN ('INVENTORY_TREATMENT', 'SALES_HISTORY_TREATMENT') THEN
                SELECT CASE WHEN d.decision_status = 'COMPLETED' THEN 'COMPLETED'
                            WHEN d.decision_status = 'NOT_APPLICABLE' THEN 'NOT_APPLICABLE'
                            ELSE 'REQUIRED' END
                  INTO v_requirement
                  FROM public.reconciliation_decisions AS d
                 WHERE d.review_id = p_review_id AND d.decision_type = v_type
                   AND NOT EXISTS (SELECT 1 FROM public.reconciliation_decisions AS child
                                    WHERE child.supersedes_decision_id = d.decision_id);
                v_requirement := COALESCE(v_requirement, 'REQUIRED');
                IF v_requirement = 'REQUIRED' AND v_state <> 'DEFERRED' THEN
                    v_state := 'BLOCKED';
                    v_blockers := v_blockers || jsonb_build_array(v_type || ' decision is required.');
                END IF;
            ELSE
                -- CONFIRMED_DIFFERENT may make a shared field genuinely not
                -- applicable; operational treatments remain required.
                v_requirement := 'NOT_APPLICABLE';
            END IF;
            v_summary := v_summary || jsonb_build_object(v_type, v_requirement);
        END LOOP;
    ELSE
        FOREACH v_type IN ARRAY ARRAY[
            CASE WHEN v_scope = 'LOCAL_ONLY' THEN 'LOCAL_ONLY_TREATMENT' ELSE 'SUPABASE_ONLY_TREATMENT' END,
            'INVENTORY_TREATMENT', 'SALES_HISTORY_TREATMENT'
        ] LOOP
            SELECT CASE
                WHEN d.decision_status = 'COMPLETED' THEN 'COMPLETED'
                WHEN d.decision_status = 'NOT_APPLICABLE'
                     AND v_type IN ('INVENTORY_TREATMENT','SALES_HISTORY_TREATMENT') THEN 'NOT_APPLICABLE'
                ELSE 'REQUIRED'
            END
              INTO v_requirement
              FROM public.reconciliation_decisions AS d
             WHERE d.review_id = p_review_id AND d.decision_type = v_type
               AND NOT EXISTS (SELECT 1 FROM public.reconciliation_decisions AS child
                                WHERE child.supersedes_decision_id = d.decision_id);
            v_requirement := COALESCE(v_requirement, 'REQUIRED');
            v_summary := v_summary || jsonb_build_object(v_type, v_requirement);
            IF v_requirement = 'REQUIRED' AND v_state <> 'DEFERRED' THEN
                v_state := 'BLOCKED';
                v_blockers := v_blockers || jsonb_build_array(v_type || ' decision is required.');
            END IF;
        END LOOP;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.reconciliation_conflicts AS c
         WHERE c.review_id = p_review_id
           AND c.severity = 'BLOCKING'
           AND c.conflict_state IN ('OPEN', 'DEFERRED')
    ) INTO v_has_blocking_conflict;
    IF v_has_blocking_conflict AND v_state <> 'DEFERRED' THEN
        v_state := 'BLOCKED';
        v_blockers := v_blockers || jsonb_build_array('Open blocking conflict exists.');
    END IF;

    SELECT md5(string_agg(x.payload, '|' ORDER BY x.payload)) INTO v_input_digest
      FROM (
        SELECT d.decision_id::text || ':' || d.decision_type || ':' || d.decision_status AS payload
          FROM public.reconciliation_decisions AS d WHERE d.review_id = p_review_id
        UNION ALL
        SELECT c.conflict_id::text || ':' || c.conflict_state || ':' || c.severity
          FROM public.reconciliation_conflicts AS c WHERE c.review_id = p_review_id
      ) AS x;
    v_input_digest := COALESCE(v_input_digest, md5(p_review_id));

    INSERT INTO public.reconciliation_gate_evaluations (
        gate_name, evaluation_scope, review_id, gate_state,
        decision_requirement_summary, blocking_summary, input_digest, evaluated_by
    ) VALUES (
        'REVIEW_GATE', 'REVIEW', p_review_id, v_state,
        v_summary, v_blockers, v_input_digest, v_actor_id
    ) RETURNING gate_evaluation_id INTO v_evaluation_id;
    RETURN v_evaluation_id;
END;
$function$;


-- Global technical gate: no preview or Admin approval is part of this result.
CREATE OR REPLACE FUNCTION public.evaluate_catalog_sync_ready()
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id UUID := auth.uid();
    v_role TEXT;
    v_profile_status TEXT;
    v_review RECORD;
    v_review_evaluation UUID;
    v_latest RECORD;
    v_state TEXT := 'BLOCKED';
    v_counts JSONB;
    v_blockers JSONB := '[]'::jsonb;
    v_evaluation_id UUID;
    v_expected_basis CONSTANT TEXT := 'M8B-42-ROW-EXPORT-2026-09-21';
    v_total_reviews INTEGER;
    v_total_snapshots INTEGER;
    v_local_snapshots INTEGER;
    v_supabase_snapshots INTEGER;
    v_candidate_reviews INTEGER;
    v_local_reviews INTEGER;
    v_supabase_reviews INTEGER;
    v_expected_reviews JSONB := '[]'::jsonb;
    v_expected_unmatched_reviews JSONB := '[]'::jsonb;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
    SELECT pf.role::text, pf.status INTO v_role, v_profile_status
      FROM public.profiles AS pf WHERE pf.id = v_actor_id;
    IF NOT FOUND OR v_role IS DISTINCT FROM 'ADMIN' OR v_profile_status IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'Only active Super Admins may evaluate CATALOG_SYNC_READY.';
    END IF;

    v_expected_reviews := jsonb_build_array(
        jsonb_build_object('reviewId','R01','scope','EXACT_SKU','localRef','prod-1','supabaseRef','prod-1'),
        jsonb_build_object('reviewId','R02','scope','EXACT_SKU','localRef','prod-2','supabaseRef','prod-2'),
        jsonb_build_object('reviewId','R03','scope','EXACT_SKU','localRef','prod-3','supabaseRef','prod-3'),
        jsonb_build_object('reviewId','R04','scope','EXACT_SKU','localRef','prod-4','supabaseRef','prod-4'),
        jsonb_build_object('reviewId','R05','scope','EXACT_SKU','localRef','prod-5','supabaseRef','prod-5'),
        jsonb_build_object('reviewId','R06','scope','EXACT_SKU','localRef','prod-6','supabaseRef','prod-6'),
        jsonb_build_object('reviewId','R07','scope','EXACT_SKU','localRef','prod-7','supabaseRef','prod-7'),
        jsonb_build_object('reviewId','R08','scope','EXACT_SKU','localRef','prod-9','supabaseRef','prod-8'),
        jsonb_build_object('reviewId','R09','scope','CANDIDATE_PAIR','localRef','prod-8','supabaseRef','prod-10'),
        jsonb_build_object('reviewId','R10','scope','CANDIDATE_PAIR','localRef','prod-12','supabaseRef','prod-14'),
        jsonb_build_object('reviewId','R11','scope','CANDIDATE_PAIR','localRef','prod-13','supabaseRef','prod-12'),
        jsonb_build_object('reviewId','R12','scope','CANDIDATE_PAIR','localRef','prod-16','supabaseRef','prod-17'),
        jsonb_build_object('reviewId','R13','scope','CANDIDATE_PAIR','localRef','prod-20','supabaseRef','prod-20'),
        jsonb_build_object('reviewId','R14','scope','CANDIDATE_PAIR','localRef','prod-21','supabaseRef','prod-22'),
        jsonb_build_object('reviewId','R15','scope','CANDIDATE_PAIR','localRef','prod-23','supabaseRef','prod-25'),
        jsonb_build_object('reviewId','R16','scope','CANDIDATE_PAIR','localRef','prod-24','supabaseRef','prod-26'),
        jsonb_build_object('reviewId','R17','scope','CANDIDATE_PAIR','localRef','prod-25','supabaseRef','prod-28'),
        jsonb_build_object('reviewId','R18','scope','CANDIDATE_PAIR','localRef','prod-26','supabaseRef','prod-29'),
        jsonb_build_object('reviewId','R19','scope','CANDIDATE_PAIR','localRef','prod-27','supabaseRef','prod-31'),
        jsonb_build_object('reviewId','R20','scope','CANDIDATE_PAIR','localRef','prod-29','supabaseRef','prod-32'),
        jsonb_build_object('reviewId','R21','scope','CANDIDATE_PAIR','localRef','prod-30','supabaseRef','prod-35'),
        jsonb_build_object('reviewId','R22','scope','CANDIDATE_PAIR','localRef','prod-31','supabaseRef','prod-37'),
        jsonb_build_object('reviewId','R23','scope','CANDIDATE_PAIR','localRef','prod-32','supabaseRef','prod-36'),
        jsonb_build_object('reviewId','R24','scope','CANDIDATE_PAIR','localRef','prod-33','supabaseRef','prod-39'),
        jsonb_build_object('reviewId','R25','scope','CANDIDATE_PAIR','localRef','prod-34','supabaseRef','prod-38'),
        jsonb_build_object('reviewId','R26','scope','CANDIDATE_PAIR','localRef','prod-35','supabaseRef','prod-40'),
        jsonb_build_object('reviewId','R27','scope','CANDIDATE_PAIR','localRef','prod-37','supabaseRef','prod-41')
    );
    v_expected_unmatched_reviews := jsonb_build_array(
        jsonb_build_object('reviewId','LOCAL-ONLY-BAS-GAN65W-BLK','sourceRef','prod-10'),
        jsonb_build_object('reviewId','LOCAL-ONLY-APL-USBC-1M','sourceRef','prod-11'),
        jsonb_build_object('reviewId','LOCAL-ONLY-UGR-100W-2M','sourceRef','prod-14'),
        jsonb_build_object('reviewId','LOCAL-ONLY-CAS-IP16PM-MAG','sourceRef','prod-15'),
        jsonb_build_object('reviewId','LOCAL-ONLY-CAS-CAMON30-ARM','sourceRef','prod-17'),
        jsonb_build_object('reviewId','LOCAL-ONLY-CAS-INFNOT40-CLR','sourceRef','prod-18'),
        jsonb_build_object('reviewId','LOCAL-ONLY-SCR-IP16P-PRIV','sourceRef','prod-19'),
        jsonb_build_object('reviewId','LOCAL-ONLY-PB-ANK-20K-20W','sourceRef','prod-22'),
        jsonb_build_object('reviewId','LOCAL-ONLY-LAP-APL-96W','sourceRef','prod-28'),
        jsonb_build_object('reviewId','LOCAL-ONLY-ADP-SAM-USBC35','sourceRef','prod-36'),
        jsonb_build_object('reviewId','LOCAL-ONLY-COM-LOG-M350','sourceRef','prod-38'),
        jsonb_build_object('reviewId','LOCAL-ONLY-COM-LOG-K380','sourceRef','prod-39'),
        jsonb_build_object('reviewId','LOCAL-ONLY-COM-MAT-EXT80','sourceRef','prod-40'),
        jsonb_build_object('reviewId','LOCAL-ONLY-OTH-CLN-7IN1','sourceRef','prod-41'),
        jsonb_build_object('reviewId','LOCAL-ONLY-OTH-ORG-MAG5','sourceRef','prod-42'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-ACC-DESK-STND','sourceRef','prod-27'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-ANK-737-140W','sourceRef','prod-24'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-APL-USBC-LTG-1M','sourceRef','prod-11'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-BAS-100W-2M','sourceRef','prod-13'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-CASE-IP13-HYB','sourceRef','prod-18'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-CASE-IP14P-ARM','sourceRef','prod-16'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-CASE-IP15PM-MAG','sourceRef','prod-15'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-CHG-APL-67W','sourceRef','prod-34'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-CHG-DELL-65W','sourceRef','prod-33'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-GLS-IP14-2PK','sourceRef','prod-21'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-GLS-IP15PM-PRV','sourceRef','prod-19'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-LAP-COOL-RGB','sourceRef','prod-30'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-LOG-M185-GRY','sourceRef','prod-42'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-ORA-65W-GAN','sourceRef','prod-9'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-ORA-PB-27K','sourceRef','prod-23')
    );
    SELECT COUNT(*) FILTER (WHERE evidence_basis_version = v_expected_basis),
           COUNT(*) FILTER (WHERE source_side = 'LOCAL' AND evidence_basis_version = v_expected_basis),
           COUNT(*) FILTER (WHERE source_side = 'SUPABASE' AND evidence_basis_version = v_expected_basis)
      INTO v_total_snapshots, v_local_snapshots, v_supabase_snapshots
      FROM public.reconciliation_source_snapshots;
    SELECT COUNT(*) FILTER (WHERE evidence_basis_version = v_expected_basis),
           COUNT(*) FILTER (WHERE evidence_basis_version = v_expected_basis AND review_scope IN ('CANDIDATE_PAIR', 'EXACT_SKU')),
           COUNT(*) FILTER (WHERE evidence_basis_version = v_expected_basis AND review_scope = 'LOCAL_ONLY'),
           COUNT(*) FILTER (WHERE evidence_basis_version = v_expected_basis AND review_scope = 'SUPABASE_ONLY')
      INTO v_total_reviews, v_candidate_reviews, v_local_reviews, v_supabase_reviews
      FROM public.reconciliation_reviews;

    IF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(v_expected_reviews) AS e
          LEFT JOIN public.reconciliation_reviews AS r
            ON r.review_id = e->>'reviewId' AND r.evidence_basis_version = v_expected_basis
          LEFT JOIN public.reconciliation_source_snapshots AS ls
            ON ls.snapshot_id = r.local_snapshot_id
          LEFT JOIN public.reconciliation_source_snapshots AS ss
            ON ss.snapshot_id = r.supabase_snapshot_id
         WHERE r.review_id IS NULL
            OR r.review_scope IS DISTINCT FROM e->>'scope'
            OR r.local_source_reference IS DISTINCT FROM e->>'localRef'
            OR r.supabase_source_reference IS DISTINCT FROM e->>'supabaseRef'
            OR ls.source_side IS DISTINCT FROM 'LOCAL'
            OR ls.source_record_reference IS DISTINCT FROM e->>'localRef'
            OR ss.source_side IS DISTINCT FROM 'SUPABASE'
            OR ss.source_record_reference IS DISTINCT FROM e->>'supabaseRef'
    ) THEN
        v_blockers := v_blockers || jsonb_build_array('Canonical candidate review mapping is incomplete or mismatched.');
    END IF;
    IF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(v_expected_unmatched_reviews) AS e
          LEFT JOIN public.reconciliation_reviews AS r
            ON r.review_id = e->>'reviewId' AND r.evidence_basis_version = v_expected_basis
          LEFT JOIN public.reconciliation_source_snapshots AS s
            ON s.snapshot_id = COALESCE(r.local_snapshot_id, r.supabase_snapshot_id)
         WHERE r.review_id IS NULL
            OR r.local_source_reference IS DISTINCT FROM CASE WHEN e->>'reviewId' LIKE 'LOCAL-ONLY-%' THEN e->>'sourceRef' ELSE NULL END
            OR r.supabase_source_reference IS DISTINCT FROM CASE WHEN e->>'reviewId' LIKE 'SUPABASE-ONLY-%' THEN e->>'sourceRef' ELSE NULL END
            OR s.evidence_basis_version IS DISTINCT FROM v_expected_basis
            OR s.source_record_reference IS DISTINCT FROM e->>'sourceRef'
            OR s.source_side IS DISTINCT FROM CASE WHEN e->>'reviewId' LIKE 'LOCAL-ONLY-%' THEN 'LOCAL' ELSE 'SUPABASE' END
    ) THEN
        v_blockers := v_blockers || jsonb_build_array('Canonical unmatched review mapping is incomplete or mismatched.');
    END IF;
    IF v_total_snapshots <> 84 OR v_local_snapshots <> 42 OR v_supabase_snapshots <> 42 THEN
        v_blockers := v_blockers || jsonb_build_array('Canonical snapshot coverage is not 84/42/42.');
    END IF;
    IF v_total_reviews <> 57 OR v_candidate_reviews <> 27 OR v_local_reviews <> 15 OR v_supabase_reviews <> 15 THEN
        v_blockers := v_blockers || jsonb_build_array('Canonical review coverage is not 57/27/15/15.');
    END IF;
    IF EXISTS (SELECT 1 FROM public.reconciliation_reviews WHERE review_id NOT IN (
        'R01','R02','R03','R04','R05','R06','R07','R08','R09','R10','R11','R12','R13','R14','R15','R16','R17','R18','R19','R20','R21','R22','R23','R24','R25','R26','R27',
        'LOCAL-ONLY-BAS-GAN65W-BLK','LOCAL-ONLY-APL-USBC-1M','LOCAL-ONLY-UGR-100W-2M','LOCAL-ONLY-CAS-IP16PM-MAG','LOCAL-ONLY-CAS-CAMON30-ARM','LOCAL-ONLY-CAS-INFNOT40-CLR','LOCAL-ONLY-SCR-IP16P-PRIV','LOCAL-ONLY-PB-ANK-20K-20W','LOCAL-ONLY-LAP-APL-96W','LOCAL-ONLY-ADP-SAM-USBC35','LOCAL-ONLY-COM-LOG-M350','LOCAL-ONLY-COM-LOG-K380','LOCAL-ONLY-COM-MAT-EXT80','LOCAL-ONLY-OTH-CLN-7IN1','LOCAL-ONLY-OTH-ORG-MAG5',
        'SUPABASE-ONLY-ACC-DESK-STND','SUPABASE-ONLY-ANK-737-140W','SUPABASE-ONLY-APL-USBC-LTG-1M','SUPABASE-ONLY-BAS-100W-2M','SUPABASE-ONLY-CASE-IP13-HYB','SUPABASE-ONLY-CASE-IP14P-ARM','SUPABASE-ONLY-CASE-IP15PM-MAG','SUPABASE-ONLY-CHG-APL-67W','SUPABASE-ONLY-CHG-DELL-65W','SUPABASE-ONLY-GLS-IP14-2PK','SUPABASE-ONLY-GLS-IP15PM-PRV','SUPABASE-ONLY-LAP-COOL-RGB','SUPABASE-ONLY-LOG-M185-GRY','SUPABASE-ONLY-ORA-65W-GAN','SUPABASE-ONLY-ORA-PB-27K'
    ) AND evidence_basis_version = v_expected_basis) THEN
        v_blockers := v_blockers || jsonb_build_array('Unexpected review ID exists in canonical basis.');
    END IF;
    IF EXISTS (SELECT 1 FROM public.reconciliation_reviews WHERE evidence_basis_version <> v_expected_basis) THEN
        v_blockers := v_blockers || jsonb_build_array('Review evidence basis version is not canonical.');
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.reconciliation_reviews r
         WHERE r.evidence_basis_version = v_expected_basis
           AND (
             (r.review_id ~ '^R[0-9]{2}$' AND r.review_scope NOT IN ('CANDIDATE_PAIR', 'EXACT_SKU'))
             OR (r.review_id LIKE 'LOCAL-ONLY-%' AND (r.review_scope <> 'LOCAL_ONLY' OR r.coverage_state <> 'UNMATCHED_LOCAL'))
             OR (r.review_id LIKE 'SUPABASE-ONLY-%' AND (r.review_scope <> 'SUPABASE_ONLY' OR r.coverage_state <> 'UNMATCHED_SUPABASE'))
           )
    ) THEN
        v_blockers := v_blockers || jsonb_build_array('Review scope or coverage does not match canonical review ID.');
    END IF;
    IF EXISTS (SELECT 1 FROM public.reconciliation_source_snapshots WHERE evidence_basis_version <> v_expected_basis) THEN
        v_blockers := v_blockers || jsonb_build_array('Snapshot evidence basis version is not canonical.');
    END IF;

-- Re-check the complete canonical contract, including classification and
-- coverage state, against the immutable canonical-review function.
IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(public.reconciliation_canonical_reviews()) AS e(x)
      LEFT JOIN public.reconciliation_reviews AS r
        ON r.review_id = e.x->>'reviewId' AND r.evidence_basis_version = v_expected_basis
      LEFT JOIN public.reconciliation_source_snapshots AS ls
        ON ls.snapshot_id = r.local_snapshot_id
      LEFT JOIN public.reconciliation_source_snapshots AS ss
        ON ss.snapshot_id = r.supabase_snapshot_id
     WHERE r.review_id IS NULL
        OR r.review_scope IS DISTINCT FROM e.x->>'scope'
        OR r.classification IS DISTINCT FROM e.x->>'classification'
        OR r.coverage_state IS DISTINCT FROM e.x->>'coverageState'
        OR r.local_source_reference IS DISTINCT FROM e.x->>'localRef'
        OR r.supabase_source_reference IS DISTINCT FROM e.x->>'supabaseRef'
        OR ls.source_side IS DISTINCT FROM 'LOCAL'
        OR ls.source_record_reference IS DISTINCT FROM e.x->>'localRef'
        OR ss.source_side IS DISTINCT FROM 'SUPABASE'
        OR ss.source_record_reference IS DISTINCT FROM e.x->>'supabaseRef'
) THEN
    v_blockers := v_blockers || jsonb_build_array('Canonical review contract is incomplete or mismatched.');
END IF;

    FOR v_review IN SELECT review_id FROM public.reconciliation_reviews WHERE evidence_basis_version = v_expected_basis ORDER BY review_id LOOP


        v_review_evaluation := public.evaluate_reconciliation_review_gate(v_review.review_id);
        SELECT g.gate_state, g.blocking_summary INTO v_latest
          FROM public.reconciliation_gate_evaluations AS g WHERE g.gate_evaluation_id = v_review_evaluation;
        IF v_latest.gate_state = 'DEFERRED' THEN
            v_blockers := v_blockers || jsonb_build_array(v_review.review_id || ': DEFERRED');
        ELSIF v_latest.gate_state <> 'READY' THEN
            v_blockers := v_blockers || v_latest.blocking_summary || jsonb_build_array('Review ' || v_review.review_id || ' is not READY.');
        END IF;
    END LOOP;

    IF jsonb_array_length(v_blockers) = 0 THEN v_state := 'READY'; END IF;
    SELECT jsonb_build_object(
        'totalReviews', v_total_reviews, 'candidateReviews', v_candidate_reviews,
        'localOnlyReviews', v_local_reviews, 'supabaseOnlyReviews', v_supabase_reviews,
        'totalSnapshots', v_total_snapshots, 'localSnapshots', v_local_snapshots,
        'supabaseSnapshots', v_supabase_snapshots
    ) INTO v_counts;

    INSERT INTO public.reconciliation_gate_evaluations (
        gate_name, evaluation_scope, gate_state, decision_requirement_summary,
        blocking_summary, input_digest, evaluated_by
    ) VALUES (
        'CATALOG_SYNC_READY', 'GLOBAL', v_state, v_counts,
        v_blockers, md5(v_expected_basis || ':' || v_counts::text || ':' || v_blockers::text), v_actor_id
    ) RETURNING gate_evaluation_id INTO v_evaluation_id;
    RETURN v_evaluation_id;
END;
$function$;

-- Append-only enforcement also applies to the table owner/service paths.
CREATE OR REPLACE FUNCTION public.prevent_reconciliation_immutable_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    RAISE EXCEPTION 'Reconciliation history is append-only: % cannot be updated or deleted.', TG_TABLE_NAME;
END;
$function$;

DROP TRIGGER IF EXISTS reconciliation_source_snapshots_immutable ON public.reconciliation_source_snapshots;
DROP TRIGGER IF EXISTS reconciliation_reviews_immutable ON public.reconciliation_reviews;
DROP TRIGGER IF EXISTS reconciliation_decisions_immutable ON public.reconciliation_decisions;
DROP TRIGGER IF EXISTS reconciliation_evidence_immutable ON public.reconciliation_evidence;
DROP TRIGGER IF EXISTS reconciliation_gate_evaluations_immutable ON public.reconciliation_gate_evaluations;

CREATE TRIGGER reconciliation_source_snapshots_immutable
    BEFORE UPDATE OR DELETE ON public.reconciliation_source_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.prevent_reconciliation_immutable_change();
CREATE TRIGGER reconciliation_reviews_immutable
    BEFORE UPDATE OR DELETE ON public.reconciliation_reviews
    FOR EACH ROW EXECUTE FUNCTION public.prevent_reconciliation_immutable_change();
CREATE TRIGGER reconciliation_decisions_immutable
    BEFORE UPDATE OR DELETE ON public.reconciliation_decisions
    FOR EACH ROW EXECUTE FUNCTION public.prevent_reconciliation_immutable_change();
CREATE TRIGGER reconciliation_evidence_immutable
    BEFORE UPDATE OR DELETE ON public.reconciliation_evidence
    FOR EACH ROW EXECUTE FUNCTION public.prevent_reconciliation_immutable_change();
CREATE TRIGGER reconciliation_gate_evaluations_immutable
    BEFORE UPDATE OR DELETE ON public.reconciliation_gate_evaluations
    FOR EACH ROW EXECUTE FUNCTION public.prevent_reconciliation_immutable_change();

-- 13. RLS, grants, and protected execution boundary -----------------------------
ALTER TABLE public.reconciliation_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_gate_evaluations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reconciliation_source_snapshots FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.reconciliation_reviews FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.reconciliation_decisions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.reconciliation_evidence FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.reconciliation_conflicts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.reconciliation_gate_evaluations FROM PUBLIC, anon, authenticated, service_role;

-- Trusted bootstrap has read-only verification access. All writes remain
-- exclusively inside the atomic service_role bootstrap function.
GRANT SELECT ON TABLE public.reconciliation_source_snapshots TO service_role;
GRANT SELECT ON TABLE public.reconciliation_reviews TO service_role;
GRANT SELECT ON TABLE public.reconciliation_decisions TO service_role;
GRANT SELECT ON TABLE public.reconciliation_evidence TO service_role;
GRANT SELECT ON TABLE public.reconciliation_conflicts TO service_role;
GRANT SELECT ON TABLE public.reconciliation_gate_evaluations TO service_role;

GRANT SELECT ON TABLE public.reconciliation_source_snapshots TO authenticated;
GRANT SELECT ON TABLE public.reconciliation_reviews TO authenticated;
GRANT SELECT ON TABLE public.reconciliation_decisions TO authenticated;
GRANT SELECT ON TABLE public.reconciliation_evidence TO authenticated;
GRANT SELECT ON TABLE public.reconciliation_conflicts TO authenticated;
GRANT SELECT ON TABLE public.reconciliation_gate_evaluations TO authenticated;
REVOKE ALL ON public.reconciliation_review_state FROM PUBLIC, anon;
GRANT SELECT ON public.reconciliation_review_state TO authenticated;

DROP POLICY IF EXISTS reconciliation_admins_read_snapshots ON public.reconciliation_source_snapshots;
DROP POLICY IF EXISTS reconciliation_admins_read_reviews ON public.reconciliation_reviews;
DROP POLICY IF EXISTS reconciliation_admins_read_decisions ON public.reconciliation_decisions;
DROP POLICY IF EXISTS reconciliation_admins_read_evidence ON public.reconciliation_evidence;
DROP POLICY IF EXISTS reconciliation_admins_read_conflicts ON public.reconciliation_conflicts;
DROP POLICY IF EXISTS reconciliation_admins_read_gate_evaluations ON public.reconciliation_gate_evaluations;

CREATE POLICY reconciliation_admins_read_snapshots
    ON public.reconciliation_source_snapshots FOR SELECT TO authenticated
    USING (
        get_auth_role() = 'ADMIN'
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'ACTIVE')
    );
CREATE POLICY reconciliation_admins_read_reviews
    ON public.reconciliation_reviews FOR SELECT TO authenticated
    USING (
        get_auth_role() = 'ADMIN'
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'ACTIVE')
    );
CREATE POLICY reconciliation_admins_read_decisions
    ON public.reconciliation_decisions FOR SELECT TO authenticated
    USING (
        get_auth_role() = 'ADMIN'
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'ACTIVE')
    );
CREATE POLICY reconciliation_admins_read_evidence
    ON public.reconciliation_evidence FOR SELECT TO authenticated
    USING (
        get_auth_role() = 'ADMIN'
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'ACTIVE')
    );
CREATE POLICY reconciliation_admins_read_conflicts
    ON public.reconciliation_conflicts FOR SELECT TO authenticated
    USING (
        get_auth_role() = 'ADMIN'
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'ACTIVE')
    );
CREATE POLICY reconciliation_admins_read_gate_evaluations
    ON public.reconciliation_gate_evaluations FOR SELECT TO authenticated
    USING (
        get_auth_role() = 'ADMIN'
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'ACTIVE')
    );

REVOKE ALL ON FUNCTION public.reconciliation_current_decisions(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_reconciliation_decision_value(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_reconciliation_conflict_scope(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_reconciliation_conflict_resolution(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconciliation_is_nonempty_json_string(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconciliation_is_json_enum(JSONB, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconciliation_is_json_string_or_null(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconciliation_is_json_string_array(JSONB) FROM PUBLIC, anon, authenticated;

-- Canonical initial reconciliation contract used by bootstrap and global gate.
CREATE OR REPLACE FUNCTION public.reconciliation_canonical_reviews()
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
    v_candidate JSONB;
    v_unmatched JSONB;
BEGIN
    v_candidate := jsonb_build_array(
        jsonb_build_object('reviewId','R01','scope','EXACT_SKU','localRef','prod-1','supabaseRef','prod-1','classification','EXACT_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R02','scope','EXACT_SKU','localRef','prod-2','supabaseRef','prod-2','classification','UNRESOLVED','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R03','scope','EXACT_SKU','localRef','prod-3','supabaseRef','prod-3','classification','EXACT_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R04','scope','EXACT_SKU','localRef','prod-4','supabaseRef','prod-4','classification','EXACT_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R05','scope','EXACT_SKU','localRef','prod-5','supabaseRef','prod-5','classification','EXACT_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R06','scope','EXACT_SKU','localRef','prod-6','supabaseRef','prod-6','classification','EXACT_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R07','scope','EXACT_SKU','localRef','prod-7','supabaseRef','prod-7','classification','EXACT_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R08','scope','EXACT_SKU','localRef','prod-9','supabaseRef','prod-8','classification','UNRESOLVED','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R09','scope','CANDIDATE_PAIR','localRef','prod-8','supabaseRef','prod-10','classification','PROBABLE_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R10','scope','CANDIDATE_PAIR','localRef','prod-12','supabaseRef','prod-14','classification','POSSIBLE_DUPLICATE','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R11','scope','CANDIDATE_PAIR','localRef','prod-13','supabaseRef','prod-12','classification','POSSIBLE_DUPLICATE','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R12','scope','CANDIDATE_PAIR','localRef','prod-16','supabaseRef','prod-17','classification','UNRESOLVED','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R13','scope','CANDIDATE_PAIR','localRef','prod-20','supabaseRef','prod-20','classification','PROBABLE_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R14','scope','CANDIDATE_PAIR','localRef','prod-21','supabaseRef','prod-22','classification','PROBABLE_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R15','scope','CANDIDATE_PAIR','localRef','prod-23','supabaseRef','prod-25','classification','PROBABLE_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R16','scope','CANDIDATE_PAIR','localRef','prod-24','supabaseRef','prod-26','classification','UNRESOLVED','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R17','scope','CANDIDATE_PAIR','localRef','prod-25','supabaseRef','prod-28','classification','PROBABLE_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R18','scope','CANDIDATE_PAIR','localRef','prod-26','supabaseRef','prod-29','classification','PROBABLE_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R19','scope','CANDIDATE_PAIR','localRef','prod-27','supabaseRef','prod-31','classification','PROBABLE_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R20','scope','CANDIDATE_PAIR','localRef','prod-29','supabaseRef','prod-32','classification','POSSIBLE_DUPLICATE','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R21','scope','CANDIDATE_PAIR','localRef','prod-30','supabaseRef','prod-35','classification','POSSIBLE_DUPLICATE','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R22','scope','CANDIDATE_PAIR','localRef','prod-31','supabaseRef','prod-37','classification','POSSIBLE_DUPLICATE','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R23','scope','CANDIDATE_PAIR','localRef','prod-32','supabaseRef','prod-36','classification','POSSIBLE_DUPLICATE','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R24','scope','CANDIDATE_PAIR','localRef','prod-33','supabaseRef','prod-39','classification','PROBABLE_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R25','scope','CANDIDATE_PAIR','localRef','prod-34','supabaseRef','prod-38','classification','PROBABLE_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R26','scope','CANDIDATE_PAIR','localRef','prod-35','supabaseRef','prod-40','classification','PROBABLE_MATCH','coverageState','PAIRED'),
        jsonb_build_object('reviewId','R27','scope','CANDIDATE_PAIR','localRef','prod-37','supabaseRef','prod-41','classification','POSSIBLE_DUPLICATE','coverageState','PAIRED')
    );
    v_unmatched := jsonb_build_array(
        jsonb_build_object('reviewId','LOCAL-ONLY-BAS-GAN65W-BLK','scope','LOCAL_ONLY','localRef','prod-10','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-APL-USBC-1M','scope','LOCAL_ONLY','localRef','prod-11','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-UGR-100W-2M','scope','LOCAL_ONLY','localRef','prod-14','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-CAS-IP16PM-MAG','scope','LOCAL_ONLY','localRef','prod-15','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-CAS-CAMON30-ARM','scope','LOCAL_ONLY','localRef','prod-17','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-CAS-INFNOT40-CLR','scope','LOCAL_ONLY','localRef','prod-18','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-SCR-IP16P-PRIV','scope','LOCAL_ONLY','localRef','prod-19','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-PB-ANK-20K-20W','scope','LOCAL_ONLY','localRef','prod-22','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-LAP-APL-96W','scope','LOCAL_ONLY','localRef','prod-28','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-ADP-SAM-USBC35','scope','LOCAL_ONLY','localRef','prod-36','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-COM-LOG-M350','scope','LOCAL_ONLY','localRef','prod-38','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-COM-LOG-K380','scope','LOCAL_ONLY','localRef','prod-39','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-COM-MAT-EXT80','scope','LOCAL_ONLY','localRef','prod-40','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-OTH-CLN-7IN1','scope','LOCAL_ONLY','localRef','prod-41','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL'),
        jsonb_build_object('reviewId','LOCAL-ONLY-OTH-ORG-MAG5','scope','LOCAL_ONLY','localRef','prod-42','supabaseRef',NULL,'classification','UNMATCHED_LOCAL','coverageState','UNMATCHED_LOCAL')
    );
    v_unmatched := v_unmatched || jsonb_build_array(
        jsonb_build_object('reviewId','SUPABASE-ONLY-ACC-DESK-STND','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-27','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-ANK-737-140W','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-24','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-APL-USBC-LTG-1M','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-11','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-BAS-100W-2M','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-13','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-CASE-IP13-HYB','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-18','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-CASE-IP14P-ARM','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-16','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-CASE-IP15PM-MAG','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-15','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-CHG-APL-67W','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-34','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-CHG-DELL-65W','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-33','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-GLS-IP14-2PK','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-21','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-GLS-IP15PM-PRV','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-19','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-LAP-COOL-RGB','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-30','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-LOG-M185-GRY','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-42','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-ORA-65W-GAN','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-9','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE'),
        jsonb_build_object('reviewId','SUPABASE-ONLY-ORA-PB-27K','scope','SUPABASE_ONLY','localRef',NULL,'supabaseRef','prod-23','classification','UNMATCHED_SUPABASE','coverageState','UNMATCHED_SUPABASE')
    );
    RETURN v_candidate || v_unmatched;
END;
$function$;
-- Atomic trusted bootstrap: validation occurs before either insert.
CREATE OR REPLACE FUNCTION public.bootstrap_reconciliation(
    p_snapshots JSONB,
    p_reviews JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_basis CONSTANT TEXT := 'M8B-42-ROW-EXPORT-2026-09-21';
    v_expected JSONB := public.reconciliation_canonical_reviews();
    v_bad_review_id TEXT;
    v_total_snapshots INTEGER;
    v_local_snapshots INTEGER;
    v_supabase_snapshots INTEGER;
    v_total_reviews INTEGER;
    v_candidate_reviews INTEGER;
    v_local_reviews INTEGER;
    v_supabase_reviews INTEGER;
    v_decisions INTEGER;
    v_evidence INTEGER;
    v_conflicts INTEGER;
    v_gates INTEGER;
BEGIN
    IF COALESCE(auth.role(), current_setting('request.jwt.claim.role', true)) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Trusted service-role bootstrap credentials are required.';
    END IF;
    IF jsonb_typeof(p_snapshots) IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_reviews) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Bootstrap snapshots and reviews must be JSON arrays.';
    END IF;
    IF jsonb_array_length(p_snapshots) <> 84 OR jsonb_array_length(p_reviews) <> 57 THEN
        RAISE EXCEPTION 'Bootstrap requires exactly 84 snapshots and 57 reviews.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_snapshots) AS s(x)
         WHERE jsonb_typeof(s.x) IS DISTINCT FROM 'object'
            OR (SELECT COUNT(*) FROM jsonb_object_keys(s.x)) <> 23
            OR NOT (s.x ?& ARRAY['snapshot_id','source_side','source_record_reference','sku','name','barcode','brand','model','variant','description','category_id','category_name','category_created_at','category_updated_at','selling_price','cost_price','reorder_level','status','source_created_at','source_updated_at','captured_at','snapshot_hash','evidence_basis_version'])
            OR s.x->>'evidence_basis_version' IS DISTINCT FROM v_basis
            OR NOT public.reconciliation_is_nonempty_json_string(s.x->'source_side')
            OR NOT public.reconciliation_is_nonempty_json_string(s.x->'source_record_reference')
            OR NOT public.reconciliation_is_nonempty_json_string(s.x->'snapshot_hash')
    ) THEN
        RAISE EXCEPTION 'Bootstrap snapshot payload is malformed.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_snapshots) AS s(x)
         WHERE jsonb_typeof(s.x->'snapshot_id') IS DISTINCT FROM 'string'
            OR NOT public.reconciliation_is_nonempty_json_string(s.x->'snapshot_id')
            OR (s.x->>'snapshot_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    ) OR (SELECT COUNT(DISTINCT s.x->>'snapshot_id') FROM jsonb_array_elements(p_snapshots) AS s(x)) <> 84 THEN
        RAISE EXCEPTION 'Bootstrap snapshot IDs are invalid or duplicated.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_snapshots) AS s(x)
         WHERE s.x->>'source_side' NOT IN ('LOCAL','SUPABASE')
    ) OR (SELECT COUNT(DISTINCT (s.x->>'source_side') || ':' || (s.x->>'source_record_reference')) FROM jsonb_array_elements(p_snapshots) AS s(x)) <> 84 THEN
        RAISE EXCEPTION 'Bootstrap snapshot source keys are invalid or duplicated.';
    END IF;
    IF (SELECT COUNT(*) FROM jsonb_array_elements(p_snapshots) s(x) WHERE s.x->>'source_side' = 'LOCAL') <> 42
       OR (SELECT COUNT(*) FROM jsonb_array_elements(p_snapshots) s(x) WHERE s.x->>'source_side' = 'SUPABASE') <> 42 THEN
        RAISE EXCEPTION 'Bootstrap requires 42 LOCAL and 42 SUPABASE snapshots.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_reviews) AS r(x)
         WHERE jsonb_typeof(r.x) IS DISTINCT FROM 'object'
            OR (SELECT COUNT(*) FROM jsonb_object_keys(r.x)) <> 9
            OR NOT (r.x ?& ARRAY['review_id','review_scope','local_source_reference','supabase_source_reference','local_snapshot_id','supabase_snapshot_id','classification','coverage_state','evidence_basis_version'])
            OR r.x->>'evidence_basis_version' IS DISTINCT FROM v_basis
    ) THEN
        RAISE EXCEPTION 'Bootstrap review payload is malformed.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_reviews) AS r(x)
         WHERE (
             r.x->>'review_scope' IN ('CANDIDATE_PAIR', 'EXACT_SKU')
             AND (
                 jsonb_typeof(r.x->'local_snapshot_id') IS DISTINCT FROM 'string'
                 OR NOT public.reconciliation_is_nonempty_json_string(r.x->'local_snapshot_id')
                 OR (r.x->>'local_snapshot_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
                 OR jsonb_typeof(r.x->'supabase_snapshot_id') IS DISTINCT FROM 'string'
                 OR NOT public.reconciliation_is_nonempty_json_string(r.x->'supabase_snapshot_id')
                 OR (r.x->>'supabase_snapshot_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
             )
         )
         OR (
             r.x->>'review_scope' = 'LOCAL_ONLY'
             AND (
                 jsonb_typeof(r.x->'local_snapshot_id') IS DISTINCT FROM 'string'
                 OR NOT public.reconciliation_is_nonempty_json_string(r.x->'local_snapshot_id')
                 OR (r.x->>'local_snapshot_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
                 OR jsonb_typeof(r.x->'supabase_snapshot_id') IS DISTINCT FROM 'null'
             )
         )
         OR (
             r.x->>'review_scope' = 'SUPABASE_ONLY'
             AND (
                 jsonb_typeof(r.x->'local_snapshot_id') IS DISTINCT FROM 'null'
                 OR jsonb_typeof(r.x->'supabase_snapshot_id') IS DISTINCT FROM 'string'
                 OR NOT public.reconciliation_is_nonempty_json_string(r.x->'supabase_snapshot_id')
                 OR (r.x->>'supabase_snapshot_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
             )
         )
    ) THEN
        RAISE EXCEPTION 'Bootstrap review snapshot references are malformed.';
    END IF;
    IF (SELECT COUNT(DISTINCT r.x->>'review_id') FROM jsonb_array_elements(p_reviews) r(x)) <> 57 THEN
        RAISE EXCEPTION 'Bootstrap review IDs are duplicated.';
    END IF;
    -- Set-based review-to-snapshot validation: every ->> operand is an explicit
    -- jsonb query alias; no procedural variable is ever an operator operand.
    SELECT r.x->>'review_id' INTO v_bad_review_id
      FROM jsonb_array_elements(p_reviews) AS r(x)
      LEFT JOIN jsonb_array_elements(v_expected) AS e(x)
        ON e.x->>'reviewId' = r.x->>'review_id'
     WHERE e.x IS NULL
        OR r.x->>'review_scope' IS DISTINCT FROM e.x->>'scope'
        OR r.x->>'local_source_reference' IS DISTINCT FROM e.x->>'localRef'
        OR r.x->>'supabase_source_reference' IS DISTINCT FROM e.x->>'supabaseRef'
        OR r.x->>'classification' IS DISTINCT FROM e.x->>'classification'
        OR r.x->>'coverage_state' IS DISTINCT FROM e.x->>'coverageState'
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Bootstrap review mapping is not canonical for %.', v_bad_review_id;
    END IF;

    SELECT r.x->>'review_id' INTO v_bad_review_id
      FROM jsonb_array_elements(p_reviews) AS r(x)
     WHERE r.x->>'local_source_reference' IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_snapshots) AS s(x)
            WHERE s.x->>'source_side' = 'LOCAL'
              AND s.x->>'source_record_reference' = r.x->>'local_source_reference'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Bootstrap local snapshot mapping is invalid for %.', v_bad_review_id;
    END IF;

    SELECT r.x->>'review_id' INTO v_bad_review_id
      FROM jsonb_array_elements(p_reviews) AS r(x)
     WHERE r.x->>'supabase_source_reference' IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_snapshots) AS s(x)
            WHERE s.x->>'source_side' = 'SUPABASE'
              AND s.x->>'source_record_reference' = r.x->>'supabase_source_reference'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Bootstrap Supabase snapshot mapping is invalid for %.', v_bad_review_id;
    END IF;

    SELECT r.x->>'review_id' INTO v_bad_review_id
      FROM jsonb_array_elements(p_reviews) AS r(x)
     WHERE r.x->>'local_source_reference' IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_snapshots) AS s(x)
            WHERE s.x->>'snapshot_id' = r.x->>'local_snapshot_id'
              AND s.x->>'source_side' = 'LOCAL'
              AND s.x->>'source_record_reference' = r.x->>'local_source_reference'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Bootstrap local snapshot ID mapping is invalid for %.', v_bad_review_id;
    END IF;

    SELECT r.x->>'review_id' INTO v_bad_review_id
      FROM jsonb_array_elements(p_reviews) AS r(x)
     WHERE r.x->>'supabase_source_reference' IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_snapshots) AS s(x)
            WHERE s.x->>'snapshot_id' = r.x->>'supabase_snapshot_id'
              AND s.x->>'source_side' = 'SUPABASE'
              AND s.x->>'source_record_reference' = r.x->>'supabase_source_reference'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Bootstrap Supabase snapshot ID mapping is invalid for %.', v_bad_review_id;
    END IF;

    SELECT COUNT(*) INTO v_total_snapshots FROM public.reconciliation_source_snapshots;
    SELECT COUNT(*) INTO v_total_reviews FROM public.reconciliation_reviews;
    SELECT COUNT(*) INTO v_decisions FROM public.reconciliation_decisions;
    SELECT COUNT(*) INTO v_evidence FROM public.reconciliation_evidence;
    SELECT COUNT(*) INTO v_conflicts FROM public.reconciliation_conflicts;
    SELECT COUNT(*) INTO v_gates FROM public.reconciliation_gate_evaluations;
    IF v_total_snapshots = 0 AND v_total_reviews = 0 AND v_decisions = 0 AND v_evidence = 0 AND v_conflicts = 0 AND v_gates = 0 THEN
        INSERT INTO public.reconciliation_source_snapshots (
            snapshot_id, source_side, source_record_reference, sku, name, barcode, brand, model, variant,
            description, category_id, category_name, category_created_at, category_updated_at,
            selling_price, cost_price, reorder_level, status, source_created_at, source_updated_at,
            captured_at, snapshot_hash, evidence_basis_version
        )
        SELECT
            (s.x->>'snapshot_id')::UUID, s.x->>'source_side', s.x->>'source_record_reference', s.x->>'sku', s.x->>'name', s.x->>'barcode',
            s.x->>'brand', s.x->>'model', s.x->>'variant', s.x->>'description', s.x->>'category_id', s.x->>'category_name',
            (s.x->>'category_created_at')::TIMESTAMPTZ, (s.x->>'category_updated_at')::TIMESTAMPTZ,
            (s.x->>'selling_price')::NUMERIC, (s.x->>'cost_price')::NUMERIC, (s.x->>'reorder_level')::INTEGER,
            s.x->>'status', (s.x->>'source_created_at')::TIMESTAMPTZ, (s.x->>'source_updated_at')::TIMESTAMPTZ,
            (s.x->>'captured_at')::TIMESTAMPTZ, s.x->>'snapshot_hash', s.x->>'evidence_basis_version'
        FROM jsonb_array_elements(p_snapshots) AS s(x);

        INSERT INTO public.reconciliation_reviews (
            review_id, review_scope, local_source_reference, supabase_source_reference,
            local_snapshot_id, supabase_snapshot_id, classification, coverage_state, evidence_basis_version
        )
        SELECT
            r.x->>'review_id', r.x->>'review_scope', r.x->>'local_source_reference', r.x->>'supabase_source_reference',
            (r.x->>'local_snapshot_id')::UUID, (r.x->>'supabase_snapshot_id')::UUID,
            r.x->>'classification', r.x->>'coverage_state', r.x->>'evidence_basis_version'
        FROM jsonb_array_elements(p_reviews) AS r(x);
    ELSIF v_total_snapshots <> 84 OR v_total_reviews <> 57 OR v_decisions <> 0 OR v_evidence <> 0 OR v_conflicts <> 0 OR v_gates <> 0 THEN
        RAISE EXCEPTION 'Bootstrap state is partial or inconsistent; no changes made.';
    ELSE
        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_snapshots) s(x)
             WHERE NOT EXISTS (
                 SELECT 1 FROM public.reconciliation_source_snapshots e
                  WHERE e.snapshot_id = (s.x->>'snapshot_id')::UUID
                    AND e.source_side = s.x->>'source_side'
                    AND e.source_record_reference = s.x->>'source_record_reference'
                    AND e.snapshot_hash = s.x->>'snapshot_hash'
           AND e.evidence_basis_version = s.x->>'evidence_basis_version'
             )
        ) OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_reviews) r(x)
             WHERE NOT EXISTS (
                 SELECT 1 FROM public.reconciliation_reviews e
                  WHERE e.review_id = r.x->>'review_id'
                    AND e.review_scope = r.x->>'review_scope'
                    AND e.local_source_reference IS NOT DISTINCT FROM r.x->>'local_source_reference'
                    AND e.supabase_source_reference IS NOT DISTINCT FROM r.x->>'supabase_source_reference'
                    AND e.classification = r.x->>'classification'
                    AND e.coverage_state = r.x->>'coverage_state'
           AND e.evidence_basis_version = r.x->>'evidence_basis_version'
                     AND e.local_snapshot_id IS NOT DISTINCT FROM (r.x->>'local_snapshot_id')::UUID
                     AND e.supabase_snapshot_id IS NOT DISTINCT FROM (r.x->>'supabase_snapshot_id')::UUID
             )
        ) THEN
            RAISE EXCEPTION 'Bootstrap existing state is not exact; no changes made.';
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_total_snapshots FROM public.reconciliation_source_snapshots;
    SELECT COUNT(*) INTO v_total_reviews FROM public.reconciliation_reviews;
    SELECT COUNT(*) INTO v_decisions FROM public.reconciliation_decisions;
    SELECT COUNT(*) INTO v_evidence FROM public.reconciliation_evidence;
    SELECT COUNT(*) INTO v_conflicts FROM public.reconciliation_conflicts;
    SELECT COUNT(*) INTO v_gates FROM public.reconciliation_gate_evaluations;
    IF v_total_snapshots <> 84 OR v_total_reviews <> 57 OR v_decisions <> 0 OR v_evidence <> 0 OR v_conflicts <> 0 OR v_gates <> 0 THEN
        RAISE EXCEPTION 'Bootstrap post-write verification failed.';
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', 'COMPLETE_AND_EXACT', 'snapshots', v_total_snapshots, 'reviews', v_total_reviews, 'decisions', v_decisions);
END;
$function$;

REVOKE ALL ON FUNCTION public.append_reconciliation_decision(TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.append_reconciliation_evidence(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.append_reconciliation_conflict(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.append_reconciliation_conflict(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_reconciliation_conflict(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evaluate_reconciliation_review_gate(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evaluate_catalog_sync_ready() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.reconciliation_current_decisions(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_reconciliation_decision(TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_reconciliation_evidence(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_reconciliation_conflict(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_reconciliation_conflict(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_reconciliation_review_gate(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_catalog_sync_ready() TO authenticated;

REVOKE ALL ON FUNCTION public.reconciliation_canonical_reviews() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_reconciliation(JSONB, JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bootstrap_reconciliation(JSONB, JSONB) TO service_role;

COMMENT ON TABLE public.reconciliation_reviews IS
    'M8F reconciliation review contexts. Product IDs are opaque source references only; identity state is derived from immutable decisions.';
COMMENT ON TABLE public.reconciliation_decisions IS
    'Append-only decision chains per review_id + decision_type. Current decision is the leaf; no mutable current flag exists.';
COMMENT ON FUNCTION public.evaluate_catalog_sync_ready() IS
    'Technical reconciliation-readiness gate only. It is not synchronization approval and creates no product preview or product mutation.';
