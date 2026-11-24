-- C6 hardening: per-row rules for two tables the API reached through the allow-all app policy.
-- The migration runner drops exam_app_access once a table has its own policies; the worker keeps
-- exam_worker_access. Supabase's Data API roles have no table access either way.

-- Devices: each user sees and changes only their own; admins may read for support.
CREATE POLICY "Users manage own devices" ON public.user_devices
  FOR ALL USING (user_id = public.current_user_id()) WITH CHECK (user_id = public.current_user_id());
CREATE POLICY "Admins read devices" ON public.user_devices
  FOR SELECT USING (public.has_role('admin'));

-- Series: published ones are public; examiners see and edit their own; reviewers and admins see
-- all; a student keeps seeing a series they bought or were granted after it is unpublished
-- (purchase history, invoices, entitled tests).
CREATE POLICY "Read published, own, staff or owned series" ON public.test_series
  FOR SELECT USING (
    is_published
    OR examiner_id = public.current_user_id()
    OR public.has_role('qc_reviewer') OR public.has_role('admin')
    OR EXISTS (SELECT 1 FROM public.purchases p WHERE p.series_id = test_series.id AND p.student_id = public.current_user_id())
    OR EXISTS (SELECT 1 FROM public.student_entitlements e WHERE e.series_id = test_series.id AND e.student_id = public.current_user_id())
  );
CREATE POLICY "Examiners create own series" ON public.test_series
  FOR INSERT WITH CHECK (examiner_id = public.current_user_id() OR public.has_role('admin'));
CREATE POLICY "Examiners and admins update series" ON public.test_series
  FOR UPDATE USING (examiner_id = public.current_user_id() OR public.has_role('admin'))
  WITH CHECK (examiner_id = public.current_user_id() OR public.has_role('admin'));
CREATE POLICY "Examiners delete own unpublished series" ON public.test_series
  FOR DELETE USING ((examiner_id = public.current_user_id() AND NOT is_published) OR public.has_role('admin'));

UPDATE public.bootstrap_state SET version = 26 WHERE id = 'schema';
