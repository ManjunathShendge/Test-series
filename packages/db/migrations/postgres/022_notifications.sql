-- C3 notifications (docs/NOTIFICATIONS.md). Domain changes enqueue jobs in the same transaction
-- (transactional outbox, CLAUDE.md invariant 6); the worker delivers them. A provider failure
-- never rolls back the change that caused the notice.

-- 1. Preferences for optional engagement notices; transactional notices ignore them.
ALTER TABLE public.profiles ADD COLUMN notification_prefs JSONB NOT NULL DEFAULT '{}';

-- 2. One row per (recipient, notice, channel): the unique key makes delivery idempotent.
CREATE TABLE public.notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('push', 'email')),
    dedupe_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'skipped', 'failed')),
    detail TEXT,
    provider_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    UNIQUE (user_id, channel, dedupe_key)
);
CREATE INDEX notification_deliveries_failed ON public.notification_deliveries (created_at) WHERE status = 'failed';
CREATE POLICY "Users read own notifications" ON public.notification_deliveries
  FOR SELECT USING (user_id = current_user_id());

-- 3. Enqueue helper: deduplicated on the key, so re-running a change never doubles a notice.
CREATE FUNCTION public.enqueue_job(p_kind TEXT, p_key TEXT, p_payload JSONB, p_at TIMESTAMPTZ DEFAULT NOW())
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO public.jobs (id, deduplication_key, kind, payload, available_at)
  VALUES (gen_random_uuid(), p_kind || ':' || p_key, p_kind, p_payload, p_at)
  ON CONFLICT (deduplication_key) DO NOTHING
$$;
REVOKE ALL ON FUNCTION public.enqueue_job(TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;

-- 4. Outbox triggers ---------------------------------------------------------------------------

-- Result ready when an attempt closes; unfinished-attempt reminder 10 minutes before the
-- deadline (the worker sends it only if the attempt is still running then).
CREATE FUNCTION public.outbox_attempts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'in_progress'
     AND NEW.server_expires_at - INTERVAL '10 minutes' > NEW.started_at + INTERVAL '5 minutes' THEN
    PERFORM public.enqueue_job('notify', 'unfinished_attempt:' || NEW.id,
      jsonb_build_object('kind', 'unfinished_attempt', 'attemptId', NEW.id), NEW.server_expires_at - INTERVAL '10 minutes');
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'in_progress' AND NEW.status IN ('submitted', 'timed_out') THEN
    PERFORM public.enqueue_job('notify', 'result_ready:' || NEW.id,
      jsonb_build_object('kind', 'result_ready', 'attemptId', NEW.id));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER student_attempts_outbox AFTER INSERT OR UPDATE OF status ON public.student_attempts
  FOR EACH ROW EXECUTE FUNCTION public.outbox_attempts();

-- Test goes live: followers hear about it; QC verdicts reach the examiner.
CREATE FUNCTION public.outbox_tests() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = 'live' AND OLD.status IS DISTINCT FROM 'live' THEN
    PERFORM public.enqueue_job('notify', 'followed_new_test:' || NEW.id || ':v' || NEW.version_number,
      jsonb_build_object('kind', 'followed_new_test', 'testId', NEW.id));
  ELSIF NEW.status IN ('approved', 'changes_requested') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_job('notify', 'qc_verdict:' || NEW.id || ':' || NEW.status || ':' || extract(epoch FROM NOW())::bigint,
      jsonb_build_object('kind', 'qc_verdict', 'testId', NEW.id, 'verdict', NEW.status));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER tests_outbox AFTER UPDATE OF status ON public.tests
  FOR EACH ROW EXECUTE FUNCTION public.outbox_tests();

-- Official exam dates changed (admin-approved edit).
CREATE FUNCTION public.outbox_exams() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.important_dates IS DISTINCT FROM OLD.important_dates AND NEW.is_active THEN
    PERFORM public.enqueue_job('notify', 'exam_date_changed:' || NEW.id || ':' || md5(COALESCE(NEW.important_dates::text, '')),
      jsonb_build_object('kind', 'exam_date_changed', 'examId', NEW.id));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER exams_outbox AFTER UPDATE OF important_dates ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.outbox_exams();

-- New student report: one email per question per day groups duplicate reports.
CREATE FUNCTION public.outbox_reports() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.enqueue_job('notify', 'student_report:' || NEW.question_id || ':' || to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'),
    jsonb_build_object('kind', 'student_report', 'reportId', NEW.id), NOW() + INTERVAL '5 minutes');
  RETURN NULL;
END $$;
CREATE TRIGGER question_reports_outbox AFTER INSERT ON public.question_reports
  FOR EACH ROW EXECUTE FUNCTION public.outbox_reports();

-- Payout marked paid (verified status only).
CREATE FUNCTION public.outbox_payouts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    PERFORM public.enqueue_job('notify', 'payout_paid:' || NEW.id, jsonb_build_object('kind', 'payout_paid', 'payoutId', NEW.id));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER examiner_payouts_outbox AFTER UPDATE OF status ON public.examiner_payouts
  FOR EACH ROW EXECUTE FUNCTION public.outbox_payouts();

-- Captured purchase: receipt email, and the server-confirmed analytics event.
CREATE FUNCTION public.outbox_purchases() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = 'captured' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'captured') AND NEW.payment_channel <> 'admin_grant' THEN
    PERFORM public.enqueue_job('notify', 'receipt_ready:' || NEW.id, jsonb_build_object('kind', 'receipt_ready', 'purchaseId', NEW.id));
    PERFORM public.enqueue_job('analytics', 'purchase_confirmed:' || NEW.id, jsonb_build_object('purchaseId', NEW.id));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER purchases_outbox AFTER INSERT OR UPDATE OF status ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.outbox_purchases();

UPDATE public.bootstrap_state SET version = 22 WHERE id = 'schema';
