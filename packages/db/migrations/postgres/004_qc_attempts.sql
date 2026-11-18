-- Schema v1.1 sections 6 (QC pipeline, student reports) and 7 (attempts, answers,
-- saved questions, ratings). Deviations are listed in docs/DATA_MODEL.md.

-- 6. Quality control pipeline and post-live student reports -------------------------
CREATE TABLE public.qc_reviewer_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (reviewer_id, exam_id, subject_id)
);

CREATE TABLE public.qc_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_second_spot_check BOOLEAN NOT NULL DEFAULT FALSE,
    flag_count INT NOT NULL DEFAULT 0,
    pattern_fit_report JSONB NOT NULL DEFAULT '{}',
    stage1_completed_at TIMESTAMPTZ,
    sla_deadline_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
    status test_status_type NOT NULL DEFAULT 'in_qc',
    overall_comments TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_qc_queue_priority ON public.qc_reviews (status, flag_count DESC, sla_deadline_at ASC);

CREATE TABLE public.qc_question_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qc_review_id UUID NOT NULL REFERENCES public.qc_reviews(id) ON DELETE CASCADE,
    test_question_id UUID NOT NULL REFERENCES public.test_questions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    has_completeness_error BOOLEAN NOT NULL DEFAULT FALSE,
    duplicate_match_kind duplicate_match_type,
    matched_question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
    similarity_score NUMERIC(4,3),
    ai_answer_differs_flag BOOLEAN NOT NULL DEFAULT FALSE,
    ai_ambiguity_flag BOOLEAN NOT NULL DEFAULT FALSE,
    checklist_key_matches_solution BOOLEAN,
    checklist_single_defensible_option BOOLEAN,
    checklist_bilingual_match BOOLEAN,
    checklist_in_syllabus BOOLEAN,
    checklist_no_watermarks BOOLEAN,
    reviewer_action qc_action_type NOT NULL DEFAULT 'pending',
    reason_code TEXT,
    reviewer_comment TEXT,
    reviewed_at TIMESTAMPTZ,
    UNIQUE (qc_review_id, test_question_id)
);

CREATE TABLE public.question_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    attempt_id UUID,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason report_reason_type NOT NULL,
    student_comment TEXT,
    status report_status_type NOT NULL DEFAULT 'open',
    examiner_response TEXT,
    examiner_responded_at TIMESTAMPTZ,
    examiner_sla_deadline_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
    resolved_by_reviewer_id UUID REFERENCES public.profiles(id),
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (question_id, student_id)
);

-- Auto-hide when 5 distinct students report a question. Runs with the table owner's rights
-- so a reporting student's transaction can update the counters; protect_question_integrity
-- accepts moderation changes that arrive from this trigger (nested trigger depth).
CREATE FUNCTION trigger_auto_hide_reported_question() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    distinct_reporters INT;
BEGIN
    SELECT COUNT(DISTINCT student_id) INTO distinct_reporters
    FROM public.question_reports
    WHERE question_id = NEW.question_id AND status = 'open';

    UPDATE public.questions
    SET open_report_count = distinct_reporters,
        is_auto_hidden = CASE WHEN distinct_reporters >= 5 THEN TRUE ELSE is_auto_hidden END
    WHERE id = NEW.question_id;

    RETURN NEW;
END $$;
CREATE TRIGGER trg_question_report_inserted
AFTER INSERT OR UPDATE ON public.question_reports
FOR EACH ROW EXECUTE FUNCTION trigger_auto_hide_reported_question();

-- Allow the report trigger above (and only nested triggers) to update moderation counters
-- inside a student's transaction. Direct updates by users are still rejected.
CREATE OR REPLACE FUNCTION protect_question_integrity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_reviewer BOOLEAN := public.current_user_id() IS NULL
    OR public.has_role('qc_reviewer') OR public.has_role('admin');
  v_system BOOLEAN := public.current_user_id() IS NULL;
  v_from_trigger BOOLEAN := pg_trigger_depth() > 1;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_approved_in_corpus THEN
      RAISE EXCEPTION 'Approved questions cannot be deleted' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_reviewer AND NEW.is_approved_in_corpus THEN
      RAISE EXCEPTION 'Only QC reviewers and admins can approve questions' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT v_system AND (NEW.ai_suggestion <> '{}'::jsonb OR NEW.total_attempts <> 0 OR NEW.correct_attempts <> 0
        OR NEW.skip_attempts <> 0 OR NEW.avg_time_spent_seconds <> 0 OR NEW.open_report_count <> 0 OR NEW.is_auto_hidden) THEN
      RAISE EXCEPTION 'AI suggestions, statistics and moderation state are system-managed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.is_approved_in_corpus AND (
       NOT NEW.is_approved_in_corpus
    OR (NEW.exam_id, NEW.examiner_id, NEW.subject_id, NEW.topic_id, NEW.passage_id, NEW.parent_question_id,
        NEW.version_number, NEW.question_type, NEW.difficulty, NEW.stem_en, NEW.stem_hi, NEW.options,
        NEW.correct_option, NEW.solution_en, NEW.solution_hi, NEW.norm_stem_en, NEW.norm_stem_hi, NEW.text_hash,
        NEW.masked_hash, NEW.image_file_hashes, NEW.image_urls, NEW.is_pyq, NEW.pyq_year, NEW.pyq_shift,
        NEW.is_onboarding_sample, NEW.ai_suggestion)
       IS DISTINCT FROM
       (OLD.exam_id, OLD.examiner_id, OLD.subject_id, OLD.topic_id, OLD.passage_id, OLD.parent_question_id,
        OLD.version_number, OLD.question_type, OLD.difficulty, OLD.stem_en, OLD.stem_hi, OLD.options,
        OLD.correct_option, OLD.solution_en, OLD.solution_hi, OLD.norm_stem_en, OLD.norm_stem_hi, OLD.text_hash,
        OLD.masked_hash, OLD.image_file_hashes, OLD.image_urls, OLD.is_pyq, OLD.pyq_year, OLD.pyq_shift,
        OLD.is_onboarding_sample, OLD.ai_suggestion)) THEN
    RAISE EXCEPTION 'Approved questions are immutable; create a new version' USING ERRCODE = 'restrict_violation';
  END IF;

  IF NOT v_reviewer AND (NEW.is_approved_in_corpus IS DISTINCT FROM OLD.is_approved_in_corpus
      OR (NOT v_from_trigger AND (NEW.is_auto_hidden IS DISTINCT FROM OLD.is_auto_hidden
          OR NEW.open_report_count IS DISTINCT FROM OLD.open_report_count))) THEN
    RAISE EXCEPTION 'Only QC reviewers and admins can approve or moderate questions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT v_system AND (NEW.ai_suggestion IS DISTINCT FROM OLD.ai_suggestion
      OR NEW.total_attempts IS DISTINCT FROM OLD.total_attempts OR NEW.correct_attempts IS DISTINCT FROM OLD.correct_attempts
      OR NEW.skip_attempts IS DISTINCT FROM OLD.skip_attempts
      OR NEW.avg_time_spent_seconds IS DISTINCT FROM OLD.avg_time_spent_seconds) THEN
    RAISE EXCEPTION 'AI suggestions and statistics are system-managed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

-- Deviation (PRD p.4 "versioned, not edited" + "key corrections re-score past attempts"):
-- a key correction is recorded, never applied by overwriting the approved question. The
-- correcting version is a new question row; scoring and delivery read the latest record.
CREATE TABLE public.question_key_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE RESTRICT,
    old_question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    new_question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    old_correct_option TEXT NOT NULL,
    new_correct_option TEXT NOT NULL,
    report_id UUID REFERENCES public.question_reports(id) ON DELETE SET NULL,
    corrected_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (old_question_id <> new_question_id)
);
CREATE INDEX idx_key_corrections_lookup ON public.question_key_corrections (test_id, old_question_id, created_at DESC);
CREATE TRIGGER key_corrections_append_only BEFORE UPDATE OR DELETE ON public.question_key_corrections
  FOR EACH ROW EXECUTE FUNCTION reject_history_change();
CREATE TRIGGER key_corrections_no_truncate BEFORE TRUNCATE ON public.question_key_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_change();

-- 7. CBT engine: attempts, answer sync, saved questions, ratings ---------------------
CREATE TABLE public.student_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE RESTRICT,
    test_version INT NOT NULL DEFAULT 1,
    attempt_number INT NOT NULL DEFAULT 1,
    is_live_window_attempt BOOLEAN NOT NULL DEFAULT FALSE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    server_expires_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    remaining_seconds_at_last_sync INT NOT NULL,
    current_section_id UUID REFERENCES public.test_sections(id),
    current_question_id UUID REFERENCES public.questions(id),
    active_session_token TEXT,
    app_switch_count INT NOT NULL DEFAULT 0,
    status attempt_status_type NOT NULL DEFAULT 'in_progress',
    total_questions INT NOT NULL,
    attempted_count INT NOT NULL DEFAULT 0,
    correct_count INT NOT NULL DEFAULT 0,
    incorrect_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    total_score NUMERIC(7,2) NOT NULL DEFAULT 0.00,
    sectional_scores JSONB NOT NULL DEFAULT '{}',
    rank INT,
    percentile NUMERIC(5,2),
    used_pass_access BOOLEAN NOT NULL DEFAULT FALSE,
    is_qualified_pass_attempt BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_student_attempts_updated_at BEFORE UPDATE ON public.student_attempts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE INDEX idx_attempts_student_test ON public.student_attempts (student_id, test_id, attempt_number);
CREATE INDEX idx_attempts_leaderboard ON public.student_attempts (test_id, attempt_number, status, total_score DESC);

CREATE TABLE public.student_attempt_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.student_attempts(id) ON DELETE CASCADE,
    test_question_id UUID NOT NULL REFERENCES public.test_questions(id) ON DELETE RESTRICT,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    section_id UUID NOT NULL REFERENCES public.test_sections(id) ON DELETE RESTRICT,
    palette_state palette_state_type NOT NULL DEFAULT 'not_visited',
    selected_option TEXT,
    time_spent_seconds INT NOT NULL DEFAULT 0,
    is_correct BOOLEAN,
    marks_awarded NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (attempt_id, question_id)
);
CREATE TRIGGER set_student_attempt_answers_updated_at BEFORE UPDATE ON public.student_attempt_answers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE public.student_saved_questions (
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    test_id UUID REFERENCES public.tests(id) ON DELETE SET NULL,
    is_bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
    is_in_mistake_notebook BOOLEAN NOT NULL DEFAULT FALSE,
    last_wrong_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (student_id, question_id)
);

CREATE TABLE public.test_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (test_id, student_id)
);

ALTER TABLE public.student_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_attempt_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students manage own attempts" ON public.student_attempts
    FOR ALL USING (student_id = public.current_user_id() OR public.has_role('admin'));
CREATE POLICY "Students manage own attempt answers" ON public.student_attempt_answers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.student_attempts sa
            WHERE sa.id = attempt_id AND (sa.student_id = public.current_user_id() OR public.has_role('admin'))
        )
    );

-- Deviation (CLAUDE.md invariant 4: the server decides time and score; DECISIONS C3 strict
-- deadline): under a user context the attempt's identity, timer and scoring columns cannot
-- change, and answers are accepted only while the attempt is in progress and before the
-- server deadline. Scoring, ranking and finalisation run as system jobs (no user context).
CREATE FUNCTION protect_attempt_authority() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF public.current_user_id() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'in_progress' OR NEW.submitted_at IS NOT NULL OR NEW.attempted_count <> 0 OR NEW.correct_count <> 0
       OR NEW.incorrect_count <> 0 OR NEW.skipped_count <> 0 OR NEW.total_score <> 0 OR NEW.sectional_scores <> '{}'::jsonb
       OR NEW.rank IS NOT NULL OR NEW.percentile IS NOT NULL OR NEW.is_qualified_pass_attempt THEN
      RAISE EXCEPTION 'Attempt results are server-managed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.student_id, NEW.test_id, NEW.test_version, NEW.attempt_number, NEW.is_live_window_attempt, NEW.started_at,
      NEW.server_expires_at, NEW.total_questions, NEW.attempted_count, NEW.correct_count, NEW.incorrect_count,
      NEW.skipped_count, NEW.total_score, NEW.sectional_scores, NEW.rank, NEW.percentile,
      NEW.used_pass_access, NEW.is_qualified_pass_attempt)
     IS DISTINCT FROM
     (OLD.student_id, OLD.test_id, OLD.test_version, OLD.attempt_number, OLD.is_live_window_attempt, OLD.started_at,
      OLD.server_expires_at, OLD.total_questions, OLD.attempted_count, OLD.correct_count, OLD.incorrect_count,
      OLD.skipped_count, OLD.total_score, OLD.sectional_scores, OLD.rank, OLD.percentile,
      OLD.used_pass_access, OLD.is_qualified_pass_attempt) THEN
    RAISE EXCEPTION 'Attempt timing and results are server-managed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'in_progress' AND (NEW.status, NEW.submitted_at) IS DISTINCT FROM (OLD.status, OLD.submitted_at) THEN
    RAISE EXCEPTION 'A finished attempt cannot be reopened' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status NOT IN ('in_progress', 'submitted') THEN
    RAISE EXCEPTION 'Only the server can time out or abandon an attempt' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_attempt_authority BEFORE INSERT OR UPDATE ON public.student_attempts
  FOR EACH ROW EXECUTE FUNCTION protect_attempt_authority();

CREATE FUNCTION protect_answer_authority() RETURNS trigger
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
  IF NEW.is_correct IS NOT NULL OR NEW.marks_awarded <> 0
     OR (TG_OP = 'UPDATE' AND (NEW.attempt_id, NEW.test_question_id, NEW.question_id, NEW.section_id)
         IS DISTINCT FROM (OLD.attempt_id, OLD.test_question_id, OLD.question_id, OLD.section_id)) THEN
    RAISE EXCEPTION 'Answer evaluation is server-managed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_answer_authority BEFORE INSERT OR UPDATE OR DELETE ON public.student_attempt_answers
  FOR EACH ROW EXECUTE FUNCTION protect_answer_authority();

UPDATE bootstrap_state SET version = 4 WHERE id = 'schema';
