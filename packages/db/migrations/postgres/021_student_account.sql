-- C2 student account: follows, account deletion requests and their finalizer.

-- 1. Follows: a student sees and changes only their own rows (the runner drops the
-- allow-all policy once a table has its own). The public follower count is kept by a
-- trigger so students never need to read other students' follow rows.
CREATE POLICY "Students manage own follows" ON public.examiner_followers
  FOR ALL USING (student_id = current_user_id()) WITH CHECK (student_id = current_user_id());

CREATE FUNCTION public.sync_follower_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.examiner_profiles SET follower_count = follower_count + 1 WHERE user_id = NEW.examiner_id;
  ELSE
    UPDATE public.examiner_profiles SET follower_count = GREATEST(follower_count - 1, 0) WHERE user_id = OLD.examiner_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER examiner_followers_count AFTER INSERT OR DELETE ON public.examiner_followers
  FOR EACH ROW EXECUTE FUNCTION public.sync_follower_count();

UPDATE public.examiner_profiles e
   SET follower_count = (SELECT COUNT(*) FROM public.examiner_followers f WHERE f.examiner_id = e.user_id);

-- 2. Account deletion (docs/SECURITY.md "Privacy and deletion workflow"). A request starts a
-- grace period the student can cancel; the worker then finalizes it.
ALTER TABLE public.profiles ADD COLUMN deletion_requested_at TIMESTAMPTZ;
CREATE INDEX profiles_deletion_due ON public.profiles (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL AND deleted_at IS NULL;

-- Finalizes requests older than the grace period. Personal data is removed or anonymized;
-- attempts stay (anonymous) so ranks and cohorts do not shift, and purchases, ledger and
-- audit rows stay under their retention obligations. Returns the Firebase uids so the
-- worker can delete the sign-in identities (a retryable job). Idempotent.
CREATE FUNCTION public.finalize_account_deletions(p_grace INTERVAL)
RETURNS TABLE (profile_id UUID, firebase_uid TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.id, p.firebase_uid FROM public.profiles p
     WHERE p.deletion_requested_at IS NOT NULL AND p.deleted_at IS NULL
       AND p.deletion_requested_at <= NOW() - p_grace
     FOR UPDATE SKIP LOCKED
  LOOP
    DELETE FROM public.user_devices WHERE user_id = r.id;
    DELETE FROM public.examiner_followers WHERE student_id = r.id;
    DELETE FROM public.student_saved_questions WHERE student_id = r.id;
    UPDATE public.profiles
       SET full_name = 'Deleted user', email = NULL, phone = NULL, avatar_url = NULL,
           firebase_uid = 'deleted:' || r.id::text, target_exam_ids = '{}',
           preparation_stage = NULL, deleted_at = NOW()
     WHERE id = r.id;
    profile_id := r.id;
    firebase_uid := r.firebase_uid;
    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.finalize_account_deletions(INTERVAL) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'exam_app') THEN
    GRANT EXECUTE ON FUNCTION public.finalize_account_deletions(INTERVAL) TO exam_app;
  END IF;
END $$;

UPDATE public.bootstrap_state SET version = 21 WHERE id = 'schema';
