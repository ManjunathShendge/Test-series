-- M2 admin catalogue (PRD 3 "Admins own the top three levels and templates", PRD 8 "Exams and
-- templates"). Deviations from schema v1.1, listed in docs/DATA_MODEL.md:
--
-- * Templates have a lifecycle. A draft (published_at IS NULL) is edited freely. Publishing
--   freezes it (invariant 2: published versions are immutable): only is_active may change
--   (retire / reinstate). A change is a new version that names the template it supersedes.
--   Templates that existed before this migration are already used by tests, so they count
--   as published.
-- * Tests may only be created from a published, active template of the same exam and stage.
-- * The exam hierarchy, syllabus tree and templates are written by admins or system jobs
--   only. Every such change is audited by audit_privileged_change (migration 005).

ALTER TABLE public.exam_templates
  ADD COLUMN version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  ADD COLUMN published_at TIMESTAMPTZ,
  ADD COLUMN supersedes_template_id UUID REFERENCES public.exam_templates(id) ON DELETE RESTRICT,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.exam_templates SET published_at = created_at;
CREATE TRIGGER set_exam_templates_updated_at BEFORE UPDATE ON public.exam_templates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE INDEX idx_exam_templates_exam ON public.exam_templates (exam_id, stage_id);

-- Hierarchy rows belong together: a template's stage is a stage of its exam, and a section's
-- subject is a subject of that exam.
CREATE FUNCTION check_template_consistency() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_TABLE_NAME = 'exam_templates' THEN
    IF NOT EXISTS (SELECT 1 FROM public.exam_stages WHERE id = NEW.stage_id AND exam_id = NEW.exam_id) THEN
      RAISE EXCEPTION 'Template stage must belong to the template''s exam' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.subject_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.exam_templates t JOIN public.subjects s ON s.exam_id = t.exam_id
       WHERE t.id = NEW.template_id AND s.id = NEW.subject_id) THEN
    RAISE EXCEPTION 'Section subject must belong to the template''s exam' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER exam_templates_consistent BEFORE INSERT OR UPDATE OF exam_id, stage_id ON public.exam_templates
  FOR EACH ROW EXECUTE FUNCTION check_template_consistency();
CREATE TRIGGER exam_template_sections_consistent BEFORE INSERT OR UPDATE OF template_id, subject_id ON public.exam_template_sections
  FOR EACH ROW EXECUTE FUNCTION check_template_consistency();

-- A published template and its sections are frozen; only availability can change.
CREATE FUNCTION protect_published_template() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_published BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'exam_templates' THEN
    IF OLD.published_at IS NULL THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'is_active' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'is_active' - 'updated_at') THEN
      RAISE EXCEPTION 'A published template cannot be changed; publish a new version'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
  END IF;
  SELECT published_at IS NOT NULL INTO v_published FROM public.exam_templates
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.template_id ELSE NEW.template_id END;
  IF v_published OR (TG_OP = 'UPDATE' AND OLD.template_id IS DISTINCT FROM NEW.template_id AND EXISTS (
       SELECT 1 FROM public.exam_templates WHERE id = OLD.template_id AND published_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Sections of a published template cannot be changed; publish a new version'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER exam_templates_frozen_when_published BEFORE UPDATE OR DELETE ON public.exam_templates
  FOR EACH ROW EXECUTE FUNCTION protect_published_template();
CREATE TRIGGER exam_template_sections_frozen_when_published BEFORE INSERT OR UPDATE OR DELETE ON public.exam_template_sections
  FOR EACH ROW EXECUTE FUNCTION protect_published_template();

-- New tests use a published, available template of their own exam and stage. Existing tests
-- keep their template when it is later retired.
CREATE FUNCTION check_test_template() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exam_templates
                  WHERE id = NEW.template_id AND exam_id = NEW.exam_id AND stage_id = NEW.stage_id
                    AND published_at IS NOT NULL AND is_active) THEN
    RAISE EXCEPTION 'Tests must use a published, available template of the same exam and stage'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tests_use_published_template BEFORE INSERT OR UPDATE OF template_id, exam_id, stage_id ON public.tests
  FOR EACH ROW EXECUTE FUNCTION check_test_template();

-- Only admins (or system jobs, which run without a user context) write the hierarchy.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['exam_categories', 'exams', 'exam_stages', 'subjects', 'topics', 'exam_templates', 'exam_template_sections']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION require_admin_or_system()', t || '_admin_managed', t);
  END LOOP;
END $$;

UPDATE bootstrap_state SET version = 8 WHERE id = 'schema';
