-- Public catalogue reads (API_CONTRACTS "GET /exams, /tests, /series/:id, /examiners/:id").
-- Examiner display names live in profiles, which the API role may read only for the signed-in
-- user. This function exposes a positive allowlist of public fields for approved examiners:
-- never email, phone, roles, KYC, bank or payout details.
CREATE FUNCTION public.public_examiner_cards(p_ids UUID[])
RETURNS TABLE (
    examiner_id UUID,
    full_name TEXT,
    avatar_url TEXT,
    tier examiner_tier_type,
    account_type examiner_account_type,
    institute_name TEXT,
    bio TEXT,
    experience_years INT,
    follower_count INT,
    exam_ids UUID[]
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
  SELECT e.user_id, p.full_name, p.avatar_url, e.tier, e.account_type, e.institute_name, e.bio,
         e.experience_years, e.follower_count, e.exam_ids
    FROM public.examiner_profiles e
    JOIN public.profiles p ON p.id = e.user_id
   WHERE e.user_id = ANY(p_ids)
     AND e.onboarding_status = 'approved'
     AND NOT p.is_blocked
     AND p.deleted_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.public_examiner_cards(UUID[]) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'exam_app') THEN
    GRANT EXECUTE ON FUNCTION public.public_examiner_cards(UUID[]) TO exam_app;
  END IF;
END $$;

UPDATE bootstrap_state SET version = 6 WHERE id = 'schema';
