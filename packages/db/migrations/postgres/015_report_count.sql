-- PRD 5.4 auto-hide counts distinct students with an unresolved report. An examiner reply
-- (status examiner_responded) must not lower the count, or replying could keep a question
-- below the five-report threshold.

CREATE OR REPLACE FUNCTION trigger_auto_hide_reported_question() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    distinct_reporters INT;
BEGIN
    SELECT COUNT(DISTINCT student_id) INTO distinct_reporters
    FROM public.question_reports
    WHERE question_id = NEW.question_id AND status IN ('open', 'examiner_responded');

    UPDATE public.questions
    SET open_report_count = distinct_reporters,
        is_auto_hidden = CASE WHEN distinct_reporters >= 5 THEN TRUE ELSE is_auto_hidden END
    WHERE id = NEW.question_id;

    RETURN NEW;
END $$;

UPDATE public.bootstrap_state SET version = 15 WHERE id = 'schema';
