-- Permit an applicant to replace samples after a rejected application is resubmitted.

CREATE OR REPLACE FUNCTION public.protect_examiner_sample_review() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_status public.examiner_application_status_type;
BEGIN
  SELECT status INTO v_status FROM public.examiner_applications WHERE id = OLD.application_id;
  IF v_status IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Reviewed examiner samples are immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

UPDATE public.bootstrap_state SET version = 12 WHERE id = 'schema';
