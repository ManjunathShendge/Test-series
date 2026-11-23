-- M3 private assets, draft question authoring and XLSX/ZIP import manifests.

CREATE TYPE public.asset_scan_status_type AS ENUM ('pending', 'scanning', 'clean', 'rejected');
CREATE TYPE public.asset_classification_type AS ENUM ('public_media', 'question_asset', 'examiner_kyc', 'import_archive');
CREATE TYPE public.asset_access_scope_type AS ENUM ('public', 'examiner', 'staff', 'student_attempt');
CREATE TYPE public.import_status_type AS ENUM ('previewing', 'accepted', 'rejected', 'committed');

CREATE TABLE public.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    bucket TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT CHECK (size_bytes >= 0),
    sha256 TEXT,
    scan_status public.asset_scan_status_type NOT NULL DEFAULT 'pending',
    classification public.asset_classification_type NOT NULL,
    access_scope public.asset_access_scope_type NOT NULL,
    uploaded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.import_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    stage_id UUID NOT NULL REFERENCES public.exam_stages(id) ON DELETE RESTRICT,
    file_hash TEXT NOT NULL,
    manifest_hash TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    status public.import_status_type NOT NULL DEFAULT 'previewing',
    parsed_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    committed_question_ids UUID[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, idempotency_key)
);

CREATE TABLE public.import_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id UUID NOT NULL REFERENCES public.import_runs(id) ON DELETE CASCADE,
    row_number INT NOT NULL,
    cell_name TEXT,
    data JSONB NOT NULL DEFAULT '{}',
    errors JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_id, row_number)
);

CREATE TRIGGER set_import_runs_updated_at BEFORE UPDATE ON public.import_runs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Asset owner or staff access" ON public.assets FOR ALL
  USING (owner_id = public.current_user_id() OR public.has_role('admin') OR public.has_role('qc_reviewer'));

CREATE POLICY "Import owner or staff access" ON public.import_runs FOR ALL
  USING (owner_id = public.current_user_id() OR public.has_role('admin') OR public.has_role('qc_reviewer'));

CREATE POLICY "Import rows follow import ownership" ON public.import_rows FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.import_runs r
      WHERE r.id = import_rows.import_id
        AND (r.owner_id = public.current_user_id() OR public.has_role('admin') OR public.has_role('qc_reviewer'))
    )
  );

CREATE TRIGGER audit_assets AFTER INSERT OR UPDATE OR DELETE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION audit_privileged_change();
CREATE TRIGGER audit_import_runs AFTER INSERT OR UPDATE OR DELETE ON public.import_runs
  FOR EACH ROW EXECUTE FUNCTION audit_privileged_change();
CREATE TRIGGER audit_import_rows AFTER INSERT OR UPDATE OR DELETE ON public.import_rows
  FOR EACH ROW EXECUTE FUNCTION audit_privileged_change();

UPDATE public.bootstrap_state SET version = 10 WHERE id = 'schema';
