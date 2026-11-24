-- M9a web commerce (Razorpay), payouts, scheduled publishing and reviewer edits
-- (PRD 4.2 step 7 schedule, 4.3 publication, 4.4 sales/earnings/coupon, 5.3 minor edit,
-- 5.4 key corrections, 8 pricing/payouts/students; PAYMENTS.md). Money is integer paise.

-- Scheduled publishing ---------------------------------------------------------------------

-- Approval publishes now, or at the examiner's scheduled time (PRD 4.3 "goes live now or at
-- the scheduled time"). Otherwise identical to 013's verdict.
CREATE OR REPLACE FUNCTION public.finish_test_qc(p_review_id UUID, p_comments TEXT) RETURNS test_status_type
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_review RECORD;
  v_test RECORD;
  v_pass BOOLEAN;
  v_status test_status_type;
BEGIN
  SELECT * INTO v_review FROM public.qc_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND OR v_review.is_second_spot_check THEN
    RAISE EXCEPTION 'Review not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_test FROM public.tests WHERE id = v_review.test_id FOR UPDATE;
  IF public.current_user_id() IS NULL
     OR public.current_user_id() = v_test.examiner_id
     OR NOT (public.has_role('admin')
             OR (public.has_role('qc_reviewer') AND v_review.reviewer_id = public.current_user_id())) THEN
    RAISE EXCEPTION 'Not authorised to finish this review' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_review.completed_at IS NOT NULL OR v_test.status <> 'in_qc' THEN
    RAISE EXCEPTION 'This review is already finished' USING ERRCODE = 'restrict_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.qc_question_reviews WHERE qc_review_id = p_review_id AND reviewer_action = 'pending') THEN
    RAISE EXCEPTION 'Every question needs a decision' USING ERRCODE = 'check_violation';
  END IF;

  v_pass := NOT EXISTS (SELECT 1 FROM public.qc_question_reviews
                         WHERE qc_review_id = p_review_id AND reviewer_action IN ('request_change', 'reject'));

  UPDATE public.test_questions tq
     SET qc_status = r.reviewer_action,
         is_locked_by_qc = r.reviewer_action IN ('approve', 'minor_edit')
    FROM public.qc_question_reviews r
   WHERE r.qc_review_id = p_review_id AND tq.id = r.test_question_id;

  UPDATE public.questions q
     SET is_approved_in_corpus = TRUE
    FROM public.qc_question_reviews r
   WHERE r.qc_review_id = p_review_id AND r.reviewer_action IN ('approve', 'minor_edit')
     AND q.id = r.question_id AND NOT q.is_approved_in_corpus;

  v_status := CASE
    WHEN v_pass AND v_test.scheduled_publish_at > now() THEN 'scheduled'::test_status_type
    WHEN v_pass THEN 'live'::test_status_type
    ELSE 'changes_requested'::test_status_type END;
  UPDATE public.tests
     SET status = v_status, published_at = CASE WHEN v_status = 'live' THEN now() ELSE published_at END
   WHERE id = v_test.id;
  UPDATE public.qc_reviews
     SET status = CASE WHEN v_pass THEN 'approved'::test_status_type ELSE 'changes_requested'::test_status_type END,
         overall_comments = NULLIF(trim(COALESCE(p_comments, '')), ''),
         reviewer_id = COALESCE(reviewer_id, public.current_user_id()),
         completed_at = now()
   WHERE id = p_review_id;
  RETURN v_status;
END $$;

-- Moves scheduled tests whose time has come to live. System job; idempotent.
CREATE FUNCTION public.publish_due_tests() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_count INT;
BEGIN
  IF public.current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'Publishing runs as a system job' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.tests SET status = 'live', published_at = now()
   WHERE status = 'scheduled' AND scheduled_publish_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- Reviewer minor edit keeps the version it replaced (PRD 5.3.4; QC_PIPELINE "binds to exact version").
ALTER TABLE public.qc_question_reviews
  ADD COLUMN original_question_id UUID REFERENCES public.questions(id) ON DELETE RESTRICT;

-- Commerce -----------------------------------------------------------------------------------

ALTER TABLE public.purchases
  ADD COLUMN captured_at TIMESTAMPTZ,
  ADD COLUMN razorpay_refund_id TEXT UNIQUE,
  ADD CONSTRAINT purchases_amounts CHECK (
    gross_amount_paise >= 0 AND discount_paise >= 0 AND discount_paise <= gross_amount_paise
    AND total_paid_paise = gross_amount_paise - discount_paise
    AND taxable_amount_paise + gst_amount_paise = total_paid_paise AND gateway_fee_paise >= 0),
  ADD CONSTRAINT purchases_one_item CHECK (
    (item_type = 'single_test' AND test_id IS NOT NULL AND series_id IS NULL)
    OR (item_type = 'test_series' AND series_id IS NOT NULL AND test_id IS NULL)
    OR (item_type = 'pass' AND pass_plan_id IS NOT NULL));
CREATE INDEX idx_purchases_student ON public.purchases (student_id, status);
CREATE INDEX idx_purchases_examiner_captured ON public.purchases (examiner_id, captured_at);

ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_code_format CHECK (code ~ '^[A-Z0-9]{4,20}$'),
  ADD CONSTRAINT coupons_discount CHECK (
    NOT (discount_percent IS NOT NULL AND flat_discount_paise IS NOT NULL)
    AND COALESCE(flat_discount_paise, 0) >= 0 AND COALESCE(max_discount_paise, 0) >= 0
    AND (max_uses IS NULL OR max_uses > 0)
    AND (valid_until IS NULL OR valid_until > valid_from));

-- Web invoice numbers: one counter per Indian financial year, taken under lock (PAYMENTS.md).
CREATE TABLE public.invoice_counters (
  financial_year TEXT PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0
);
CREATE TRIGGER invoice_counters_server_managed BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_counters
  FOR EACH ROW EXECUTE FUNCTION require_admin_or_system();

ALTER TABLE public.examiner_payouts
  ADD COLUMN carried_forward_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN carried_into_payout_id UUID REFERENCES public.examiner_payouts(id) ON DELETE RESTRICT,
  ADD COLUMN approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN tds_certificate_asset_id UUID REFERENCES public.assets(id) ON DELETE RESTRICT,
  ADD CONSTRAINT examiner_payouts_bank_ref UNIQUE (bank_transfer_ref);

ALTER TYPE public.asset_classification_type ADD VALUE IF NOT EXISTS 'payout_document';

/** Active entitlement to a test, directly or through its series. */
CREATE FUNCTION public.owns_test(p_student UUID, p_test UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_entitlements se
     WHERE se.student_id = p_student AND NOT se.is_revoked
       AND se.valid_from <= now() AND (se.valid_until IS NULL OR se.valid_until > now())
       AND (se.test_id = p_test
            OR se.series_id = (SELECT series_id FROM public.tests WHERE id = p_test)))
$$;

-- Step 1 of the lifecycle: the server prices the item, validates and reserves the coupon under
-- lock, and records the student's pending order. A recent identical open order is reused, so a
-- double click never creates two orders. Amounts come from the database, never the client.
CREATE FUNCTION public.create_web_order(
  p_item_type TEXT, p_item_id UUID, p_coupon_code TEXT, p_gst_rate NUMERIC(5,2)
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_student UUID := public.current_user_id();
  v_price INT;
  v_examiner UUID;
  v_coupon RECORD;
  v_coupon_id UUID;
  v_coupon_examiner UUID;
  v_discount INT := 0;
  v_total INT;
  v_taxable INT;
  v_existing UUID;
  v_used INT;
  v_id UUID;
BEGIN
  IF v_student IS NULL OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_student AND is_blocked) THEN
    RAISE EXCEPTION 'Sign in to buy' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_gst_rate < 0 OR p_gst_rate > 100 THEN
    RAISE EXCEPTION 'Invalid tax rate' USING ERRCODE = 'check_violation';
  END IF;

  IF p_item_type = 'single_test' THEN
    SELECT t.price_paise, t.examiner_id INTO v_price, v_examiner
      FROM public.tests t
      JOIN public.exams e ON e.id = t.exam_id AND e.is_active
      JOIN public.examiner_profiles ep ON ep.user_id = t.examiner_id AND ep.onboarding_status = 'approved'
     WHERE t.id = p_item_id AND t.status = 'live' AND t.access_type = 'paid';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This test is not for sale' USING ERRCODE = 'no_data_found';
    END IF;
    IF public.owns_test(v_student, p_item_id) THEN
      RAISE EXCEPTION 'You already own this test' USING ERRCODE = 'unique_violation';
    END IF;
  ELSIF p_item_type = 'test_series' THEN
    SELECT s.price_paise, s.examiner_id INTO v_price, v_examiner
      FROM public.test_series s
      JOIN public.exams e ON e.id = s.exam_id AND e.is_active
      JOIN public.examiner_profiles ep ON ep.user_id = s.examiner_id AND ep.onboarding_status = 'approved'
     WHERE s.id = p_item_id AND s.is_published AND s.price_paise > 0;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This series is not for sale' USING ERRCODE = 'no_data_found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.student_entitlements se
                WHERE se.student_id = v_student AND se.series_id = p_item_id AND NOT se.is_revoked
                  AND (se.valid_until IS NULL OR se.valid_until > now())) THEN
      RAISE EXCEPTION 'You already own this series' USING ERRCODE = 'unique_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown item' USING ERRCODE = 'check_violation';
  END IF;

  IF NULLIF(trim(COALESCE(p_coupon_code, '')), '') IS NOT NULL THEN
    SELECT * INTO v_coupon FROM public.coupons
     WHERE code = upper(trim(p_coupon_code)) AND is_active
       AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This code is not valid' USING ERRCODE = 'check_violation';
    END IF;
    IF v_coupon.examiner_id IS NOT NULL AND v_coupon.examiner_id <> v_examiner THEN
      RAISE EXCEPTION 'This code is for another examiner''s tests' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.purchases WHERE student_id = v_student AND coupon_id = v_coupon.id
                AND status IN ('captured', 'refunded')) THEN
      RAISE EXCEPTION 'You have already used this code' USING ERRCODE = 'check_violation';
    END IF;
    -- Captured uses plus unpaid orders younger than 30 minutes hold the code's capacity.
    SELECT count(*) INTO v_used FROM public.purchases
     WHERE coupon_id = v_coupon.id AND student_id <> v_student
       AND (status = 'captured' OR (status = 'created' AND created_at > now() - INTERVAL '30 minutes'));
    IF v_coupon.max_uses IS NOT NULL AND v_used >= v_coupon.max_uses THEN
      RAISE EXCEPTION 'This code has been fully used' USING ERRCODE = 'check_violation';
    END IF;
    v_discount := CASE
      WHEN v_coupon.discount_percent IS NOT NULL THEN
        LEAST(floor(v_price * v_coupon.discount_percent / 100)::INT, COALESCE(v_coupon.max_discount_paise, v_price))
      ELSE COALESCE(v_coupon.flat_discount_paise, 0) END;
    -- Razorpay's minimum charge is ₹1.
    v_discount := GREATEST(0, LEAST(v_discount, v_price - 100));
    v_coupon_id := v_coupon.id;
    v_coupon_examiner := v_coupon.examiner_id;
  END IF;

  v_total := v_price - v_discount;
  -- Prices include GST; the rate is the API's configured rate (DECISIONS O09, CA approval pending).
  v_taxable := round(v_total * 100 / (100 + p_gst_rate))::INT;

  SELECT id INTO v_existing FROM public.purchases
   WHERE student_id = v_student AND status = 'created' AND payment_channel = 'razorpay'
     AND item_type = p_item_type::item_purchase_type
     AND COALESCE(test_id, series_id) = p_item_id
     AND coupon_id IS NOT DISTINCT FROM v_coupon_id
     AND total_paid_paise = v_total
     AND created_at > now() - INTERVAL '30 minutes'
   ORDER BY created_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.purchases (student_id, item_type, test_id, series_id, examiner_id, coupon_id, is_examiner_coupon,
                                gross_amount_paise, discount_paise, taxable_amount_paise, gst_rate_percent,
                                gst_amount_paise, total_paid_paise, gateway_fee_paise, net_revenue_paise,
                                payment_channel, status)
  VALUES (v_student, p_item_type::item_purchase_type,
          CASE WHEN p_item_type = 'single_test' THEN p_item_id END,
          CASE WHEN p_item_type = 'test_series' THEN p_item_id END,
          v_examiner, v_coupon_id, v_coupon_examiner IS NOT NULL,
          v_price, v_discount, v_taxable, p_gst_rate, v_total - v_taxable, v_total, 0, v_taxable,
          'razorpay', 'created')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Records the Razorpay order created for the student's own pending purchase (once).
CREATE FUNCTION public.attach_razorpay_order(p_purchase UUID, p_order TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_count INT; v_previous TEXT;
BEGIN
  IF public.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Sign in to buy' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_previous := public.suspend_user_context();
  UPDATE public.purchases SET razorpay_order_id = p_order
   WHERE id = p_purchase AND student_id = v_previous::uuid AND status = 'created' AND razorpay_order_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.user_id', COALESCE(v_previous, ''), true);
  RETURN v_count = 1;
END $$;

-- Steps 4-5: called only after the API verified Razorpay's signature and fetched the payment as
-- captured for exactly this order and amount. Under the order lock: mark paid, invoice number,
-- entitlement, ledger entries, coupon redemption and receipt job, once. Repeats return the
-- same outcome; a refunded order is never reopened.
CREATE FUNCTION public.fulfil_razorpay_payment(
  p_purchase UUID, p_order TEXT, p_payment TEXT, p_amount INT, p_fee INT, p_event TEXT, p_payload JSONB
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_p RECORD;
  v_previous TEXT;
  v_local DATE := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_start INT;
  v_fy TEXT;
  v_number INT;
  v_validity INT;
BEGIN
  SELECT * INTO v_p FROM public.purchases WHERE id = p_purchase FOR UPDATE;
  IF NOT FOUND OR v_p.razorpay_order_id IS DISTINCT FROM p_order THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF public.current_user_id() IS NOT NULL AND public.current_user_id() <> v_p.student_id THEN
    RAISE EXCEPTION 'Not your order' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_p.status IN ('captured', 'refunded') THEN
    RETURN v_p.status::TEXT;
  END IF;
  IF p_amount <> v_p.total_paid_paise OR p_fee < 0 OR p_fee > p_amount THEN
    RAISE EXCEPTION 'Payment does not match the order' USING ERRCODE = 'check_violation';
  END IF;

  v_previous := public.suspend_user_context();

  INSERT INTO public.billing_events (provider, provider_event_id, purchase_id, payload, verified_at, processed_at)
  VALUES ('razorpay', p_event, p_purchase, COALESCE(p_payload, '{}'::jsonb), now(), now())
  ON CONFLICT (provider, provider_event_id) DO NOTHING;

  v_start := CASE WHEN extract(month FROM v_local) >= 4 THEN extract(year FROM v_local)::INT
                  ELSE extract(year FROM v_local)::INT - 1 END;
  v_fy := v_start || '-' || lpad(((v_start + 1) % 100)::TEXT, 2, '0');
  INSERT INTO public.invoice_counters (financial_year, last_number) VALUES (v_fy, 1)
  ON CONFLICT (financial_year) DO UPDATE SET last_number = public.invoice_counters.last_number + 1
  RETURNING last_number INTO v_number;

  UPDATE public.purchases
     SET status = 'captured', razorpay_payment_id = p_payment, captured_at = now(),
         gateway_fee_paise = p_fee, net_revenue_paise = taxable_amount_paise - p_fee,
         invoice_number = 'MMP/' || v_fy || '/' || lpad(v_number::TEXT, 6, '0')
   WHERE id = p_purchase;

  IF v_p.item_type = 'test_series' THEN
    SELECT validity_days INTO v_validity FROM public.test_series WHERE id = v_p.series_id;
  END IF;
  INSERT INTO public.student_entitlements (student_id, purchase_id, item_type, test_id, series_id, valid_until)
  VALUES (v_p.student_id, p_purchase, v_p.item_type, v_p.test_id, v_p.series_id,
          CASE WHEN v_validity IS NOT NULL THEN now() + make_interval(days => v_validity) END);

  INSERT INTO public.ledger_entries (purchase_id, entry_type, source_event, amount_paise)
  VALUES (p_purchase, 'capture', 'razorpay:capture:' || p_payment, v_p.total_paid_paise);
  IF p_fee > 0 THEN
    INSERT INTO public.ledger_entries (purchase_id, entry_type, source_event, amount_paise)
    VALUES (p_purchase, 'gateway_fee', 'razorpay:fee:' || p_payment, -p_fee);
  END IF;
  IF v_p.coupon_id IS NOT NULL THEN
    UPDATE public.coupons SET current_uses = current_uses + 1 WHERE id = v_p.coupon_id;
  END IF;
  INSERT INTO public.jobs (id, deduplication_key, kind, payload, available_at)
  VALUES (gen_random_uuid(), 'purchase-receipt:' || p_purchase, 'purchase_receipt',
          jsonb_build_object('purchase_id', p_purchase), now())
  ON CONFLICT (deduplication_key) DO NOTHING;

  PERFORM set_config('app.user_id', COALESCE(v_previous, ''), true);
  RETURN 'captured';
END $$;

-- Refund recorded after Razorpay accepted it (PRD 8 "record refunds"). Admin only; full refunds
-- within the proposed policy: 7 days from payment and no covered test started. Revokes access
-- and appends the compensating ledger entry once.
CREATE FUNCTION public.record_refund(p_purchase UUID, p_refund_id TEXT, p_amount INT, p_reason TEXT) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_p RECORD;
  v_admin UUID := public.current_user_id();
  v_previous TEXT;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'Only admins record refunds' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_p FROM public.purchases WHERE id = p_purchase FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_p.status = 'refunded' AND v_p.razorpay_refund_id = p_refund_id THEN
    RETURN 'refunded';
  END IF;
  IF v_p.status <> 'captured' OR v_p.payment_channel <> 'razorpay' OR p_amount <> v_p.total_paid_paise THEN
    RAISE EXCEPTION 'Only a captured web payment can be refunded in full' USING ERRCODE = 'check_violation';
  END IF;

  v_previous := public.suspend_user_context();
  UPDATE public.purchases
     SET status = 'refunded', refunded_at = now(), refund_reason = p_reason, refund_processed_by = v_admin,
         razorpay_refund_id = p_refund_id
   WHERE id = p_purchase;
  UPDATE public.student_entitlements SET is_revoked = TRUE WHERE purchase_id = p_purchase;
  INSERT INTO public.ledger_entries (purchase_id, entry_type, source_event, amount_paise)
  VALUES (p_purchase, 'refund', 'razorpay:refund:' || p_refund_id, -p_amount);
  INSERT INTO public.admin_audit_logs (admin_id, action_name, target_table, target_record_id, after_state)
  VALUES (v_admin, 'purchase.refund', 'purchases', p_purchase,
          jsonb_build_object('refund_id', p_refund_id, 'amount_paise', p_amount, 'reason', p_reason));
  PERFORM set_config('app.user_id', COALESCE(v_previous, ''), true);
  RETURN 'refunded';
END $$;

-- Admin access grant (PRD 8 Students "grant access"): a zero-value purchase so the grant has an
-- auditable source and never counts as revenue.
CREATE FUNCTION public.grant_access(p_student UUID, p_item_type TEXT, p_item_id UUID, p_reason TEXT) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_admin UUID := public.current_user_id();
  v_examiner UUID;
  v_validity INT;
  v_id UUID;
  v_previous TEXT;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'Only admins grant access' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_item_type = 'single_test' THEN
    SELECT examiner_id INTO v_examiner FROM public.tests WHERE id = p_item_id AND status IN ('live', 'scheduled', 'approved');
  ELSIF p_item_type = 'test_series' THEN
    SELECT examiner_id, validity_days INTO v_examiner, v_validity FROM public.test_series WHERE id = p_item_id;
  END IF;
  IF v_examiner IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_student) THEN
    RAISE EXCEPTION 'Student or item not found' USING ERRCODE = 'no_data_found';
  END IF;
  v_previous := public.suspend_user_context();
  INSERT INTO public.purchases (student_id, item_type, test_id, series_id, examiner_id, gross_amount_paise,
                                discount_paise, taxable_amount_paise, gst_amount_paise, total_paid_paise,
                                net_revenue_paise, payment_channel, status, captured_at)
  VALUES (p_student, p_item_type::item_purchase_type,
          CASE WHEN p_item_type = 'single_test' THEN p_item_id END,
          CASE WHEN p_item_type = 'test_series' THEN p_item_id END,
          v_examiner, 0, 0, 0, 0, 0, 0, 'admin_grant', 'captured', now())
  RETURNING id INTO v_id;
  INSERT INTO public.student_entitlements (student_id, purchase_id, item_type, test_id, series_id, valid_until)
  VALUES (p_student, v_id, p_item_type::item_purchase_type,
          CASE WHEN p_item_type = 'single_test' THEN p_item_id END,
          CASE WHEN p_item_type = 'test_series' THEN p_item_id END,
          CASE WHEN v_validity IS NOT NULL THEN now() + make_interval(days => v_validity) END);
  INSERT INTO public.admin_audit_logs (admin_id, action_name, target_table, target_record_id, after_state)
  VALUES (v_admin, 'student.grant_access', 'purchases', v_id,
          jsonb_build_object('student_id', p_student, 'item_type', p_item_type, 'item_id', p_item_id, 'reason', p_reason));
  PERFORM set_config('app.user_id', COALESCE(v_previous, ''), true);
  RETURN v_id;
END $$;

-- Monthly payouts (PRD 4.4, 8 "Payouts"; PAYMENTS.md). Replaces 005's version:
-- * sales count in the month they were captured (refunds in the month they were refunded), so
--   a sale refunded in the same month nets to zero; admin grants never earn;
-- * the first payout is held for one cycle only (the examiner's first calculated month);
-- * KYC must be verified; amounts under ₹500, held amounts and negative balances carry forward
--   into the next calculated month instead of being lost.
-- Shares (65% direct, 75% examiner code, Pass pool 50%, multiplier 1.0) are DECISIONS O03 proposals.
CREATE OR REPLACE FUNCTION public.calculate_monthly_examiner_payouts(
    p_payout_month DATE,
    p_default_tds_rate NUMERIC(5,2) DEFAULT 10.00
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    v_month_start TIMESTAMPTZ := (p_payout_month::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
    v_month_end TIMESTAMPTZ := ((p_payout_month + INTERVAL '1 month')::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
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
        RAISE EXCEPTION 'Payout month must be the first day of a month' USING ERRCODE = 'check_violation';
    END IF;
    IF p_payout_month >= date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::DATE THEN
        RAISE EXCEPTION 'Only a finished month can be calculated' USING ERRCODE = 'check_violation';
    END IF;
    IF p_default_tds_rate < 0 OR p_default_tds_rate > 50 THEN
        RAISE EXCEPTION 'Invalid TDS rate' USING ERRCODE = 'check_violation';
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

    -- Pass pool (Phase 2: no Pass is sold yet, so this is zero until Pass plans exist).
    SELECT COALESCE(SUM(
        ROUND((p.net_revenue_paise::NUMERIC * LEAST(30, pp.duration_days)) / pp.duration_days)
    ), 0)::BIGINT
    INTO v_total_pass_net_paise
    FROM public.student_entitlements se
    JOIN public.purchases p ON p.id = se.purchase_id
    JOIN public.pass_plans pp ON pp.id = se.pass_plan_id
    WHERE se.item_type = 'pass' AND se.is_revoked = FALSE AND p.status = 'captured'
      AND se.valid_from < v_month_end AND se.valid_until >= v_month_start;
    v_pool_50_pct_paise := ROUND(v_total_pass_net_paise * 0.50);

    SELECT COUNT(*) INTO v_total_qual_attempts
    FROM public.student_attempts sa
    WHERE sa.submitted_at >= v_month_start AND sa.submitted_at < v_month_end
      AND sa.status IN ('submitted', 'timed_out') AND sa.used_pass_access = TRUE
      AND sa.attempt_number = 1 AND sa.attempted_count >= CEIL(sa.total_questions * 0.50);
    IF v_total_qual_attempts > 0 THEN
        v_rate_per_attempt := ROUND((v_pool_50_pct_paise::NUMERIC / v_total_qual_attempts), 4);
    END IF;

    INSERT INTO public.monthly_pass_pools (payout_month, total_net_pass_revenue_paise, examiner_pool_50_pct_paise,
                                           total_qualified_attempts, per_attempt_rate_paise, calculated_at)
    VALUES (p_payout_month, v_total_pass_net_paise, v_pool_50_pct_paise, v_total_qual_attempts, v_rate_per_attempt, NOW())
    ON CONFLICT (payout_month) DO UPDATE SET
        total_net_pass_revenue_paise = EXCLUDED.total_net_pass_revenue_paise,
        examiner_pool_50_pct_paise = EXCLUDED.examiner_pool_50_pct_paise,
        total_qualified_attempts = EXCLUDED.total_qualified_attempts,
        per_attempt_rate_paise = EXCLUDED.per_attempt_rate_paise,
        calculated_at = NOW();

    WITH sales AS (
        SELECT p.examiner_id,
               COALESCE(SUM(ROUND(p.net_revenue_paise * 0.65)) FILTER (WHERE NOT p.is_examiner_coupon), 0)::BIGINT AS rev_65,
               COALESCE(SUM(ROUND(p.net_revenue_paise * 0.75)) FILTER (WHERE p.is_examiner_coupon), 0)::BIGINT AS rev_75
          FROM public.purchases p
         WHERE p.examiner_id IS NOT NULL AND p.payment_channel <> 'admin_grant'
           AND p.status IN ('captured', 'refunded')
           AND p.captured_at >= v_month_start AND p.captured_at < v_month_end
         GROUP BY p.examiner_id
    ),
    refunds AS (
        SELECT p.examiner_id,
               COALESCE(SUM(CASE WHEN p.is_examiner_coupon THEN ROUND(p.net_revenue_paise * 0.75)
                                 ELSE ROUND(p.net_revenue_paise * 0.65) END), 0)::BIGINT AS deduction
          FROM public.purchases p
         WHERE p.examiner_id IS NOT NULL AND p.payment_channel <> 'admin_grant' AND p.status = 'refunded'
           AND p.refunded_at >= v_month_start AND p.refunded_at < v_month_end
         GROUP BY p.examiner_id
    ),
    pass_attempts AS (
        SELECT t.examiner_id, COUNT(sa.id) AS qual_attempts
          FROM public.student_attempts sa JOIN public.tests t ON t.id = sa.test_id
         WHERE sa.submitted_at >= v_month_start AND sa.submitted_at < v_month_end
           AND sa.status IN ('submitted', 'timed_out') AND sa.used_pass_access = TRUE
           AND sa.attempt_number = 1 AND sa.attempted_count >= CEIL(sa.total_questions * 0.50)
         GROUP BY t.examiner_id
    ),
    carried AS (
        SELECT prev.examiner_id, SUM(prev.gross_earnings_paise)::BIGINT AS amount
          FROM public.examiner_payouts prev
          LEFT JOIN public.examiner_payouts cur ON cur.examiner_id = prev.examiner_id AND cur.payout_month = p_payout_month
         WHERE prev.payout_month < p_payout_month AND prev.status = 'on_hold'
           AND (prev.carried_into_payout_id IS NULL OR prev.carried_into_payout_id = cur.id)
         GROUP BY prev.examiner_id
    ),
    combined AS (
        SELECT ep.user_id AS examiner_id,
               ep.kyc_verified_at IS NOT NULL AS kyc_ok,
               EXISTS (SELECT 1 FROM public.examiner_payouts e2
                        WHERE e2.examiner_id = ep.user_id AND e2.payout_month < p_payout_month) AS has_history,
               COALESCE(s.rev_65, 0) AS direct_65,
               COALESCE(s.rev_75, 0) AS coupon_75,
               COALESCE(pa.qual_attempts, 0) AS q_attempts,
               ROUND(COALESCE(pa.qual_attempts, 0) * v_rate_per_attempt)::BIGINT AS pool_share,
               COALESCE(r.deduction, 0) AS refunds,
               COALESCE(c.amount, 0) AS carried
          FROM public.examiner_profiles ep
          LEFT JOIN sales s ON s.examiner_id = ep.user_id
          LEFT JOIN pass_attempts pa ON pa.examiner_id = ep.user_id
          LEFT JOIN refunds r ON r.examiner_id = ep.user_id
          LEFT JOIN carried c ON c.examiner_id = ep.user_id
         WHERE COALESCE(s.rev_65, 0) + COALESCE(s.rev_75, 0) + COALESCE(pa.qual_attempts, 0)
               + COALESCE(r.deduction, 0) <> 0 OR COALESCE(c.amount, 0) <> 0
    ),
    totals AS (
        SELECT c.*, (c.direct_65 + c.coupon_75 + c.pool_share - c.refunds + c.carried) AS gross FROM combined c
    ),
    decided AS (
        SELECT t.*,
               CASE WHEN t.gross <= 0 THEN 'Nothing payable this month; the balance carries forward'
                    WHEN NOT t.kyc_ok THEN 'KYC not verified yet'
                    WHEN NOT t.has_history THEN 'First payout is held for one cycle'
                    WHEN t.gross < 50000 THEN 'Below the ₹500 minimum; carries forward'
               END AS hold_reason
          FROM totals t
    )
    INSERT INTO public.examiner_payouts (
        examiner_id, payout_month, direct_sales_65_paise, coupon_sales_75_paise, qualified_pass_attempts_count,
        pass_pool_share_paise, quality_multiplier, refund_deductions_paise, carried_forward_paise,
        gross_earnings_paise, tds_rate_percent, tds_deducted_paise, net_payable_paise, status, hold_reason)
    SELECT d.examiner_id, p_payout_month, d.direct_65, d.coupon_75, d.q_attempts, d.pool_share, 1.00, d.refunds,
           d.carried, d.gross, p_default_tds_rate,
           CASE WHEN d.gross > 0 THEN ROUND(d.gross * (p_default_tds_rate / 100.0))::BIGINT ELSE 0 END,
           CASE WHEN d.gross > 0 THEN d.gross - ROUND(d.gross * (p_default_tds_rate / 100.0))::BIGINT ELSE 0 END,
           CASE WHEN d.hold_reason IS NULL THEN 'calculated'::payout_status_type ELSE 'on_hold'::payout_status_type END,
           d.hold_reason
      FROM decided d
    ON CONFLICT (examiner_id, payout_month) DO UPDATE SET
        direct_sales_65_paise = EXCLUDED.direct_sales_65_paise,
        coupon_sales_75_paise = EXCLUDED.coupon_sales_75_paise,
        qualified_pass_attempts_count = EXCLUDED.qualified_pass_attempts_count,
        pass_pool_share_paise = EXCLUDED.pass_pool_share_paise,
        refund_deductions_paise = EXCLUDED.refund_deductions_paise,
        carried_forward_paise = EXCLUDED.carried_forward_paise,
        gross_earnings_paise = EXCLUDED.gross_earnings_paise,
        tds_rate_percent = EXCLUDED.tds_rate_percent,
        tds_deducted_paise = EXCLUDED.tds_deducted_paise,
        net_payable_paise = EXCLUDED.net_payable_paise,
        status = EXCLUDED.status,
        hold_reason = EXCLUDED.hold_reason,
        updated_at = NOW()
    WHERE public.examiner_payouts.status IN ('calculated', 'on_hold');

    -- Link the held rows that this month's (re)calculated payouts absorbed.
    UPDATE public.examiner_payouts prev
       SET carried_into_payout_id = cur.id
      FROM public.examiner_payouts cur
     WHERE cur.examiner_id = prev.examiner_id AND cur.payout_month = p_payout_month
       AND cur.status IN ('calculated', 'on_hold') AND cur.updated_at = now()
       AND prev.payout_month < p_payout_month AND prev.status = 'on_hold' AND prev.carried_into_payout_id IS NULL;

    PERFORM set_config('app.user_id', COALESCE(v_previous_user, ''), true);
END $$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.publish_due_tests()',
    'public.owns_test(uuid, uuid)',
    'public.create_web_order(text, uuid, text, numeric)',
    'public.attach_razorpay_order(uuid, text)',
    'public.fulfil_razorpay_payment(uuid, text, text, integer, integer, text, jsonb)',
    'public.record_refund(uuid, text, integer, text)',
    'public.grant_access(uuid, text, uuid, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'exam_app') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO exam_app, exam_worker', f);
    END IF;
  END LOOP;
END $$;

UPDATE public.bootstrap_state SET version = 16 WHERE id = 'schema';
