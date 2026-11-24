-- Attempt engine (M7; PRD 6.4, TEST_ENGINE.md). The server owns time, sections, sequence and
-- score: students write answers only through the API while their attempt and its current
-- section are open, and every timing or scoring change runs in the SECURITY DEFINER functions
-- below. Keys and solutions never leave through any function here (invariant 3).

-- Session and sync watermark ---------------------------------------------------------------
ALTER TABLE public.student_attempts
  ADD COLUMN session_epoch INT NOT NULL DEFAULT 1,
  ADD COLUMN ack_seq INT NOT NULL DEFAULT 0,
  ADD CONSTRAINT student_attempts_sync CHECK (session_epoch >= 1 AND ack_seq >= 0);

-- At most one unfinished attempt per student and test.
CREATE UNIQUE INDEX student_attempts_one_open ON public.student_attempts (student_id, test_id) WHERE status = 'in_progress';
CREATE INDEX idx_attempts_open_deadline ON public.student_attempts (server_expires_at) WHERE status = 'in_progress';

-- Section windows. Without sectional timing every section shares the whole-test window. With it,
-- sections run in order; a section closes at its time or when the student moves on early, and
-- unused time is not carried over (TEST_ENGINE "Time, sections and device takeover").
CREATE TABLE public.student_attempt_sections (
  attempt_id UUID NOT NULL REFERENCES public.student_attempts(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.test_sections(id) ON DELETE RESTRICT,
  section_order INT NOT NULL,
  duration_seconds INT,
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  PRIMARY KEY (attempt_id, section_id),
  UNIQUE (attempt_id, section_order),
  CHECK (closes_at IS NULL OR opens_at IS NOT NULL AND closes_at > opens_at)
);
ALTER TABLE public.student_attempt_sections ENABLE ROW LEVEL SECURITY;
-- Read-only for the student: windows change only inside the definer functions.
CREATE POLICY "Students read own attempt sections" ON public.student_attempt_sections FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.student_attempts sa WHERE sa.id = attempt_id
           AND (sa.student_id = public.current_user_id() OR public.has_role('admin'))));

-- Accepted and rejected sync events, per session epoch: replay detection and support evidence.
CREATE TABLE public.student_attempt_events (
  attempt_id UUID NOT NULL REFERENCES public.student_attempts(id) ON DELETE CASCADE,
  epoch INT NOT NULL,
  seq INT NOT NULL CHECK (seq >= 1),
  payload JSONB NOT NULL,
  accepted BOOLEAN NOT NULL,
  reason TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, epoch, seq)
);
ALTER TABLE public.student_attempt_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read own attempt events" ON public.student_attempt_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.student_attempts sa WHERE sa.id = attempt_id
           AND (sa.student_id = public.current_user_id() OR public.has_role('admin'))));
CREATE POLICY "Students record events on open attempts" ON public.student_attempt_events FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.student_attempts sa WHERE sa.id = attempt_id
           AND sa.student_id = public.current_user_id() AND sa.status = 'in_progress'));
CREATE TRIGGER attempt_events_append_only BEFORE UPDATE OR DELETE ON public.student_attempt_events
  FOR EACH ROW EXECUTE FUNCTION reject_history_change();

-- Answers: also refused outside the question's open section window.
CREATE OR REPLACE FUNCTION protect_answer_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_attempt RECORD;
BEGIN
  IF public.current_user_id() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT status, server_expires_at INTO v_attempt FROM public.student_attempts
   WHERE id = COALESCE(NEW.attempt_id, OLD.attempt_id);
  IF v_attempt.status <> 'in_progress' OR now() > v_attempt.server_expires_at THEN
    RAISE EXCEPTION 'Attempt is closed for answers' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Answers cannot be deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Answer rows are created when the attempt starts' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.is_correct IS NOT NULL OR NEW.marks_awarded <> 0
     OR (NEW.attempt_id, NEW.test_question_id, NEW.question_id, NEW.section_id)
         IS DISTINCT FROM (OLD.attempt_id, OLD.test_question_id, OLD.question_id, OLD.section_id) THEN
    RAISE EXCEPTION 'Answer evaluation is server-managed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.selected_option IS NOT NULL AND NEW.selected_option NOT IN ('A', 'B', 'C', 'D') THEN
    RAISE EXCEPTION 'Unknown option' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_attempt_sections w
                  WHERE w.attempt_id = NEW.attempt_id AND w.section_id = NEW.section_id
                    AND w.closed_at IS NULL AND w.opens_at <= now() AND w.closes_at > now()) THEN
    RAISE EXCEPTION 'This section is closed' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;

-- Applies scheduled section changes up to now (and, with p_advance, finishes the open section
-- early). Owner or system. Returns the open section, if any.
CREATE FUNCTION public.attempt_tick_sections(p_attempt UUID, p_advance BOOLEAN) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_a RECORD;
  v_open RECORD;
  v_next RECORD;
  v_at TIMESTAMPTZ;
  v_previous TEXT;
BEGIN
  SELECT * INTO v_a FROM public.student_attempts WHERE id = p_attempt FOR UPDATE;
  IF NOT FOUND OR (public.current_user_id() IS NOT NULL AND v_a.student_id <> public.current_user_id()) THEN
    RAISE EXCEPTION 'Attempt not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_a.status <> 'in_progress' THEN RETURN NULL; END IF;
  v_previous := public.suspend_user_context();
  LOOP
    SELECT * INTO v_open FROM public.student_attempt_sections
     WHERE attempt_id = p_attempt AND closed_at IS NULL AND opens_at IS NOT NULL
     ORDER BY section_order LIMIT 1;
    EXIT WHEN NOT FOUND;
    -- Whole-test window: every section is open together; nothing to advance.
    EXIT WHEN v_open.duration_seconds IS NULL;
    IF v_open.closes_at <= now() THEN
      v_at := v_open.closes_at;
    ELSIF p_advance THEN
      v_at := now();
      p_advance := FALSE;
    ELSE
      EXIT;
    END IF;
    UPDATE public.student_attempt_sections SET closed_at = v_at
     WHERE attempt_id = p_attempt AND section_id = v_open.section_id;
    SELECT * INTO v_next FROM public.student_attempt_sections
     WHERE attempt_id = p_attempt AND section_order > v_open.section_order ORDER BY section_order LIMIT 1;
    EXIT WHEN NOT FOUND;
    UPDATE public.student_attempt_sections
       SET opens_at = v_at, closes_at = LEAST(v_at + make_interval(secs => v_next.duration_seconds), v_a.server_expires_at)
     WHERE attempt_id = p_attempt AND section_id = v_next.section_id;
  END LOOP;
  SELECT section_id INTO v_open FROM public.student_attempt_sections
   WHERE attempt_id = p_attempt AND closed_at IS NULL AND opens_at IS NOT NULL AND opens_at <= now()
   ORDER BY section_order LIMIT 1;
  UPDATE public.student_attempts SET current_section_id = COALESCE(v_open.section_id, current_section_id)
   WHERE id = p_attempt AND current_section_id IS DISTINCT FROM COALESCE(v_open.section_id, current_section_id);
  PERFORM set_config('app.user_id', COALESCE(v_previous, ''), true);
  RETURN v_open.section_id;
END $$;

-- Start (PRD 6.4): live test of an active exam; free, or owned directly or through its series.
-- Returns the existing unfinished attempt for this test instead of a second one.
CREATE FUNCTION public.start_attempt(p_test UUID, p_session_hash TEXT) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_student UUID := public.current_user_id();
  v_t RECORD;
  v_existing RECORD;
  v_sectional BOOLEAN;
  v_duration INT;
  v_total INT;
  v_id UUID;
  v_first_section UUID;
  v_first_question UUID;
  v_previous TEXT;
BEGIN
  IF v_student IS NULL OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_student AND is_blocked) THEN
    RAISE EXCEPTION 'Sign in to start' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_session_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid session' USING ERRCODE = 'check_violation';
  END IF;
  SELECT t.id, t.total_duration_seconds, t.access_type, t.is_admin_featured_free, t.version_number, tp.has_sectional_timing
    INTO v_t
    FROM public.tests t
    JOIN public.exams e ON e.id = t.exam_id AND e.is_active
    JOIN public.examiner_profiles ep ON ep.user_id = t.examiner_id AND ep.onboarding_status = 'approved'
    JOIN public.profiles ex ON ex.id = t.examiner_id AND NOT ex.is_blocked
    LEFT JOIN public.exam_templates tp ON tp.id = t.template_id
   WHERE t.id = p_test AND t.status = 'live';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This test is not available' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (v_t.access_type = 'free' OR v_t.is_admin_featured_free OR public.owns_test(v_student, p_test)) THEN
    RAISE EXCEPTION 'Buy this test to attempt it' USING ERRCODE = 'MP402';
  END IF;

  -- An unfinished attempt past its deadline is closed first; a live one is returned.
  SELECT id, server_expires_at INTO v_existing FROM public.student_attempts
   WHERE student_id = v_student AND test_id = p_test AND status = 'in_progress' FOR UPDATE;
  IF FOUND THEN
    IF v_existing.server_expires_at > now() THEN
      RETURN v_existing.id;
    END IF;
    PERFORM public.finish_attempt(v_existing.id, TRUE);
  END IF;
  -- One active attempt per account at a time (PRD 12 "one active session per account").
  SELECT id INTO v_existing FROM public.student_attempts
   WHERE student_id = v_student AND status = 'in_progress' AND server_expires_at > now() LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Finish your other test first' USING ERRCODE = 'MP409', DETAIL = v_existing.id::text;
  END IF;

  SELECT count(*) INTO v_total FROM public.test_questions tq
    JOIN public.questions q ON q.id = tq.question_id
   WHERE tq.test_id = p_test AND NOT q.is_auto_hidden;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'This test has no questions available right now' USING ERRCODE = 'no_data_found';
  END IF;
  v_sectional := COALESCE(v_t.has_sectional_timing, FALSE)
    AND NOT EXISTS (SELECT 1 FROM public.test_sections WHERE test_id = p_test AND COALESCE(duration_seconds, 0) <= 0);
  v_duration := CASE WHEN v_sectional THEN (SELECT sum(duration_seconds) FROM public.test_sections WHERE test_id = p_test)
                     ELSE v_t.total_duration_seconds END;
  SELECT id INTO v_first_section FROM public.test_sections WHERE test_id = p_test ORDER BY section_order LIMIT 1;
  SELECT tq.question_id INTO v_first_question FROM public.test_questions tq
    JOIN public.questions q ON q.id = tq.question_id
   WHERE tq.test_id = p_test AND NOT q.is_auto_hidden ORDER BY tq.display_order LIMIT 1;

  INSERT INTO public.student_attempts (student_id, test_id, test_version, attempt_number, server_expires_at,
                                       remaining_seconds_at_last_sync, current_section_id, current_question_id,
                                       active_session_token, total_questions)
  VALUES (v_student, p_test, v_t.version_number,
          COALESCE((SELECT max(attempt_number) FROM public.student_attempts WHERE student_id = v_student AND test_id = p_test), 0) + 1,
          now() + make_interval(secs => v_duration), v_duration, v_first_section, v_first_question, p_session_hash, v_total)
  RETURNING id INTO v_id;

  v_previous := public.suspend_user_context();
  INSERT INTO public.student_attempt_answers (attempt_id, test_question_id, question_id, section_id)
  SELECT v_id, tq.id, tq.question_id, tq.section_id
    FROM public.test_questions tq JOIN public.questions q ON q.id = tq.question_id
   WHERE tq.test_id = p_test AND NOT q.is_auto_hidden;
  INSERT INTO public.student_attempt_sections (attempt_id, section_id, section_order, duration_seconds, opens_at, closes_at)
  SELECT v_id, s.id, s.section_order,
         CASE WHEN v_sectional THEN s.duration_seconds END,
         CASE WHEN NOT v_sectional OR s.id = v_first_section THEN now() END,
         CASE WHEN NOT v_sectional THEN now() + make_interval(secs => v_duration)
              WHEN s.id = v_first_section THEN now() + make_interval(secs => s.duration_seconds) END
    FROM public.test_sections s WHERE s.test_id = p_test;
  PERFORM set_config('app.user_id', COALESCE(v_previous, ''), true);
  RETURN v_id;
END $$;

-- Submit or time out, then score with the latest corrected version of each question. Owner or
-- system; idempotent (a finished attempt returns its status). Ranks rebuilt for first attempts.
CREATE FUNCTION public.finish_attempt(p_attempt UUID, p_timed_out BOOLEAN) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_a RECORD;
  v_status attempt_status_type;
  v_previous TEXT;
BEGIN
  SELECT * INTO v_a FROM public.student_attempts WHERE id = p_attempt FOR UPDATE;
  IF NOT FOUND OR (public.current_user_id() IS NOT NULL AND v_a.student_id <> public.current_user_id()) THEN
    RAISE EXCEPTION 'Attempt not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_a.status <> 'in_progress' THEN
    RETURN v_a.status::TEXT;
  END IF;
  v_status := CASE WHEN p_timed_out OR now() >= v_a.server_expires_at THEN 'timed_out' ELSE 'submitted' END;
  v_previous := public.suspend_user_context();

  WITH keyed AS (
    SELECT saa.id, tq.positive_marks, tq.negative_marks, q.correct_option
      FROM public.student_attempt_answers saa
      JOIN public.test_questions tq ON tq.id = saa.test_question_id
      LEFT JOIN LATERAL (
        SELECT c.new_question_id FROM public.question_key_corrections c
         WHERE c.test_id = v_a.test_id AND c.old_question_id = saa.question_id
         ORDER BY c.created_at DESC LIMIT 1) latest ON TRUE
      JOIN public.questions q ON q.id = COALESCE(latest.new_question_id, saa.question_id)
     WHERE saa.attempt_id = p_attempt
  )
  UPDATE public.student_attempt_answers saa
     SET is_correct = CASE WHEN saa.selected_option IS NULL THEN NULL ELSE saa.selected_option = k.correct_option END,
         marks_awarded = CASE WHEN saa.selected_option IS NULL THEN 0
                              WHEN saa.selected_option = k.correct_option THEN k.positive_marks
                              ELSE -k.negative_marks END
    FROM keyed k WHERE k.id = saa.id;

  UPDATE public.student_attempts sa
     SET status = v_status,
         submitted_at = LEAST(now(), sa.server_expires_at),
         remaining_seconds_at_last_sync = GREATEST(0, floor(extract(epoch FROM sa.server_expires_at - now())))::INT,
         attempted_count = agg.attempted,
         correct_count = agg.correct,
         incorrect_count = agg.incorrect,
         skipped_count = sa.total_questions - agg.attempted,
         total_score = agg.score,
         sectional_scores = agg.sections
    FROM (
      SELECT count(*) FILTER (WHERE selected_option IS NOT NULL)::INT AS attempted,
             count(*) FILTER (WHERE is_correct)::INT AS correct,
             count(*) FILTER (WHERE is_correct = FALSE)::INT AS incorrect,
             COALESCE(sum(marks_awarded), 0) AS score,
             COALESCE((SELECT jsonb_object_agg(s.section_id, jsonb_build_object(
                         'score', s.score, 'correct', s.correct, 'incorrect', s.incorrect,
                         'attempted', s.attempted, 'total', s.total))
                         FROM (SELECT section_id, sum(marks_awarded) AS score,
                                      count(*) FILTER (WHERE is_correct) AS correct,
                                      count(*) FILTER (WHERE is_correct = FALSE) AS incorrect,
                                      count(*) FILTER (WHERE selected_option IS NOT NULL) AS attempted,
                                      count(*) AS total
                                 FROM public.student_attempt_answers WHERE attempt_id = p_attempt
                                GROUP BY section_id) s), '{}'::jsonb) AS sections
        FROM public.student_attempt_answers WHERE attempt_id = p_attempt
    ) agg
   WHERE sa.id = p_attempt;

  UPDATE public.student_attempt_sections SET closed_at = LEAST(now(), COALESCE(closes_at, now()))
   WHERE attempt_id = p_attempt AND closed_at IS NULL AND opens_at IS NOT NULL;

  -- Ranks and test statistics over first attempts (PRD 6.5).
  WITH ranked AS (
    SELECT id, RANK() OVER (ORDER BY total_score DESC, submitted_at ASC, id) AS r,
           ROUND((PERCENT_RANK() OVER (ORDER BY total_score ASC) * 100)::NUMERIC, 2) AS p
      FROM public.student_attempts
     WHERE test_id = v_a.test_id AND attempt_number = 1 AND status IN ('submitted', 'timed_out'))
  UPDATE public.student_attempts sa SET rank = ranked.r, percentile = ranked.p
    FROM ranked WHERE sa.id = ranked.id AND (sa.rank, sa.percentile) IS DISTINCT FROM (ranked.r, ranked.p);
  UPDATE public.tests t
     SET attempts_count = t.attempts_count + 1,
         avg_score = COALESCE(s.avg, 0), topper_score = COALESCE(s.top, 0)
    FROM (SELECT round(avg(total_score), 2) AS avg, max(total_score) AS top FROM public.student_attempts
           WHERE test_id = v_a.test_id AND attempt_number = 1 AND status IN ('submitted', 'timed_out')) s
   WHERE t.id = v_a.test_id;

  PERFORM set_config('app.user_id', COALESCE(v_previous, ''), true);
  RETURN v_status::TEXT;
END $$;

-- Deadline finalizer (system job): attempts past their deadline by more than the 30-second
-- in-flight grace (DECISIONS O12) are timed out and scored.
CREATE FUNCTION public.finalize_expired_attempts() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_id UUID;
  v_count INT := 0;
BEGIN
  IF public.current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'Finalizing runs as a system job' USING ERRCODE = 'insufficient_privilege';
  END IF;
  FOR v_id IN SELECT id FROM public.student_attempts
               WHERE status = 'in_progress' AND server_expires_at < now() - INTERVAL '30 seconds'
               ORDER BY server_expires_at LIMIT 200 FOR UPDATE SKIP LOCKED LOOP
    PERFORM public.finish_attempt(v_id, TRUE);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

-- The question paper for the attempt's owner: no keys, no solutions, ever. Corrected versions
-- replace originals (PRD 4.3 key corrections).
CREATE FUNCTION public.attempt_paper(p_attempt UUID)
RETURNS TABLE (test_question_id UUID, section_id UUID, display_order INT, stem_en TEXT, stem_hi TEXT,
               options JSONB, passage_en TEXT, passage_hi TEXT, image_asset_ids UUID[],
               positive_marks NUMERIC, negative_marks NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
DECLARE v_test UUID;
BEGIN
  SELECT sa.test_id INTO v_test FROM public.student_attempts sa
   WHERE sa.id = p_attempt AND sa.student_id = public.current_user_id();
  IF v_test IS NULL THEN
    RAISE EXCEPTION 'Attempt not found' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN QUERY
  SELECT tq.id, tq.section_id, tq.display_order, q.stem_en, q.stem_hi,
         (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', o->>'id', 'textEn', o->>'textEn', 'textHi', o->>'textHi'))
                           ORDER BY o->>'id')
            FROM jsonb_array_elements(q.options) o),
         qp.content_en, qp.content_hi,
         COALESCE((SELECT array_agg(x::uuid) FROM unnest(q.image_urls) x WHERE x ~* '^[0-9a-f-]{36}$'), '{}'),
         tq.positive_marks, tq.negative_marks
    FROM public.student_attempt_answers saa
    JOIN public.test_questions tq ON tq.id = saa.test_question_id
    LEFT JOIN LATERAL (
      SELECT c.new_question_id FROM public.question_key_corrections c
       WHERE c.test_id = v_test AND c.old_question_id = saa.question_id
       ORDER BY c.created_at DESC LIMIT 1) latest ON TRUE
    JOIN public.questions q ON q.id = COALESCE(latest.new_question_id, saa.question_id)
    LEFT JOIN public.question_passages qp ON qp.id = q.passage_id
   WHERE saa.attempt_id = p_attempt
   ORDER BY tq.display_order;
END $$;

-- A clean question image in this attempt's paper, for a short-lived signed URL.
CREATE FUNCTION public.attempt_image(p_attempt UUID, p_asset UUID)
RETURNS TABLE (bucket TEXT, object_key TEXT, mime_type TEXT)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN QUERY
  SELECT a.bucket, a.object_key, a.mime_type
    FROM public.assets a
   WHERE a.id = p_asset AND a.scan_status = 'clean' AND a.uploaded_at IS NOT NULL
     AND a.classification = 'question_asset'
     AND EXISTS (
       SELECT 1 FROM public.student_attempts sa
         JOIN public.student_attempt_answers saa ON saa.attempt_id = sa.id
         LEFT JOIN LATERAL (
           SELECT c.new_question_id FROM public.question_key_corrections c
            WHERE c.test_id = sa.test_id AND c.old_question_id = saa.question_id
            ORDER BY c.created_at DESC LIMIT 1) latest ON TRUE
         JOIN public.questions q ON q.id = COALESCE(latest.new_question_id, saa.question_id)
        WHERE sa.id = p_attempt AND sa.student_id = public.current_user_id()
          AND p_asset::text = ANY (q.image_urls));
END $$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.attempt_tick_sections(uuid, boolean)',
    'public.start_attempt(uuid, text)',
    'public.finish_attempt(uuid, boolean)',
    'public.finalize_expired_attempts()',
    'public.attempt_paper(uuid)',
    'public.attempt_image(uuid, uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'exam_app') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO exam_app, exam_worker', f);
    END IF;
  END LOOP;
END $$;

UPDATE public.bootstrap_state SET version = 19 WHERE id = 'schema';
