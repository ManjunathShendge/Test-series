-- M3 examiner onboarding: application samples, KYC and agreement state.

CREATE TYPE public.examiner_application_status_type AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.examiner_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    examiner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    account_type public.examiner_account_type NOT NULL DEFAULT 'individual',
    institute_name TEXT,
    bio TEXT,
    experience_years INT CHECK (experience_years IS NULL OR experience_years >= 0),
    social_links JSONB NOT NULL DEFAULT '{}',
    exam_ids UUID[] NOT NULL DEFAULT '{}',
    subject_ids UUID[] NOT NULL DEFAULT '{}',
    photo_asset_id UUID,
    pan_doc_asset_id UUID,
    bank_proof_asset_id UUID,
    business_proof_asset_id UUID,
    agreement_version TEXT,
    agreement_accepted_at TIMESTAMPTZ,
    status public.examiner_application_status_type NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES public.profiles(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (examiner_id)
);

CREATE TRIGGER set_examiner_applications_updated_at BEFORE UPDATE ON public.examiner_applications
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE public.examiner_sample_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES public.examiner_applications(id) ON DELETE CASCADE,
    position INT NOT NULL CHECK (position BETWEEN 1 AND 10),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
    stem_en TEXT NOT NULL,
    stem_hi TEXT,
    options JSONB NOT NULL,
    correct_option TEXT NOT NULL,
    solution_en TEXT NOT NULL,
    solution_hi TEXT,
    difficulty public.difficulty_level NOT NULL DEFAULT 'medium',
    image_asset_ids UUID[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (application_id, position)
);

CREATE TRIGGER set_examiner_sample_submissions_updated_at BEFORE UPDATE ON public.examiner_sample_submissions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE public.examiner_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examiner_sample_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Examiner applications belong to their owner or admin"
  ON public.examiner_applications FOR ALL
  USING (
    public.current_user_id() = examiner_id
    OR public.has_role('admin')
  );

CREATE POLICY "Examiner samples belong to their owner or admin"
  ON public.examiner_sample_submissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.examiner_applications a
      WHERE a.id = examiner_sample_submissions.application_id
        AND (a.examiner_id = public.current_user_id() OR public.has_role('admin'))
    )
  );

CREATE FUNCTION public.protect_examiner_sample_review() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_status public.examiner_application_status_type;
BEGIN
  SELECT status INTO v_status FROM public.examiner_applications WHERE id = OLD.application_id;
  IF v_status IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Reviewed examiner samples are immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER protect_examiner_sample_review BEFORE UPDATE OR DELETE ON public.examiner_sample_submissions
  FOR EACH ROW EXECUTE FUNCTION protect_examiner_sample_review();

CREATE FUNCTION public.protect_examiner_application_authority() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF public.current_user_id() IS NOT NULL
     AND NOT public.has_role('admin')
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     ) THEN
    RAISE EXCEPTION 'Only admins may approve or reject examiner applications'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER protect_examiner_application_authority BEFORE UPDATE ON public.examiner_applications
  FOR EACH ROW EXECUTE FUNCTION protect_examiner_application_authority();

CREATE TRIGGER audit_examiner_application AFTER INSERT OR UPDATE OR DELETE ON public.examiner_applications
  FOR EACH ROW EXECUTE FUNCTION audit_privileged_change();
CREATE TRIGGER audit_examiner_samples AFTER INSERT OR UPDATE OR DELETE ON public.examiner_sample_submissions
  FOR EACH ROW EXECUTE FUNCTION audit_privileged_change();

UPDATE public.bootstrap_state SET version = 9 WHERE id = 'schema';
