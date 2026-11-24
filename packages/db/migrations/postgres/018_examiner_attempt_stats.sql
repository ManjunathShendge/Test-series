-- Examiner dashboard (PRD 4.4 "attempts per test"): finished attempts on the examiner's own tests,
-- per test and India day. Examiners cannot read student_attempts rows (they belong to students), so
-- this returns counts only, never student identities or answers.

CREATE FUNCTION public.examiner_attempt_stats(p_from TIMESTAMPTZ)
RETURNS TABLE (test_id UUID, day DATE, attempts INT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
  SELECT sa.test_id, (sa.submitted_at AT TIME ZONE 'Asia/Kolkata')::DATE, count(*)::INT
    FROM public.student_attempts sa
    JOIN public.tests t ON t.id = sa.test_id
   WHERE t.examiner_id = public.current_user_id()
     AND sa.status IN ('submitted', 'timed_out')
     AND sa.submitted_at >= p_from
   GROUP BY 1, 2
$$;

REVOKE ALL ON FUNCTION public.examiner_attempt_stats(timestamptz) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'exam_app') THEN
    GRANT EXECUTE ON FUNCTION public.examiner_attempt_stats(timestamptz) TO exam_app, exam_worker;
  END IF;
END $$;

UPDATE public.bootstrap_state SET version = 18 WHERE id = 'schema';
