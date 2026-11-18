-- Schema v1.1 sections 1, 2 and the admin audit log from section 9.
-- Deviations from the owner-supplied schema are listed in docs/DATA_MODEL.md.

-- M0 storage primitives are replaced by the schema's identity and commerce tables.
DROP TABLE ledger_entries, billing_events, billing_orders, sessions, user_roles, roles, users, audit_events;
DROP FUNCTION reject_history_change();

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Enums -----------------------------------------------------------------------
CREATE TYPE user_role_type AS ENUM ('student', 'examiner', 'qc_reviewer', 'admin');
CREATE TYPE examiner_account_type AS ENUM ('individual', 'institute');
CREATE TYPE examiner_tier_type AS ENUM ('new', 'verified', 'top');
CREATE TYPE verification_status_type AS ENUM ('pending', 'approved', 'rejected', 'suspended', 'banned');
CREATE TYPE question_type AS ENUM ('single_mcq', 'comprehension_mcq', 'multi_mcq', 'numeric');
CREATE TYPE difficulty_level AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE test_status_type AS ENUM ('draft', 'submitted', 'in_qc', 'changes_requested', 'approved', 'scheduled', 'live', 'archived');
CREATE TYPE test_access_type AS ENUM ('free', 'paid', 'pass_included', 'series_only');
CREATE TYPE qc_action_type AS ENUM ('pending', 'approve', 'minor_edit', 'request_change', 'reject');
CREATE TYPE duplicate_match_type AS ENUM ('exact_hash', 'masked_hash', 'trigram_high', 'trigram_mid', 'image_hash', 'pyq_match', 'internal_test_dup');
CREATE TYPE item_purchase_type AS ENUM ('single_test', 'test_series', 'pass');
CREATE TYPE payment_status_type AS ENUM ('created', 'captured', 'failed', 'refunded');
CREATE TYPE palette_state_type AS ENUM ('not_visited', 'not_answered', 'answered', 'marked_for_review', 'answered_and_marked');
CREATE TYPE attempt_status_type AS ENUM ('in_progress', 'submitted', 'timed_out', 'abandoned');
CREATE TYPE report_reason_type AS ENUM ('wrong_answer', 'ambiguous', 'out_of_syllabus', 'duplicate', 'translation_error');
CREATE TYPE report_status_type AS ENUM ('open', 'examiner_responded', 'resolved_key_changed', 'resolved_no_change', 'dismissed');
CREATE TYPE payout_status_type AS ENUM ('calculated', 'on_hold', 'approved', 'paid');

CREATE FUNCTION trigger_set_timestamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

-- Deviation (PRD: Firebase Authentication). Replaces Supabase auth.uid(): the API sets the
-- verified profile id per transaction (withUser). NULL when no user context is set.
CREATE FUNCTION current_user_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

-- 2. Identity, roles, devices and profiles ----------------------------------------
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid TEXT NOT NULL UNIQUE,
    phone TEXT,
    email TEXT UNIQUE,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    roles user_role_type[] NOT NULL DEFAULT '{student}',
    is_ops_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_finance_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'hi')),
    preparation_stage TEXT,
    target_exam_ids UUID[] DEFAULT '{}',
    is_age_verified_18_plus BOOLEAN NOT NULL DEFAULT TRUE,
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE public.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_fingerprint TEXT NOT NULL,
    device_name TEXT,
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    expo_push_token TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, device_fingerprint)
);

-- Max 2 active devices per account (DECISIONS C4: a third device is rejected until the
-- student removes one). A per-user advisory lock serialises concurrent registrations; it does
-- not depend on row visibility, and SECURITY DEFINER makes the count see every device row.
CREATE FUNCTION enforce_active_device_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  active_others INT;
BEGIN
  IF NOT NEW.is_active THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('user_devices:' || NEW.user_id::text, 0));
  SELECT COUNT(*) INTO active_others FROM public.user_devices
   WHERE user_id = NEW.user_id AND is_active AND id <> NEW.id;
  IF active_others >= 2 THEN
    RAISE EXCEPTION 'Active device limit reached' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_active_device_limit BEFORE INSERT OR UPDATE OF is_active, user_id ON public.user_devices
  FOR EACH ROW EXECUTE FUNCTION enforce_active_device_limit();

CREATE TABLE public.examiner_profiles (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    account_type examiner_account_type NOT NULL DEFAULT 'individual',
    institute_name TEXT,
    bio TEXT,
    experience_years INT,
    social_links JSONB DEFAULT '{}',
    exam_ids UUID[] NOT NULL DEFAULT '{}',
    subject_ids UUID[] NOT NULL DEFAULT '{}',
    onboarding_status verification_status_type NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    tier examiner_tier_type NOT NULL DEFAULT 'new',
    pan_number TEXT,
    pan_doc_path TEXT,
    bank_account_name TEXT,
    bank_account_number TEXT,
    bank_ifsc TEXT,
    bank_proof_doc_path TEXT,
    upi_id TEXT,
    gstin TEXT,
    business_proof_doc_path TEXT,
    kyc_verified_at TIMESTAMPTZ,
    kyc_verified_by UUID REFERENCES public.profiles(id),
    agreement_version TEXT NOT NULL,
    agreement_accepted_at TIMESTAMPTZ NOT NULL,
    qc_pass_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    duplicate_reject_count INT NOT NULL DEFAULT 0,
    post_launch_key_corrections INT NOT NULL DEFAULT 0,
    avg_report_response_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    follower_count INT NOT NULL DEFAULT 0,
    first_payout_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_examiner_profiles_updated_at BEFORE UPDATE ON public.examiner_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE public.examiner_followers (
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    examiner_id UUID NOT NULL REFERENCES public.examiner_profiles(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (student_id, examiner_id)
);

-- 9. Admin audit log (PRD p.9: who, what, when, before/after on every admin action) ----
CREATE TABLE public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    action_name TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_record_id UUID NOT NULL,
    before_state JSONB,
    after_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_audit_target ON public.admin_audit_logs (target_table, target_record_id);

-- Deviation (PRD p.9, CLAUDE.md invariant 5): audit history is append-only.
CREATE FUNCTION reject_history_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER admin_audit_append_only BEFORE UPDATE OR DELETE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_history_change();
CREATE TRIGGER admin_audit_no_truncate BEFORE TRUNCATE ON public.admin_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_change();

-- 11. RLS helper and identity policies ---------------------------------------------
CREATE FUNCTION public.has_role(required_role user_role_type) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = public.current_user_id() AND required_role = ANY(roles) AND is_blocked = FALSE
  );
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examiner_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON public.profiles
    FOR ALL USING (public.current_user_id() = id OR public.has_role('admin'));

-- Deviation: the schema's profile policy would let a user grant themselves roles or admin
-- flags. Only admins (or system jobs without a user context) may change these columns.
CREATE FUNCTION protect_profile_privileges() RETURNS trigger
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
  RETURN NEW;
END $$;
CREATE TRIGGER protect_profile_privileges BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_privileges();

-- Deviation (Firebase sign-in): before a user context exists the API must find or create the
-- profile for a verified Firebase uid. New profiles are always plain students.
CREATE FUNCTION public.ensure_profile_for_firebase_user(p_firebase_uid TEXT, p_email TEXT, p_full_name TEXT)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_firebase_uid IS NULL OR length(p_firebase_uid) = 0 THEN
    RAISE EXCEPTION 'Firebase uid is required';
  END IF;
  INSERT INTO public.profiles (firebase_uid, email, full_name)
  VALUES (p_firebase_uid, p_email, COALESCE(NULLIF(p_full_name, ''), 'Student'))
  ON CONFLICT (firebase_uid) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.profiles WHERE firebase_uid = p_firebase_uid;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.ensure_profile_for_firebase_user(TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'exam_app') THEN
    GRANT EXECUTE ON FUNCTION public.ensure_profile_for_firebase_user(TEXT, TEXT, TEXT) TO exam_app;
  END IF;
END $$;

UPDATE bootstrap_state SET version = 2 WHERE id = 'schema';
