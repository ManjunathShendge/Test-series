-- Schema v1.1 sections 3 (hierarchy, syllabus, templates), 4 (question bank, AI cache) and
-- 5 (test catalogue). Deviations are listed in docs/DATA_MODEL.md.

-- 3. Exam hierarchy, syllabus tree and admin templates ------------------------------
CREATE TABLE public.exam_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.exam_categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    syllabus_markdown TEXT,
    important_dates JSONB DEFAULT '[]',
    previous_cutoffs JSONB DEFAULT '[]',
    last_cutoff_score NUMERIC(6,2),
    ai_answer_check_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ai_ambiguity_check_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    pyq_max_percentage NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    trigram_high_threshold NUMERIC(4,3) NOT NULL DEFAULT 0.750,
    trigram_mid_threshold NUMERIC(4,3) NOT NULL DEFAULT 0.550,
    price_band_min_paise INT NOT NULL DEFAULT 1900,
    price_band_max_new_paise INT NOT NULL DEFAULT 4900,
    price_band_max_verified_paise INT NOT NULL DEFAULT 9900,
    price_band_max_top_paise INT NOT NULL DEFAULT 19900,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_exams_updated_at BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE public.exam_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 1,
    UNIQUE (exam_id, slug)
);

CREATE TABLE public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE (exam_id, name)
);

CREATE TABLE public.topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE (subject_id, name)
);

CREATE TABLE public.exam_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES public.exam_stages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    total_questions INT NOT NULL,
    total_duration_seconds INT NOT NULL,
    has_sectional_timing BOOLEAN NOT NULL DEFAULT FALSE,
    default_positive_marks NUMERIC(5,2) NOT NULL DEFAULT 2.00,
    default_negative_marks NUMERIC(5,2) NOT NULL DEFAULT 0.50,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.exam_template_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.exam_templates(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    section_order INT NOT NULL,
    question_count INT NOT NULL,
    duration_seconds INT,
    positive_marks NUMERIC(5,2) NOT NULL,
    negative_marks NUMERIC(5,2) NOT NULL,
    target_topic_counts JSONB NOT NULL DEFAULT '{}',
    UNIQUE (template_id, section_order)
);

-- 4. Question bank, passages and AI caching -----------------------------------------
CREATE TABLE public.question_passages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    examiner_id UUID REFERENCES public.examiner_profiles(user_id) ON DELETE SET NULL,
    content_en TEXT NOT NULL,
    content_hi TEXT,
    images JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    examiner_id UUID REFERENCES public.examiner_profiles(user_id) ON DELETE SET NULL,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
    passage_id UUID REFERENCES public.question_passages(id) ON DELETE SET NULL,
    -- Deviation (PRD p.4 versioning): a correction is a new version of the question.
    parent_question_id UUID REFERENCES public.questions(id) ON DELETE RESTRICT,
    version_number INT NOT NULL DEFAULT 1,
    question_type question_type NOT NULL DEFAULT 'single_mcq',
    difficulty difficulty_level NOT NULL DEFAULT 'medium',
    stem_en TEXT NOT NULL,
    stem_hi TEXT,
    options JSONB NOT NULL,
    correct_option TEXT NOT NULL,
    solution_en TEXT NOT NULL,
    solution_hi TEXT,
    norm_stem_en TEXT NOT NULL,
    norm_stem_hi TEXT,
    text_hash TEXT NOT NULL,
    masked_hash TEXT NOT NULL,
    image_file_hashes TEXT[] NOT NULL DEFAULT '{}',
    image_urls TEXT[] NOT NULL DEFAULT '{}',
    is_pyq BOOLEAN NOT NULL DEFAULT FALSE,
    pyq_year INT,
    pyq_shift TEXT,
    is_onboarding_sample BOOLEAN NOT NULL DEFAULT FALSE,
    ai_suggestion JSONB NOT NULL DEFAULT '{}',
    is_approved_in_corpus BOOLEAN NOT NULL DEFAULT FALSE,
    open_report_count INT NOT NULL DEFAULT 0,
    is_auto_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    total_attempts INT NOT NULL DEFAULT 0,
    correct_attempts INT NOT NULL DEFAULT 0,
    skip_attempts INT NOT NULL DEFAULT 0,
    avg_time_spent_seconds NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    pct_correct NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE WHEN total_attempts > 0 THEN ROUND((correct_attempts::NUMERIC / total_attempts) * 100, 2) ELSE 0 END
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (parent_question_id, version_number)
);
CREATE TRIGGER set_questions_updated_at BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX idx_questions_exam_text_hash ON public.questions (exam_id, text_hash);
CREATE INDEX idx_questions_exam_masked_hash ON public.questions (exam_id, masked_hash);
CREATE INDEX idx_questions_examiner_hash ON public.questions (examiner_id, text_hash);
CREATE INDEX idx_questions_image_hashes ON public.questions USING GIN (image_file_hashes);
CREATE INDEX idx_questions_trgm_stem_en ON public.questions USING GIN (norm_stem_en gin_trgm_ops);
CREATE INDEX idx_questions_trgm_stem_hi ON public.questions USING GIN (norm_stem_hi gin_trgm_ops);

CREATE TABLE public.ai_question_cache (
    text_hash TEXT PRIMARY KEY,
    model_version TEXT NOT NULL,
    ai_response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Examiners and QC access questions" ON public.questions
    FOR ALL USING (
        examiner_id = public.current_user_id()
        OR public.has_role('qc_reviewer')
        OR public.has_role('admin')
    );

-- Deviation (PRD p.4 "approved questions stay locked", "versioned, not edited"; AI rule):
-- * approved questions are immutable apart from statistics and report counters, and
--   cannot be deleted; corrections are new versions;
-- * under a user context, only QC reviewers and admins may approve a question or change
--   moderation state, and only system jobs (no user context) write AI suggestions or stats.
CREATE FUNCTION protect_question_integrity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_reviewer BOOLEAN := public.current_user_id() IS NULL
    OR public.has_role('qc_reviewer') OR public.has_role('admin');
  v_system BOOLEAN := public.current_user_id() IS NULL;
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
      OR NEW.is_auto_hidden IS DISTINCT FROM OLD.is_auto_hidden
      OR NEW.open_report_count IS DISTINCT FROM OLD.open_report_count) THEN
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
CREATE TRIGGER protect_question_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION protect_question_integrity();

-- 5. Catalogue: test series, tests, sections and items ------------------------------
CREATE TABLE public.test_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    stage_id UUID REFERENCES public.exam_stages(id) ON DELETE SET NULL,
    examiner_id UUID NOT NULL REFERENCES public.examiner_profiles(user_id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    syllabus_coverage TEXT,
    schedule_json JSONB DEFAULT '[]',
    total_planned_tests INT NOT NULL DEFAULT 1,
    published_tests_count INT NOT NULL DEFAULT 0,
    price_paise INT NOT NULL DEFAULT 0,
    validity_days INT NOT NULL DEFAULT 365,
    is_included_in_pass BOOLEAN NOT NULL DEFAULT TRUE,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0.00,
    rating_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_test_series_updated_at BEFORE UPDATE ON public.test_series
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE public.tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    stage_id UUID NOT NULL REFERENCES public.exam_stages(id) ON DELETE RESTRICT,
    template_id UUID NOT NULL REFERENCES public.exam_templates(id) ON DELETE RESTRICT,
    examiner_id UUID NOT NULL REFERENCES public.examiner_profiles(user_id) ON DELETE RESTRICT,
    series_id UUID REFERENCES public.test_series(id) ON DELETE SET NULL,
    parent_test_id UUID REFERENCES public.tests(id) ON DELETE SET NULL,
    version_number INT NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    test_type TEXT NOT NULL DEFAULT 'mock' CHECK (test_type IN ('mock', 'pyq', 'sectional', 'live')),
    status test_status_type NOT NULL DEFAULT 'draft',
    has_hindi BOOLEAN NOT NULL DEFAULT FALSE,
    access_type test_access_type NOT NULL DEFAULT 'paid',
    price_paise INT NOT NULL DEFAULT 0,
    is_included_in_pass BOOLEAN NOT NULL DEFAULT TRUE,
    is_admin_featured_free BOOLEAN NOT NULL DEFAULT FALSE,
    total_questions INT NOT NULL,
    total_duration_seconds INT NOT NULL,
    total_marks NUMERIC(6,2) NOT NULL,
    scheduled_publish_at TIMESTAMPTZ,
    live_window_start_at TIMESTAMPTZ,
    live_window_end_at TIMESTAMPTZ,
    ranks_published_at TIMESTAMPTZ,
    current_qc_flag_count INT NOT NULL DEFAULT 0,
    pyq_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    attempts_count INT NOT NULL DEFAULT 0,
    avg_score NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    topper_score NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0.00,
    rating_count INT NOT NULL DEFAULT 0,
    search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(title, ''))
    ) STORED,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_tests_updated_at BEFORE UPDATE ON public.tests
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX idx_tests_search_vector ON public.tests USING GIN (search_vector);
CREATE INDEX idx_tests_discover ON public.tests (exam_id, status, access_type, is_included_in_pass);

CREATE TABLE public.test_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    template_section_id UUID REFERENCES public.exam_template_sections(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    section_order INT NOT NULL,
    question_count INT NOT NULL,
    duration_seconds INT,
    positive_marks NUMERIC(5,2) NOT NULL,
    negative_marks NUMERIC(5,2) NOT NULL,
    UNIQUE (test_id, section_order)
);

CREATE TABLE public.test_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.test_sections(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    display_order INT NOT NULL,
    positive_marks NUMERIC(5,2) NOT NULL,
    negative_marks NUMERIC(5,2) NOT NULL,
    qc_status qc_action_type NOT NULL DEFAULT 'pending',
    is_locked_by_qc BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (test_id, display_order),
    UNIQUE (test_id, question_id)
);

ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public browse live tests" ON public.tests
    FOR SELECT USING (
        status IN ('scheduled', 'live')
        OR examiner_id = public.current_user_id()
        OR public.has_role('qc_reviewer')
        OR public.has_role('admin')
    );
-- Deviation (PRD p.4 "on approval, the test goes live"): examiners edit their own tests
-- only while draft or changes-requested and may move them to submitted; approval,
-- scheduling and publishing happen through reviewer/admin paths.
CREATE POLICY "Examiners manage own draft tests" ON public.tests
    FOR ALL
    USING (
        (examiner_id = public.current_user_id() AND status IN ('draft', 'changes_requested'))
        OR public.has_role('admin')
    )
    WITH CHECK (
        (examiner_id = public.current_user_id() AND status IN ('draft', 'submitted', 'changes_requested'))
        OR public.has_role('admin')
    );

-- Deviation (PRD p.4 "live tests are versioned, not edited"): once approved, a test's
-- content is frozen and its status only moves forward. Statistics, publication times and
-- the admin featured flag stay writable. Changes require a new version (parent_test_id).
CREATE FUNCTION protect_published_test() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved', 'scheduled', 'live', 'archived') THEN
      RAISE EXCEPTION 'Published tests cannot be deleted; archive them' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('approved', 'scheduled', 'live', 'archived') THEN
    IF (NEW.exam_id, NEW.stage_id, NEW.template_id, NEW.examiner_id, NEW.series_id, NEW.parent_test_id,
        NEW.version_number, NEW.title, NEW.slug, NEW.test_type, NEW.has_hindi, NEW.access_type,
        NEW.price_paise, NEW.is_included_in_pass, NEW.total_questions, NEW.total_duration_seconds,
        NEW.total_marks, NEW.live_window_start_at, NEW.live_window_end_at)
       IS DISTINCT FROM
       (OLD.exam_id, OLD.stage_id, OLD.template_id, OLD.examiner_id, OLD.series_id, OLD.parent_test_id,
        OLD.version_number, OLD.title, OLD.slug, OLD.test_type, OLD.has_hindi, OLD.access_type,
        OLD.price_paise, OLD.is_included_in_pass, OLD.total_questions, OLD.total_duration_seconds,
        OLD.total_marks, OLD.live_window_start_at, OLD.live_window_end_at) THEN
      RAISE EXCEPTION 'Published tests are versioned, not edited' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         (OLD.status = 'approved' AND NEW.status IN ('scheduled', 'live', 'archived'))
      OR (OLD.status = 'scheduled' AND NEW.status IN ('live', 'archived'))
      OR (OLD.status = 'live' AND NEW.status = 'archived')) THEN
      RAISE EXCEPTION 'Invalid status change from % to %', OLD.status, NEW.status USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_published_test BEFORE UPDATE OR DELETE ON public.tests
  FOR EACH ROW EXECUTE FUNCTION protect_published_test();

-- Sections and items of a published test are frozen too; items approved by QC stay locked
-- while an examiner revises the rest (PRD p.4). Only reviewers/admins set QC state.
CREATE FUNCTION protect_test_structure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_test_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.test_id ELSE NEW.test_id END;
  v_status test_status_type;
  v_reviewer BOOLEAN := public.current_user_id() IS NULL
    OR public.has_role('qc_reviewer') OR public.has_role('admin');
BEGIN
  SELECT status INTO v_status FROM public.tests WHERE id = v_test_id;
  IF v_status IN ('approved', 'scheduled', 'live', 'archived') THEN
    RAISE EXCEPTION 'Published tests are versioned, not edited' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_TABLE_NAME = 'test_questions' AND NOT v_reviewer THEN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.is_locked_by_qc AND (TG_OP = 'DELETE' OR
        (NEW.question_id, NEW.section_id, NEW.display_order, NEW.positive_marks, NEW.negative_marks)
        IS DISTINCT FROM (OLD.question_id, OLD.section_id, OLD.display_order, OLD.positive_marks, OLD.negative_marks)) THEN
      RAISE EXCEPTION 'Question approved by QC is locked during revisions' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'INSERT' AND (NEW.is_locked_by_qc OR NEW.qc_status <> 'pending') THEN
      RAISE EXCEPTION 'Only QC reviewers and admins set QC state' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.is_locked_by_qc, NEW.qc_status) IS DISTINCT FROM (OLD.is_locked_by_qc, OLD.qc_status) THEN
      RAISE EXCEPTION 'Only QC reviewers and admins set QC state' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER protect_test_sections BEFORE INSERT OR UPDATE OR DELETE ON public.test_sections
  FOR EACH ROW EXECUTE FUNCTION protect_test_structure();
CREATE TRIGGER protect_test_questions BEFORE INSERT OR UPDATE OR DELETE ON public.test_questions
  FOR EACH ROW EXECUTE FUNCTION protect_test_structure();

UPDATE bootstrap_state SET version = 3 WHERE id = 'schema';
