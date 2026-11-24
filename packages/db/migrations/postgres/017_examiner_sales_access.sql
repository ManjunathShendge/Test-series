-- Examiner dashboard (PRD 4.4): an examiner reads the purchases of their own tests and series
-- (the API returns aggregates only, never student identities), and the TDS certificate that
-- finance attached to their own payout.

CREATE POLICY "Examiners view sales of their items" ON public.purchases
    FOR SELECT USING (examiner_id = public.current_user_id());

CREATE FUNCTION public.payout_document(p_payout UUID)
RETURNS TABLE (bucket TEXT, object_key TEXT, original_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN QUERY
  SELECT a.bucket, a.object_key, a.original_name
    FROM public.examiner_payouts p
    JOIN public.assets a ON a.id = p.tds_certificate_asset_id
   WHERE p.id = p_payout AND a.scan_status = 'clean' AND a.uploaded_at IS NOT NULL
     AND (p.examiner_id = public.current_user_id() OR public.has_role('admin'));
END $$;

REVOKE ALL ON FUNCTION public.payout_document(uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'exam_app') THEN
    GRANT EXECUTE ON FUNCTION public.payout_document(uuid) TO exam_app, exam_worker;
  END IF;
END $$;

UPDATE public.bootstrap_state SET version = 17 WHERE id = 'schema';
