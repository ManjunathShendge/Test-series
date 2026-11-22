-- 18+ confirmation is recorded, not assumed (PRD 12 "gate the platform to 18+", requirement
-- M6 "onboarding with 18+ confirmation"). The schema defaulted is_age_verified_18_plus to
-- TRUE, so every profile looked confirmed whether or not the person had confirmed.
--
-- * New profiles start unconfirmed; the API sets the flag and the time when the person
--   confirms (sign-in checkbox in the app, onboarding on the website).
-- * Existing profiles were created through POST /identity/session, which required the 18+
--   confirmation on every sign-in, so they keep TRUE with their creation time as evidence.
-- * A user cannot withdraw or rewrite their own confirmation; admins and system jobs can.

ALTER TABLE public.profiles ALTER COLUMN is_age_verified_18_plus SET DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN age_confirmed_at TIMESTAMPTZ;
UPDATE public.profiles SET age_confirmed_at = created_at WHERE is_age_verified_18_plus AND age_confirmed_at IS NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_age_confirmation_recorded
  CHECK (NOT is_age_verified_18_plus OR age_confirmed_at IS NOT NULL);

CREATE OR REPLACE FUNCTION protect_profile_privileges() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF public.current_user_id() IS NOT NULL AND NOT public.has_role('admin') AND (
       NEW.roles IS DISTINCT FROM OLD.roles OR NEW.is_ops_admin IS DISTINCT FROM OLD.is_ops_admin
    OR NEW.is_finance_admin IS DISTINCT FROM OLD.is_finance_admin
    OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
    OR NEW.is_blocked IS DISTINCT FROM OLD.is_blocked OR NEW.firebase_uid IS DISTINCT FROM OLD.firebase_uid) THEN
    RAISE EXCEPTION 'Only admins can change roles, admin flags or account status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF public.current_user_id() IS NOT NULL AND NOT public.has_role('admin') AND OLD.is_age_verified_18_plus AND (
       NOT NEW.is_age_verified_18_plus OR NEW.age_confirmed_at IS DISTINCT FROM OLD.age_confirmed_at) THEN
    RAISE EXCEPTION 'An 18+ confirmation cannot be withdrawn or changed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

UPDATE bootstrap_state SET version = 7 WHERE id = 'schema';
