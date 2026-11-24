-- C5 AI assistance for reviewers (QC_PIPELINE "AI boundary"). AI only suggests: suggestions are
-- separate immutable records, never a change to content or a verdict.

-- 1. Per-exam switches, off unless an admin turns them on (the earlier default was on).
ALTER TABLE public.exams ALTER COLUMN ai_answer_check_enabled SET DEFAULT FALSE;
ALTER TABLE public.exams ALTER COLUMN ai_ambiguity_check_enabled SET DEFAULT FALSE;
ALTER TABLE public.exams ADD COLUMN ai_language_check_enabled BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE public.exams SET ai_answer_check_enabled = FALSE, ai_ambiguity_check_enabled = FALSE
 WHERE ai_answer_check_enabled OR ai_ambiguity_check_enabled;

-- 2. Suggestions: one immutable record per question version and check run.
CREATE TABLE public.ai_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    question_version INT NOT NULL,
    cache_key TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version INT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ok', 'unavailable')),
    -- Which checks ran (the exam switches at the time).
    checks TEXT[] NOT NULL,
    selected_option TEXT,
    -- Server comparison of the AI's blind answer with the key; the key never goes to the AI.
    matches_key BOOLEAN,
    ambiguity_note TEXT,
    language_note TEXT,
    unavailable_reason TEXT,
    cost_micro_usd BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ai_suggestions_question ON public.ai_suggestions (question_id, question_version, created_at DESC);
CREATE TRIGGER ai_suggestions_append_only BEFORE UPDATE OR DELETE ON public.ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION reject_history_change();
-- Reviewers and admins read; only the worker (its own role) writes.
CREATE POLICY "QC staff read AI suggestions" ON public.ai_suggestions
  FOR SELECT USING (public.has_role('qc_reviewer') OR public.has_role('admin'));

-- 3. Monthly spend: estimated cost is reserved atomically before a call, then settled.
CREATE TABLE public.ai_spend_months (
    month DATE PRIMARY KEY,
    reserved_micro_usd BIGINT NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0),
    calls INT NOT NULL DEFAULT 0
);
CREATE POLICY "Admins read AI spend" ON public.ai_spend_months FOR SELECT USING (public.has_role('admin'));

-- The worker-only cache must not be readable by the app role either.
CREATE POLICY "Admins read AI cache" ON public.ai_question_cache FOR SELECT USING (public.has_role('admin'));

-- 4. A test entering QC queues the checks (the job reads the exam switches when it runs).
CREATE FUNCTION public.outbox_ai_checks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = 'in_qc' AND OLD.status IS DISTINCT FROM 'in_qc' THEN
    PERFORM public.enqueue_job('ai.check_test', NEW.id || ':' || extract(epoch FROM NOW())::bigint, jsonb_build_object('testId', NEW.id));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER tests_ai_checks AFTER UPDATE OF status ON public.tests
  FOR EACH ROW EXECUTE FUNCTION public.outbox_ai_checks();

UPDATE public.bootstrap_state SET version = 25 WHERE id = 'schema';
