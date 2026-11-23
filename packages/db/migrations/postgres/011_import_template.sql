-- Bind every import preview to the exact published template it was validated against.

ALTER TABLE public.import_runs
  ADD COLUMN template_id UUID REFERENCES public.exam_templates(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.protect_examiner_application_authority() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF public.current_user_id() IS NOT NULL
     AND NOT public.has_role('admin')
     AND (
       NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR (
         NEW.status IS DISTINCT FROM OLD.status
         AND NOT (
           OLD.status = 'rejected'
           AND NEW.status = 'pending'
           AND NEW.examiner_id = public.current_user_id()
         )
       )
     ) THEN
    RAISE EXCEPTION 'Only the applicant may resubmit a rejected application; only admins may approve or reject'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

UPDATE public.bootstrap_state SET version = 11 WHERE id = 'schema';
