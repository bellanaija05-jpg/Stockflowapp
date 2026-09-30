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
