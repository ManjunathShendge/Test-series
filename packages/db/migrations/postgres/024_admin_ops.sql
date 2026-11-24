-- C4 admin operations (PRD 8): CMS banners for web and app, and a closed audit log.

-- 1. Banners: placement and an optional schedule window. Visitors read only what is showing
-- now; admins manage everything (replaces the allow-all app policy).
ALTER TABLE public.cms_banners
  ADD COLUMN placement TEXT NOT NULL DEFAULT 'both' CHECK (placement IN ('web', 'app', 'both')),
  ADD COLUMN starts_at TIMESTAMPTZ,
  ADD COLUMN ends_at TIMESTAMPTZ,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD CONSTRAINT cms_banners_window CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at),
  ADD CONSTRAINT cms_banners_https_image CHECK (image_url LIKE 'https://%'),
  ADD CONSTRAINT cms_banners_safe_link CHECK (
    target_link LIKE 'https://%' OR (target_link LIKE '/%' AND target_link NOT LIKE '//%' AND position('\' IN target_link) = 0));
CREATE TRIGGER set_cms_banners_updated_at BEFORE UPDATE ON public.cms_banners
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE INDEX cms_banners_showing ON public.cms_banners (display_order) WHERE is_active;

CREATE POLICY "Visitors read banners on show" ON public.cms_banners
  FOR SELECT USING (
    (is_active AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at > NOW()))
    OR public.has_role('admin'));
CREATE POLICY "Admins manage banners" ON public.cms_banners
  FOR ALL USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- 2. Audit log: admins read it; staff code may only append entries in their own name (the
-- audit trigger writes as its definer). Append-only triggers already forbid edits.
CREATE POLICY "Admins read the audit log" ON public.admin_audit_logs
  FOR SELECT USING (public.has_role('admin'));
CREATE POLICY "Staff append own audit entries" ON public.admin_audit_logs
  FOR INSERT WITH CHECK (admin_id = public.current_user_id());
CREATE INDEX admin_audit_logs_recent ON public.admin_audit_logs (created_at DESC, id DESC);

UPDATE public.bootstrap_state SET version = 24 WHERE id = 'schema';
