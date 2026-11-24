-- The worker (exam_worker) finalizes due account deletions; it runs outside any user context,
-- where the profile privilege guard allows the anonymizing update.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'exam_worker') THEN
    GRANT EXECUTE ON FUNCTION public.finalize_account_deletions(INTERVAL) TO exam_worker;
  END IF;
END $$;

UPDATE public.bootstrap_state SET version = 23 WHERE id = 'schema';
