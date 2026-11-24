-- M8 results, solution review, progress, practice lists and student question reports
-- (docs/RESULTS.md). Students never read questions or keys directly: every read goes through
-- an owner-checked SECURITY DEFINER function that only opens closed attempts.

-- Owner-scoped access. The migration runner had given these two tables an allow-all app
-- policy because they had none of their own.
DROP POLICY IF EXISTS exam_app_access ON public.student_saved_questions;
DROP POLICY IF EXISTS exam_app_access ON public.question_reports;

CREATE POLICY "Students manage own saved questions" ON public.student_saved_questions
  FOR ALL TO exam_app USING (student_id = public.current_user_id())
  WITH CHECK (student_id = public.current_user_id());

-- Reports: the reporting student, plus whoever may see the question (its examiner, QC
-- reviewers and admins through the questions policy).
CREATE POLICY "Report visibility" ON public.question_reports
  FOR SELECT TO exam_app USING (
    student_id = public.current_user_id()
    OR EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_reports.question_id));
CREATE POLICY "Students file own reports" ON public.question_reports
  FOR INSERT TO exam_app WITH CHECK (student_id = public.current_user_id());
CREATE POLICY "Question owners and QC handle reports" ON public.question_reports
  FOR UPDATE TO exam_app USING (EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_reports.question_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_reports.question_id));

-- Closed attempt owned by the caller, or an error that reads as "not found".
CREATE FUNCTION public.closed_attempt_test(p_attempt UUID) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
DECLARE v_test UUID;
BEGIN
  SELECT sa.test_id INTO v_test FROM public.student_attempts sa
   WHERE sa.id = p_attempt AND sa.student_id = public.current_user_id()
     AND sa.status IN ('submitted', 'timed_out');
  IF v_test IS NULL THEN
    RAISE EXCEPTION 'Attempt not found' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_test;
END $$;

-- Solution review for one closed attempt: the delivered (or corrected) question, the
-- student's answer, the key in force, solution, own time and the cohort's averages.
CREATE FUNCTION public.attempt_review(p_attempt UUID)
RETURNS TABLE (test_question_id UUID, question_id UUID, section_id UUID, display_order INT,
               subject_name TEXT, topic_name TEXT, stem_en TEXT, stem_hi TEXT, options JSONB,
               passage_en TEXT, passage_hi TEXT, image_asset_ids UUID[], positive_marks NUMERIC,
               negative_marks NUMERIC, selected_option TEXT, is_correct BOOLEAN, marks_awarded NUMERIC,
               time_spent_seconds INT, marked BOOLEAN, correct_option TEXT, key_corrected BOOLEAN,
               solution_en TEXT, solution_hi TEXT, cohort_attempted INT, cohort_correct INT,
               cohort_avg_seconds NUMERIC, bookmarked BOOLEAN, in_notebook BOOLEAN, reported BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
DECLARE v_test UUID := public.closed_attempt_test(p_attempt);
        v_student UUID := public.current_user_id();
BEGIN
  RETURN QUERY
  WITH cohort AS (
    SELECT a.test_question_id,
           count(*) FILTER (WHERE a.selected_option IS NOT NULL)::INT AS attempted,
           count(*) FILTER (WHERE a.is_correct)::INT AS correct,
           avg(a.time_spent_seconds) AS avg_seconds
      FROM public.student_attempt_answers a
      JOIN public.student_attempts s ON s.id = a.attempt_id
     WHERE s.test_id = v_test AND s.attempt_number = 1 AND s.status IN ('submitted', 'timed_out')
     GROUP BY a.test_question_id)
  SELECT tq.id, q.id, tq.section_id, tq.display_order, sj.name, tp.name, q.stem_en, q.stem_hi,
         (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', o->>'id', 'textEn', o->>'textEn', 'textHi', o->>'textHi'))
                           ORDER BY o->>'id') FROM jsonb_array_elements(q.options) o),
         qp.content_en, qp.content_hi,
         COALESCE((SELECT array_agg(x::uuid) FROM unnest(q.image_urls) x WHERE x ~* '^[0-9a-f-]{36}$'), '{}'),
         tq.positive_marks, tq.negative_marks, saa.selected_option, saa.is_correct, saa.marks_awarded,
         saa.time_spent_seconds, saa.palette_state IN ('marked_for_review', 'answered_and_marked'),
         q.correct_option, latest.new_question_id IS NOT NULL, q.solution_en, q.solution_hi,
         COALESCE(c.attempted, 0), COALESCE(c.correct, 0), c.avg_seconds,
         COALESCE(sv.is_bookmarked, FALSE), COALESCE(sv.is_in_mistake_notebook, FALSE),
         EXISTS (SELECT 1 FROM public.question_reports r WHERE r.student_id = v_student
                   AND r.question_id = saa.question_id)
    FROM public.student_attempt_answers saa
    JOIN public.test_questions tq ON tq.id = saa.test_question_id
    LEFT JOIN LATERAL (
      SELECT k.new_question_id FROM public.question_key_corrections k
       WHERE k.test_id = v_test AND k.old_question_id = saa.question_id
       ORDER BY k.created_at DESC LIMIT 1) latest ON TRUE
    JOIN public.questions q ON q.id = COALESCE(latest.new_question_id, saa.question_id)
    LEFT JOIN public.question_passages qp ON qp.id = q.passage_id
    LEFT JOIN public.subjects sj ON sj.id = q.subject_id
    LEFT JOIN public.topics tp ON tp.id = q.topic_id
    LEFT JOIN cohort c ON c.test_question_id = tq.id
    LEFT JOIN public.student_saved_questions sv ON sv.student_id = v_student AND sv.question_id = saa.question_id
   WHERE saa.attempt_id = p_attempt
   ORDER BY tq.display_order;
END $$;

-- Cohort comparison for the result page: first completed attempts only (RESULTS "Cohort").
CREATE FUNCTION public.attempt_cohort(p_attempt UUID)
RETURNS TABLE (cohort_size INT, average_score NUMERIC, topper_score NUMERIC, average_seconds NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
DECLARE v_test UUID := public.closed_attempt_test(p_attempt);
BEGIN
  RETURN QUERY
  SELECT count(*)::INT, avg(s.total_score), max(s.total_score),
         avg(extract(epoch FROM (s.submitted_at - s.started_at)))
    FROM public.student_attempts s
   WHERE s.test_id = v_test AND s.attempt_number = 1 AND s.status IN ('submitted', 'timed_out');
END $$;

-- Every wrong answer goes to the student's mistake notebook when an attempt closes, however it
-- closed (submit, timeout, finalizer or re-score).
CREATE FUNCTION public.trigger_fill_mistake_notebook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.student_saved_questions (student_id, question_id, test_id, is_bookmarked, is_in_mistake_notebook, last_wrong_at)
  SELECT NEW.student_id, a.question_id, NEW.test_id, FALSE, TRUE, now()
    FROM public.student_attempt_answers a
   WHERE a.attempt_id = NEW.id AND a.is_correct = FALSE
  ON CONFLICT (student_id, question_id)
  DO UPDATE SET is_in_mistake_notebook = TRUE, last_wrong_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER fill_mistake_notebook
  AFTER UPDATE OF status ON public.student_attempts
  FOR EACH ROW
  WHEN (OLD.status = 'in_progress' AND NEW.status IN ('submitted', 'timed_out'))
  EXECUTE FUNCTION public.trigger_fill_mistake_notebook();

-- Earlier closed attempts (before this migration) seed the notebook once.
INSERT INTO public.student_saved_questions (student_id, question_id, test_id, is_bookmarked, is_in_mistake_notebook, last_wrong_at)
SELECT DISTINCT ON (s.student_id, a.question_id) s.student_id, a.question_id, s.test_id, FALSE, TRUE, s.submitted_at
  FROM public.student_attempt_answers a JOIN public.student_attempts s ON s.id = a.attempt_id
 WHERE a.is_correct = FALSE AND s.status IN ('submitted', 'timed_out')
 ORDER BY s.student_id, a.question_id, s.submitted_at DESC
ON CONFLICT (student_id, question_id) DO NOTHING;

-- Bookmark or notebook change, only for a question the student met in a closed attempt.
CREATE FUNCTION public.set_saved_question(p_question UUID, p_bookmarked BOOLEAN, p_notebook BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_student UUID := public.current_user_id(); v_test UUID;
BEGIN
  SELECT s.test_id INTO v_test FROM public.student_attempt_answers a
    JOIN public.student_attempts s ON s.id = a.attempt_id
   WHERE s.student_id = v_student AND a.question_id = p_question AND s.status IN ('submitted', 'timed_out')
   ORDER BY s.submitted_at DESC LIMIT 1;
  IF v_test IS NULL THEN
    RAISE EXCEPTION 'Question not found' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.student_saved_questions (student_id, question_id, test_id, is_bookmarked, is_in_mistake_notebook)
  VALUES (v_student, p_question, v_test, COALESCE(p_bookmarked, FALSE), COALESCE(p_notebook, FALSE))
  ON CONFLICT (student_id, question_id) DO UPDATE
     SET is_bookmarked = COALESCE(p_bookmarked, student_saved_questions.is_bookmarked),
         is_in_mistake_notebook = COALESCE(p_notebook, student_saved_questions.is_in_mistake_notebook);
  DELETE FROM public.student_saved_questions
   WHERE student_id = v_student AND question_id = p_question AND NOT is_bookmarked AND NOT is_in_mistake_notebook;
END $$;

-- Practice list ('mistakes' or 'bookmarks') with the question as the student last met it.
CREATE FUNCTION public.practice_list(p_kind TEXT)
RETURNS TABLE (question_id UUID, test_id UUID, test_title TEXT, attempt_id UUID, subject_name TEXT,
               topic_name TEXT, stem_en TEXT, stem_hi TEXT, options JSONB, passage_en TEXT, passage_hi TEXT,
               image_asset_ids UUID[], selected_option TEXT, correct_option TEXT, solution_en TEXT,
               solution_hi TEXT, bookmarked BOOLEAN, in_notebook BOOLEAN, saved_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
DECLARE v_student UUID := public.current_user_id();
BEGIN
  RETURN QUERY
  SELECT sv.question_id, sv.test_id, t.title, last.attempt_id, sj.name, tp.name, q.stem_en, q.stem_hi,
         (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', o->>'id', 'textEn', o->>'textEn', 'textHi', o->>'textHi'))
                           ORDER BY o->>'id') FROM jsonb_array_elements(q.options) o),
         qp.content_en, qp.content_hi,
         COALESCE((SELECT array_agg(x::uuid) FROM unnest(q.image_urls) x WHERE x ~* '^[0-9a-f-]{36}$'), '{}'),
         last.selected_option, q.correct_option, q.solution_en, q.solution_hi,
         sv.is_bookmarked, sv.is_in_mistake_notebook, COALESCE(sv.last_wrong_at, sv.created_at)
    FROM public.student_saved_questions sv
    JOIN LATERAL (
      SELECT a.attempt_id, a.selected_option FROM public.student_attempt_answers a
        JOIN public.student_attempts s ON s.id = a.attempt_id
       WHERE s.student_id = v_student AND a.question_id = sv.question_id AND s.status IN ('submitted', 'timed_out')
       ORDER BY s.submitted_at DESC LIMIT 1) last ON TRUE
    JOIN public.tests t ON t.id = sv.test_id
    LEFT JOIN LATERAL (
      SELECT k.new_question_id FROM public.question_key_corrections k
       WHERE k.test_id = sv.test_id AND k.old_question_id = sv.question_id
       ORDER BY k.created_at DESC LIMIT 1) latest ON TRUE
    JOIN public.questions q ON q.id = COALESCE(latest.new_question_id, sv.question_id)
    LEFT JOIN public.question_passages qp ON qp.id = q.passage_id
    LEFT JOIN public.subjects sj ON sj.id = q.subject_id
    LEFT JOIN public.topics tp ON tp.id = q.topic_id
   WHERE sv.student_id = v_student
     AND ((p_kind = 'mistakes' AND sv.is_in_mistake_notebook) OR (p_kind = 'bookmarks' AND sv.is_bookmarked))
   ORDER BY COALESCE(sv.last_wrong_at, sv.created_at) DESC
   LIMIT 500;
END $$;

-- Topic accuracy over the student's closed attempts (aggregates only).
CREATE FUNCTION public.my_topic_accuracy()
RETURNS TABLE (subject_name TEXT, topic_name TEXT, attempted INT, correct INT, total INT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
  SELECT sj.name, tp.name,
         count(*) FILTER (WHERE a.selected_option IS NOT NULL)::INT,
         count(*) FILTER (WHERE a.is_correct)::INT,
         count(*)::INT
    FROM public.student_attempt_answers a
    JOIN public.student_attempts s ON s.id = a.attempt_id
    JOIN public.questions q ON q.id = a.question_id
    JOIN public.topics tp ON tp.id = q.topic_id
    JOIN public.subjects sj ON sj.id = q.subject_id
   WHERE s.student_id = public.current_user_id() AND s.status IN ('submitted', 'timed_out')
   GROUP BY sj.name, tp.name
$$;

-- File a report on a question from one of the student's closed attempts; one per question.
CREATE FUNCTION public.report_question(p_attempt UUID, p_question UUID, p_reason TEXT, p_comment TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_test UUID := public.closed_attempt_test(p_attempt);
        v_student UUID := public.current_user_id();
        v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.student_attempt_answers a WHERE a.attempt_id = p_attempt AND a.question_id = p_question) THEN
    RAISE EXCEPTION 'Question not found' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.question_reports (question_id, test_id, attempt_id, student_id, reason, student_comment)
  VALUES (p_question, v_test, p_attempt, v_student, p_reason::public.report_reason_type, NULLIF(btrim(p_comment), ''))
  ON CONFLICT (question_id, student_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT r.id INTO v_id FROM public.question_reports r WHERE r.question_id = p_question AND r.student_id = v_student;
  END IF;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.closed_attempt_test(UUID), public.attempt_review(UUID), public.attempt_cohort(UUID),
  public.set_saved_question(UUID, BOOLEAN, BOOLEAN), public.practice_list(TEXT), public.my_topic_accuracy(),
  public.report_question(UUID, UUID, TEXT, TEXT), public.trigger_fill_mistake_notebook() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attempt_review(UUID), public.attempt_cohort(UUID),
  public.set_saved_question(UUID, BOOLEAN, BOOLEAN), public.practice_list(TEXT), public.my_topic_accuracy(),
  public.report_question(UUID, UUID, TEXT, TEXT) TO exam_app;

UPDATE public.bootstrap_state SET version = 20 WHERE id = 'schema';
