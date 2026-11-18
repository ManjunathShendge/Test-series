-- Schema v1.1 sections 8 (commerce, payouts), 9 (CMS banners), 10 (functions), 11 (purchase
-- and payout policies) and 12 (storage buckets). Deviations are listed in docs/DATA_MODEL.md.

-- 8. Commerce, Pass plans, coupons, invoices and payouts ----------------------------
CREATE TABLE public.pass_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    duration_days INT NOT NULL,
    price_paise INT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    examiner_id UUID REFERENCES public.examiner_profiles(user_id) ON DELETE CASCADE,
    discount_percent NUMERIC(5,2) CHECK (discount_percent BETWEEN 0 AND 100),
    max_discount_paise INT,
    flat_discount_paise INT,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    max_uses INT,
    current_uses INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT UNIQUE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    item_type item_purchase_type NOT NULL,
    test_id UUID REFERENCES public.tests(id) ON DELETE RESTRICT,
    series_id UUID REFERENCES public.test_series(id) ON DELETE RESTRICT,
    pass_plan_id UUID REFERENCES public.pass_plans(id) ON DELETE RESTRICT,
    examiner_id UUID REFERENCES public.examiner_profiles(user_id) ON DELETE RESTRICT,
    coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
    is_examiner_coupon BOOLEAN NOT NULL DEFAULT FALSE,
    gross_amount_paise INT NOT NULL,
    discount_paise INT NOT NULL DEFAULT 0,
    taxable_amount_paise INT NOT NULL,
    gst_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 18.00,
    gst_amount_paise INT NOT NULL,
    total_paid_paise INT NOT NULL,
    gateway_fee_paise INT NOT NULL DEFAULT 0,
    net_revenue_paise INT NOT NULL,
    payment_channel TEXT NOT NULL DEFAULT 'razorpay' CHECK (payment_channel IN ('razorpay', 'google_play', 'apple_iap', 'admin_grant')),
    razorpay_order_id TEXT UNIQUE,
    razorpay_payment_id TEXT,
    -- Deviation (D02/C2: Apple IAP on iOS, Play Billing on Android; invariant 7 idempotency).
    store_product_id TEXT,
    store_transaction_id TEXT,
    store_original_transaction_id TEXT,
    play_purchase_token TEXT UNIQUE,
    store_environment TEXT CHECK (store_environment IN ('sandbox', 'production')),
    status payment_status_type NOT NULL DEFAULT 'created',
    invoice_pdf_path TEXT,
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT,
    refund_processed_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (payment_channel, store_transaction_id)
);
CREATE TRIGGER set_purchases_updated_at BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE public.student_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    item_type item_purchase_type NOT NULL,
    test_id UUID REFERENCES public.tests(id) ON DELETE CASCADE,
    series_id UUID REFERENCES public.test_series(id) ON DELETE CASCADE,
    pass_plan_id UUID REFERENCES public.pass_plans(id) ON DELETE CASCADE,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    expiry_reminder_3d_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_entitlements_active ON public.student_entitlements (student_id, item_type, is_revoked, valid_until);

CREATE TABLE public.monthly_pass_pools (
    payout_month DATE PRIMARY KEY,
    total_net_pass_revenue_paise BIGINT NOT NULL DEFAULT 0,
    examiner_pool_50_pct_paise BIGINT NOT NULL DEFAULT 0,
    total_qualified_attempts INT NOT NULL DEFAULT 0,
    per_attempt_rate_paise NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
    is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.examiner_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    examiner_id UUID NOT NULL REFERENCES public.examiner_profiles(user_id) ON DELETE RESTRICT,
    payout_month DATE NOT NULL,
    direct_sales_65_paise BIGINT NOT NULL DEFAULT 0,
    coupon_sales_75_paise BIGINT NOT NULL DEFAULT 0,
    qualified_pass_attempts_count INT NOT NULL DEFAULT 0,
    pass_pool_share_paise BIGINT NOT NULL DEFAULT 0,
    quality_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    refund_deductions_paise BIGINT NOT NULL DEFAULT 0,
    gross_earnings_paise BIGINT NOT NULL,
    tds_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    tds_deducted_paise BIGINT NOT NULL DEFAULT 0,
    net_payable_paise BIGINT NOT NULL,
    status payout_status_type NOT NULL DEFAULT 'calculated',
    hold_reason TEXT,
    bank_transfer_ref TEXT,
    paid_at TIMESTAMPTZ,
    statement_pdf_path TEXT,
    tds_certificate_pdf_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (examiner_id, payout_month)
);
CREATE TRIGGER set_examiner_payouts_updated_at BEFORE UPDATE ON public.examiner_payouts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Deviation (invariants 5 and 7): verified provider events are recorded once, and every
-- economic effect is an append-only ledger entry keyed by its source event.
CREATE TABLE public.billing_events (
    provider TEXT NOT NULL CHECK (provider IN ('razorpay', 'google_play', 'apple_iap')),
    provider_event_id TEXT NOT NULL,
    purchase_id UUID REFERENCES public.purchases(id) ON DELETE RESTRICT,
    payload JSONB NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, provider_event_id)
);
CREATE TABLE public.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID REFERENCES public.purchases(id) ON DELETE RESTRICT,
    payout_id UUID REFERENCES public.examiner_payouts(id) ON DELETE RESTRICT,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('capture', 'refund', 'gateway_fee', 'payout', 'adjustment')),
    source_event TEXT NOT NULL UNIQUE,
    amount_paise BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (purchase_id IS NOT NULL OR payout_id IS NOT NULL)
);
CREATE TRIGGER ledger_append_only BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION reject_history_change();
CREATE TRIGGER ledger_no_truncate BEFORE TRUNCATE ON public.ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_change();

-- 9. CMS banners -------------------------------------------------------------------
CREATE TABLE public.cms_banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    image_url TEXT NOT NULL,
    target_link TEXT NOT NULL,
    exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Purchase and payout policies ---------------------------------------------------
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examiner_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students view own purchases" ON public.purchases
    FOR SELECT USING (student_id = public.current_user_id() OR public.has_role('admin'));
-- Deviation: the API creates the student's own pending order (price computed by the server);
-- capture, refunds and grants are verified server/admin work.
CREATE POLICY "Students create own pending orders" ON public.purchases
    FOR INSERT WITH CHECK (student_id = public.current_user_id() AND status = 'created');
CREATE POLICY "Admins manage purchases" ON public.purchases
    FOR UPDATE USING (public.has_role('admin'));
CREATE POLICY "Examiners view own payouts" ON public.examiner_payouts
    FOR SELECT USING (examiner_id = public.current_user_id() OR public.has_role('admin'));
CREATE POLICY "Admins manage payouts" ON public.examiner_payouts
    FOR UPDATE USING (public.has_role('admin'));

-- Deviation (invariant 4: the server decides entitlement, price and payment status): under a
-- user context only admins may write these system-managed tables; verified fulfilment,
-- payouts and pool calculation run as system jobs (no user context).
CREATE FUNCTION require_admin_or_system() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF public.current_user_id() IS NOT NULL AND NOT public.has_role('admin') THEN
    RAISE EXCEPTION '% is managed by the server', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER entitlements_server_managed BEFORE INSERT OR UPDATE OR DELETE ON public.student_entitlements
  FOR EACH ROW EXECUTE FUNCTION require_admin_or_system();
CREATE TRIGGER purchases_server_managed BEFORE UPDATE OR DELETE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION require_admin_or_system();
CREATE TRIGGER pass_pools_server_managed BEFORE INSERT OR UPDATE OR DELETE ON public.monthly_pass_pools
  FOR EACH ROW EXECUTE FUNCTION require_admin_or_system();
CREATE TRIGGER payouts_server_managed BEFORE INSERT OR UPDATE OR DELETE ON public.examiner_payouts
  FOR EACH ROW EXECUTE FUNCTION require_admin_or_system();
CREATE TRIGGER billing_events_server_managed BEFORE INSERT OR UPDATE OR DELETE ON public.billing_events
  FOR EACH ROW EXECUTE FUNCTION require_admin_or_system();
CREATE TRIGGER ledger_server_managed BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION require_admin_or_system();
CREATE TRIGGER coupons_server_managed BEFORE INSERT OR UPDATE OR DELETE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION require_admin_or_system();
CREATE TRIGGER pass_plans_server_managed BEFORE INSERT OR UPDATE OR DELETE ON public.pass_plans
  FOR EACH ROW EXECUTE FUNCTION require_admin_or_system();

-- Deviation (PRD p.9 "audit log on every admin action"; invariant 6 admin/reviewer actions
-- commit with audit records): any change made under an admin or QC reviewer context writes
-- an audit row in the same transaction. The API may name the action via app.audit_action.
CREATE FUNCTION audit_privileged_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_actor UUID := public.current_user_id();
  v_row JSONB := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  v_target UUID;
BEGIN
  IF v_actor IS NULL OR NOT (public.has_role('admin') OR public.has_role('qc_reviewer')) THEN
    RETURN NULL;
  END IF;
  v_target := COALESCE(v_row->>'id', v_row->>'user_id', md5(v_row::text))::uuid;
  INSERT INTO public.admin_audit_logs (admin_id, action_name, target_table, target_record_id, before_state, after_state)
  VALUES (v_actor,
          COALESCE(NULLIF(current_setting('app.audit_action', true), ''), TG_OP || ' ' || TG_TABLE_NAME),
          TG_TABLE_NAME, v_target,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN NULL;
END $$;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'user_devices', 'examiner_profiles', 'exam_categories', 'exams', 'exam_stages',
    'subjects', 'topics', 'exam_templates', 'exam_template_sections', 'questions', 'test_series', 'tests', 'test_sections',
    'test_questions', 'qc_reviewer_mappings', 'qc_reviews', 'qc_question_reviews', 'question_reports',
    'question_key_corrections', 'pass_plans', 'coupons', 'purchases', 'student_entitlements', 'monthly_pass_pools',
    'examiner_payouts', 'cms_banners', 'ledger_entries', 'billing_events']
  LOOP
    EXECUTE format('CREATE TRIGGER audit_privileged_change AFTER INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION audit_privileged_change()', t);
  END LOOP;
END $$;

-- 10. Core database functions -------------------------------------------------------
-- Deviation (all): SET search_path; explicit caller authorisation because SECURITY DEFINER
-- functions bypass row-level security.

-- Runs privileged recalculation as a system job inside the caller's transaction: the
-- integrity triggers treat a missing user context as the server. Callers restore it.
CREATE FUNCTION suspend_user_context() RETURNS TEXT
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_previous TEXT := current_setting('app.user_id', true);
BEGIN
  PERFORM set_config('app.user_id', '', true);
  RETURN v_previous;
END $$;

-- 10.1 Stage 1 duplicate check ------------------------------------------------------
CREATE FUNCTION public.run_question_duplicate_check(
    p_exam_id UUID,
    p_examiner_id UUID,
    p_text_hash TEXT,
    p_masked_hash TEXT,
    p_norm_stem_en TEXT,
    p_exclude_question_id UUID DEFAULT NULL
)
RETURNS TABLE (
    matched_question_id UUID,
    match_kind duplicate_match_type,
    similarity_score NUMERIC(4,3),
    is_same_examiner BOOLEAN,
    is_pyq BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
#variable_conflict use_column
DECLARE
    v_high_thresh NUMERIC(4,3);
    v_mid_thresh NUMERIC(4,3);
BEGIN
    IF public.current_user_id() IS NOT NULL AND public.current_user_id() IS DISTINCT FROM p_examiner_id
       AND NOT (public.has_role('qc_reviewer') OR public.has_role('admin')) THEN
        RAISE EXCEPTION 'Not authorised to run this check' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT trigram_high_threshold, trigram_mid_threshold
    INTO v_high_thresh, v_mid_thresh
    FROM public.exams WHERE id = p_exam_id;

    RETURN QUERY
    SELECT
        q.id AS matched_question_id,
        CASE
            WHEN q.text_hash = p_text_hash AND q.is_pyq = TRUE THEN 'pyq_match'::duplicate_match_type
            WHEN q.text_hash = p_text_hash THEN 'exact_hash'::duplicate_match_type
            WHEN q.masked_hash = p_masked_hash THEN 'masked_hash'::duplicate_match_type
            WHEN similarity(q.norm_stem_en, p_norm_stem_en) >= v_high_thresh THEN 'trigram_high'::duplicate_match_type
            ELSE 'trigram_mid'::duplicate_match_type
        END AS match_kind,
        ROUND(similarity(q.norm_stem_en, p_norm_stem_en)::NUMERIC, 3) AS similarity_score,
        (q.examiner_id = p_examiner_id) AS is_same_examiner,
        q.is_pyq
    FROM public.questions q
    WHERE q.exam_id = p_exam_id
      AND q.is_approved_in_corpus = TRUE
      AND (p_exclude_question_id IS NULL OR q.id <> p_exclude_question_id)
      AND (
          q.text_hash = p_text_hash
          OR q.masked_hash = p_masked_hash
          OR similarity(q.norm_stem_en, p_norm_stem_en) >= v_mid_thresh
      )
    ORDER BY 3 DESC
    LIMIT 5;
END $$;

-- 10.2 Pre-submit completeness and blueprint-fit check -------------------------------
CREATE FUNCTION public.run_test_presubmit_check(p_test_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    v_test RECORD;
    v_exam RECORD;
    v_actual_q_count INT;
    v_missing_bilingual_count INT;
    v_internal_dup_count INT;
    v_pyq_count INT;
    v_pyq_pct NUMERIC(5,2);
    v_section_mismatches JSONB;
    v_blueprint_comparison JSONB;
    v_can_submit BOOLEAN := TRUE;
    v_blocking_errors TEXT[] := '{}';
BEGIN
    SELECT * INTO v_test FROM public.tests WHERE id = p_test_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Test not found';
    END IF;
    IF public.current_user_id() IS NOT NULL AND public.current_user_id() IS DISTINCT FROM v_test.examiner_id
       AND NOT (public.has_role('qc_reviewer') OR public.has_role('admin')) THEN
        RAISE EXCEPTION 'Not authorised to check this test' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_exam FROM public.exams WHERE id = v_test.exam_id;

    SELECT COUNT(*) INTO v_actual_q_count FROM public.test_questions WHERE test_id = p_test_id;
    IF v_actual_q_count <> v_test.total_questions THEN
        v_can_submit := FALSE;
        v_blocking_errors := array_append(v_blocking_errors,
            format('Expected %s total questions, found %s', v_test.total_questions, v_actual_q_count));
    END IF;

    IF v_test.has_hindi THEN
        SELECT COUNT(*) INTO v_missing_bilingual_count
        FROM public.test_questions tq
        JOIN public.questions q ON q.id = tq.question_id
        WHERE tq.test_id = p_test_id
          AND (q.stem_hi IS NULL OR trim(q.stem_hi) = '' OR q.solution_hi IS NULL OR trim(q.solution_hi) = '');
        IF v_missing_bilingual_count > 0 THEN
            v_can_submit := FALSE;
            v_blocking_errors := array_append(v_blocking_errors,
                format('%s questions are missing Hindi stem or solution', v_missing_bilingual_count));
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_internal_dup_count
    FROM (
        SELECT q.text_hash
        FROM public.test_questions tq
        JOIN public.questions q ON q.id = tq.question_id
        WHERE tq.test_id = p_test_id
        GROUP BY q.text_hash
        HAVING COUNT(*) > 1
    ) dups;
    IF v_internal_dup_count > 0 THEN
        v_can_submit := FALSE;
        v_blocking_errors := array_append(v_blocking_errors,
            format('%s duplicate question hashes found inside this test', v_internal_dup_count));
    END IF;

    SELECT COUNT(*) INTO v_pyq_count
    FROM public.test_questions tq
    JOIN public.questions q ON q.id = tq.question_id
    WHERE tq.test_id = p_test_id AND q.is_pyq = TRUE;
    v_pyq_pct := CASE WHEN v_actual_q_count > 0 THEN ROUND((v_pyq_count::NUMERIC / v_actual_q_count) * 100, 2) ELSE 0 END;
    IF v_test.test_type = 'mock' AND v_pyq_pct > v_exam.pyq_max_percentage THEN
        v_can_submit := FALSE;
        v_blocking_errors := array_append(v_blocking_errors,
            format('PYQ percentage (%s%%) exceeds allowed cap of %s%% for mock tests', v_pyq_pct, v_exam.pyq_max_percentage));
    END IF;

    SELECT COALESCE(jsonb_agg(mismatch), '[]'::jsonb) INTO v_section_mismatches
    FROM (
        SELECT
            ts.id AS section_id,
            ts.name AS section_name,
            ts.question_count AS expected_count,
            COUNT(tq.id) AS actual_count
        FROM public.test_sections ts
        LEFT JOIN public.test_questions tq ON tq.section_id = ts.id
        WHERE ts.test_id = p_test_id
        GROUP BY ts.id, ts.name, ts.question_count
        HAVING COUNT(tq.id) <> ts.question_count
    ) mismatch;
    IF jsonb_array_length(v_section_mismatches) > 0 THEN
        v_can_submit := FALSE;
        v_blocking_errors := array_append(v_blocking_errors, 'One or more sections have mismatched question counts');
    END IF;

    WITH actual_topics AS (
        SELECT tq.section_id, q.topic_id::TEXT AS topic_id_str, COUNT(*) AS actual_count
        FROM public.test_questions tq
        JOIN public.questions q ON q.id = tq.question_id
        WHERE tq.test_id = p_test_id
        GROUP BY tq.section_id, q.topic_id
    )
    SELECT COALESCE(jsonb_object_agg(ts.name, jsonb_build_object(
        'target_topic_counts', COALESCE(ets.target_topic_counts, '{}'::jsonb),
        'actual_topic_counts', COALESCE((
            SELECT jsonb_object_agg(at.topic_id_str, at.actual_count)
            FROM actual_topics at WHERE at.section_id = ts.id
        ), '{}'::jsonb)
    )), '{}'::jsonb) INTO v_blueprint_comparison
    FROM public.test_sections ts
    LEFT JOIN public.exam_template_sections ets ON ets.id = ts.template_section_id
    WHERE ts.test_id = p_test_id;

    UPDATE public.tests SET pyq_percentage = v_pyq_pct, updated_at = NOW() WHERE id = p_test_id;

    RETURN jsonb_build_object(
        'can_submit', v_can_submit,
        'blocking_errors', v_blocking_errors,
        'pyq_percentage', v_pyq_pct,
        'section_mismatches', v_section_mismatches,
        'pattern_fit_warning_report', v_blueprint_comparison
    );
END $$;

-- 10.3 Answer-key correction re-scoring ---------------------------------------------
-- Deviation (PRD p.4 versioning): takes a recorded correction instead of overwriting the
-- approved question's key; ranks tie-break on submission time (updated_at changes on every
-- rescore); enqueues the PRD's "notify affected students" job. Idempotent.
CREATE FUNCTION public.rescore_test_attempts_on_key_change(p_correction_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    v_c RECORD;
    v_previous_user TEXT;
BEGIN
    IF public.current_user_id() IS NOT NULL AND NOT (public.has_role('qc_reviewer') OR public.has_role('admin')) THEN
        RAISE EXCEPTION 'Only QC reviewers and admins can re-score' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO v_c FROM public.question_key_corrections WHERE id = p_correction_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Correction not found';
    END IF;
    IF public.current_user_id() IS NOT NULL THEN
        INSERT INTO public.admin_audit_logs (admin_id, action_name, target_table, target_record_id, after_state)
        VALUES (public.current_user_id(), 'RESCORE_ATTEMPTS', 'question_key_corrections', p_correction_id,
                jsonb_build_object('test_id', v_c.test_id, 'new_correct_option', v_c.new_correct_option));
    END IF;
    v_previous_user := public.suspend_user_context();

    UPDATE public.student_attempt_answers saa
    SET is_correct = CASE
            WHEN saa.selected_option IS NULL THEN NULL
            WHEN saa.selected_option = v_c.new_correct_option THEN TRUE
            ELSE FALSE
        END,
        marks_awarded = CASE
            WHEN saa.selected_option IS NULL THEN 0.00
            WHEN saa.selected_option = v_c.new_correct_option THEN tq.positive_marks
            ELSE -tq.negative_marks
        END,
        updated_at = NOW()
    FROM public.test_questions tq, public.student_attempts sa
    WHERE saa.test_question_id = tq.id
      AND saa.attempt_id = sa.id
      AND sa.test_id = v_c.test_id
      AND saa.question_id = v_c.old_question_id
      AND sa.status IN ('submitted', 'timed_out');

    WITH aggregated AS (
        SELECT
            saa.attempt_id,
            COUNT(*) FILTER (WHERE saa.selected_option IS NOT NULL) AS attempted,
            COUNT(*) FILTER (WHERE saa.is_correct = TRUE) AS correct,
            COUNT(*) FILTER (WHERE saa.is_correct = FALSE) AS incorrect,
            COALESCE(SUM(saa.marks_awarded), 0.00) AS new_score
        FROM public.student_attempt_answers saa
        JOIN public.student_attempts sa ON sa.id = saa.attempt_id
        WHERE sa.test_id = v_c.test_id AND sa.status IN ('submitted', 'timed_out')
        GROUP BY saa.attempt_id
    )
    UPDATE public.student_attempts sa
    SET attempted_count = agg.attempted,
        correct_count = agg.correct,
        incorrect_count = agg.incorrect,
        skipped_count = sa.total_questions - agg.attempted,
        total_score = agg.new_score,
        updated_at = NOW()
    FROM aggregated agg
    WHERE sa.id = agg.attempt_id;

    WITH ranked AS (
        SELECT
            id,
            RANK() OVER (ORDER BY total_score DESC, submitted_at ASC, id) AS new_rank,
            ROUND((PERCENT_RANK() OVER (ORDER BY total_score ASC) * 100)::NUMERIC, 2) AS new_percentile
        FROM public.student_attempts
        WHERE test_id = v_c.test_id
          AND attempt_number = 1
          AND status IN ('submitted', 'timed_out')
    )
    UPDATE public.student_attempts sa
    SET rank = r.new_rank,
        percentile = r.new_percentile
    FROM ranked r
    WHERE sa.id = r.id;

    INSERT INTO public.jobs (id, deduplication_key, kind, payload, available_at)
    VALUES (gen_random_uuid(), 'rescore-notify:' || p_correction_id, 'notify_rescored_students',
            jsonb_build_object('correction_id', p_correction_id, 'test_id', v_c.test_id), NOW())
    ON CONFLICT (deduplication_key) DO NOTHING;

    PERFORM set_config('app.user_id', COALESCE(v_previous_user, ''), true);
END $$;

-- 10.4 Safe test delivery -----------------------------------------------------------
-- Deviation: current_user_id() instead of auth.uid(); delivers the latest corrected version
-- of a question; keys and solutions only after the attempt is finished (invariant 3).
CREATE FUNCTION public.get_test_questions_for_attempt(p_attempt_id UUID)
RETURNS TABLE (
    test_question_id UUID,
    question_id UUID,
    section_id UUID,
    display_order INT,
    question_type question_type,
    passage_en TEXT,
    passage_hi TEXT,
    stem_en TEXT,
    stem_hi TEXT,
    options JSONB,
    positive_marks NUMERIC(5,2),
    negative_marks NUMERIC(5,2),
    correct_option TEXT,
    solution_en TEXT,
    solution_hi TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
DECLARE
    v_test_id UUID;
    v_status attempt_status_type;
BEGIN
    SELECT sa.test_id, sa.status INTO v_test_id, v_status
    FROM public.student_attempts sa
    WHERE sa.id = p_attempt_id AND sa.student_id = public.current_user_id();

    IF v_test_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized or invalid attempt ID';
    END IF;

    RETURN QUERY
    SELECT
        tq.id,
        tq.question_id,
        tq.section_id,
        tq.display_order,
        q.question_type,
        qp.content_en,
        qp.content_hi,
        q.stem_en,
        q.stem_hi,
        q.options,
        tq.positive_marks,
        tq.negative_marks,
        CASE WHEN v_status IN ('submitted', 'timed_out') THEN q.correct_option ELSE NULL END,
        CASE WHEN v_status IN ('submitted', 'timed_out') THEN q.solution_en ELSE NULL END,
        CASE WHEN v_status IN ('submitted', 'timed_out') THEN q.solution_hi ELSE NULL END
    FROM public.test_questions tq
    JOIN public.questions original ON original.id = tq.question_id
    LEFT JOIN LATERAL (
        SELECT c.new_question_id FROM public.question_key_corrections c
        WHERE c.test_id = v_test_id AND c.old_question_id = tq.question_id
        ORDER BY c.created_at DESC LIMIT 1
    ) latest ON TRUE
    JOIN public.questions q ON q.id = COALESCE(latest.new_question_id, tq.question_id)
    LEFT JOIN public.question_passages qp ON qp.id = q.passage_id
    WHERE tq.test_id = v_test_id
      AND original.is_auto_hidden = FALSE
    ORDER BY tq.display_order ASC;
END $$;

-- 10.5 Monthly Pass pool and examiner payouts ---------------------------------------
-- Deviation: finance/super admins or system jobs only; a finalised month cannot be
-- recalculated; approved or paid payout rows are never overwritten.
CREATE FUNCTION public.calculate_monthly_examiner_payouts(
    p_payout_month DATE,
    p_default_tds_rate NUMERIC(5,2) DEFAULT 10.00
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    v_month_start TIMESTAMPTZ := p_payout_month::TIMESTAMPTZ;
    v_month_end TIMESTAMPTZ := (p_payout_month + INTERVAL '1 month')::TIMESTAMPTZ;
    v_total_pass_net_paise BIGINT := 0;
    v_pool_50_pct_paise BIGINT := 0;
    v_total_qual_attempts INT := 0;
    v_rate_per_attempt NUMERIC(12,4) := 0;
    v_previous_user TEXT;
BEGIN
    IF public.current_user_id() IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = public.current_user_id() AND 'admin' = ANY(roles)
          AND NOT is_blocked AND (is_finance_admin OR is_super_admin)) THEN
        RAISE EXCEPTION 'Only finance admins can calculate payouts' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_payout_month <> date_trunc('month', p_payout_month)::DATE THEN
        RAISE EXCEPTION 'Payout month must be the first day of a month';
    END IF;
    IF EXISTS (SELECT 1 FROM public.monthly_pass_pools WHERE payout_month = p_payout_month AND is_finalized) THEN
        RAISE EXCEPTION 'Payout month % is finalised', p_payout_month USING ERRCODE = 'restrict_violation';
    END IF;
    IF public.current_user_id() IS NOT NULL THEN
        INSERT INTO public.admin_audit_logs (admin_id, action_name, target_table, target_record_id, after_state)
        VALUES (public.current_user_id(), 'CALCULATE_MONTHLY_PAYOUTS', 'monthly_pass_pools', md5(p_payout_month::text)::uuid,
                jsonb_build_object('payout_month', p_payout_month, 'tds_rate_percent', p_default_tds_rate));
    END IF;
    v_previous_user := public.suspend_user_context();

    SELECT COALESCE(SUM(
        ROUND((p.net_revenue_paise::NUMERIC * LEAST(30, pp.duration_days)) / pp.duration_days)
    ), 0)::BIGINT
    INTO v_total_pass_net_paise
    FROM public.student_entitlements se
    JOIN public.purchases p ON p.id = se.purchase_id
    JOIN public.pass_plans pp ON pp.id = se.pass_plan_id
    WHERE se.item_type = 'pass'
      AND se.is_revoked = FALSE
      AND p.status = 'captured'
      AND se.valid_from < v_month_end
      AND se.valid_until >= v_month_start;

    v_pool_50_pct_paise := ROUND(v_total_pass_net_paise * 0.50);

    SELECT COUNT(*) INTO v_total_qual_attempts
    FROM public.student_attempts sa
    WHERE sa.submitted_at >= v_month_start
      AND sa.submitted_at < v_month_end
      AND sa.status IN ('submitted', 'timed_out')
      AND sa.used_pass_access = TRUE
      AND sa.attempt_number = 1
      AND sa.attempted_count >= CEIL(sa.total_questions * 0.50);

    IF v_total_qual_attempts > 0 THEN
        v_rate_per_attempt := ROUND((v_pool_50_pct_paise::NUMERIC / v_total_qual_attempts), 4);
    END IF;

    INSERT INTO public.monthly_pass_pools (
        payout_month, total_net_pass_revenue_paise, examiner_pool_50_pct_paise,
        total_qualified_attempts, per_attempt_rate_paise, calculated_at
    ) VALUES (
        p_payout_month, v_total_pass_net_paise, v_pool_50_pct_paise,
        v_total_qual_attempts, v_rate_per_attempt, NOW()
    )
    ON CONFLICT (payout_month) DO UPDATE SET
        total_net_pass_revenue_paise = EXCLUDED.total_net_pass_revenue_paise,
        examiner_pool_50_pct_paise = EXCLUDED.examiner_pool_50_pct_paise,
        total_qualified_attempts = EXCLUDED.total_qualified_attempts,
        per_attempt_rate_paise = EXCLUDED.per_attempt_rate_paise,
        calculated_at = NOW();

    WITH direct_rev AS (
        SELECT
            p.examiner_id,
            COALESCE(SUM(ROUND(p.net_revenue_paise * 0.65)) FILTER (WHERE p.is_examiner_coupon = FALSE AND p.status = 'captured'), 0)::BIGINT AS rev_65_paise,
            COALESCE(SUM(ROUND(p.net_revenue_paise * 0.75)) FILTER (WHERE p.is_examiner_coupon = TRUE AND p.status = 'captured'), 0)::BIGINT AS rev_75_paise
        FROM public.purchases p
        WHERE p.examiner_id IS NOT NULL
          AND p.created_at >= v_month_start
          AND p.created_at < v_month_end
        GROUP BY p.examiner_id
    ),
    refund_rev AS (
        SELECT
            p.examiner_id,
            COALESCE(SUM(
                CASE WHEN p.is_examiner_coupon THEN ROUND(p.net_revenue_paise * 0.75)
                     ELSE ROUND(p.net_revenue_paise * 0.65)
                END
            ), 0)::BIGINT AS refund_deduction_paise
        FROM public.purchases p
        WHERE p.examiner_id IS NOT NULL
          AND p.status = 'refunded'
          AND p.refunded_at >= v_month_start
          AND p.refunded_at < v_month_end
        GROUP BY p.examiner_id
    ),
    pass_attempts AS (
        SELECT t.examiner_id, COUNT(sa.id) AS qual_attempts
        FROM public.student_attempts sa
        JOIN public.tests t ON t.id = sa.test_id
        WHERE sa.submitted_at >= v_month_start
          AND sa.submitted_at < v_month_end
          AND sa.status IN ('submitted', 'timed_out')
          AND sa.used_pass_access = TRUE
          AND sa.attempt_number = 1
          AND sa.attempted_count >= CEIL(sa.total_questions * 0.50)
        GROUP BY t.examiner_id
    ),
    combined AS (
        SELECT
            ep.user_id AS examiner_id,
            ep.first_payout_completed,
            COALESCE(dr.rev_65_paise, 0) AS direct_65,
            COALESCE(dr.rev_75_paise, 0) AS coupon_75,
            COALESCE(pa.qual_attempts, 0) AS q_attempts,
            ROUND(COALESCE(pa.qual_attempts, 0) * v_rate_per_attempt)::BIGINT AS pool_share,
            COALESCE(rr.refund_deduction_paise, 0) AS refunds
        FROM public.examiner_profiles ep
        LEFT JOIN direct_rev dr ON dr.examiner_id = ep.user_id
        LEFT JOIN pass_attempts pa ON pa.examiner_id = ep.user_id
        LEFT JOIN refund_rev rr ON rr.examiner_id = ep.user_id
        WHERE COALESCE(dr.rev_65_paise, 0) > 0
           OR COALESCE(dr.rev_75_paise, 0) > 0
           OR COALESCE(pa.qual_attempts, 0) > 0
           OR COALESCE(rr.refund_deduction_paise, 0) > 0
    )
    INSERT INTO public.examiner_payouts (
        examiner_id, payout_month, direct_sales_65_paise, coupon_sales_75_paise,
        qualified_pass_attempts_count, pass_pool_share_paise, quality_multiplier,
        refund_deductions_paise, gross_earnings_paise, tds_rate_percent,
        tds_deducted_paise, net_payable_paise, status, hold_reason
    )
    SELECT
        c.examiner_id,
        p_payout_month,
        c.direct_65,
        c.coupon_75,
        c.q_attempts,
        c.pool_share,
        1.00,
        c.refunds,
        GREATEST(0, (c.direct_65 + c.coupon_75 + c.pool_share - c.refunds)),
        p_default_tds_rate,
        ROUND(GREATEST(0, (c.direct_65 + c.coupon_75 + c.pool_share - c.refunds)) * (p_default_tds_rate / 100.0))::BIGINT,
        GREATEST(0, (c.direct_65 + c.coupon_75 + c.pool_share - c.refunds))
            - ROUND(GREATEST(0, (c.direct_65 + c.coupon_75 + c.pool_share - c.refunds)) * (p_default_tds_rate / 100.0))::BIGINT,
        CASE
            WHEN c.first_payout_completed = FALSE THEN 'on_hold'::payout_status_type
            WHEN GREATEST(0, (c.direct_65 + c.coupon_75 + c.pool_share - c.refunds)) < 50000 THEN 'on_hold'::payout_status_type
            ELSE 'calculated'::payout_status_type
        END,
        CASE
            WHEN c.first_payout_completed = FALSE THEN 'New examiner first-payout 1-cycle hold'
            WHEN GREATEST(0, (c.direct_65 + c.coupon_75 + c.pool_share - c.refunds)) < 50000 THEN 'Below minimum payout threshold of INR 500'
            ELSE NULL
        END
    FROM combined c
    ON CONFLICT (examiner_id, payout_month) DO UPDATE SET
        direct_sales_65_paise = EXCLUDED.direct_sales_65_paise,
        coupon_sales_75_paise = EXCLUDED.coupon_sales_75_paise,
        qualified_pass_attempts_count = EXCLUDED.qualified_pass_attempts_count,
        pass_pool_share_paise = EXCLUDED.pass_pool_share_paise,
        refund_deductions_paise = EXCLUDED.refund_deductions_paise,
        gross_earnings_paise = EXCLUDED.gross_earnings_paise,
        tds_deducted_paise = EXCLUDED.tds_deducted_paise,
        net_payable_paise = EXCLUDED.net_payable_paise,
        status = EXCLUDED.status,
        hold_reason = EXCLUDED.hold_reason,
        updated_at = NOW()
    WHERE public.examiner_payouts.status IN ('calculated', 'on_hold');

    PERFORM set_config('app.user_id', COALESCE(v_previous_user, ''), true);
END $$;

-- Functions are executable by the API and worker only, never by PUBLIC (including
-- Supabase's anon/authenticated roles if the Data API were re-enabled).
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.run_question_duplicate_check(uuid, uuid, text, text, text, uuid)',
    'public.run_test_presubmit_check(uuid)',
    'public.rescore_test_attempts_on_key_change(uuid)',
    'public.get_test_questions_for_attempt(uuid)',
    'public.calculate_monthly_examiner_payouts(date, numeric)',
    'public.suspend_user_context()']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'exam_app') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO exam_app, exam_worker', f);
    END IF;
  END LOOP;
END $$;

-- 12. Storage buckets (Supabase only) -----------------------------------------------
-- Deviation (Firebase sign-in): storage.objects policies keyed on Supabase sessions are not
-- created. The API authorises every file and issues short-lived signed URLs.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES
        ('public-media', 'public-media', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
        ('question-assets', 'question-assets', FALSE, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/zip']),
        ('examiner-kyc', 'examiner-kyc', FALSE, 10485760, ARRAY['image/jpeg', 'image/png', 'application/pdf']),
        ('gst-invoices', 'gst-invoices', FALSE, 5242880, ARRAY['application/pdf']),
        ('payout-documents', 'payout-documents', FALSE, 10485760, ARRAY['application/pdf', 'text/csv'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

UPDATE bootstrap_state SET version = 5 WHERE id = 'schema';
