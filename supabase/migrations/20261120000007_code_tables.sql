-- Versioned Code Tables for deterministic plumbing calculators (zero hardcoded values)

CREATE TABLE IF NOT EXISTS public.code_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_family text NOT NULL CHECK (code_family IN ('IPC', 'UPC')),
  edition text NOT NULL CHECK (char_length(trim(edition)) > 0),
  table_key text NOT NULL CHECK (
    table_key IN (
      'dfu_fixtures',
      'drain_sizing',
      'vent_sizing',
      'wsfu_supply',
      'gas_pipe_sizing'
    )
  ),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  title text NOT NULL CHECK (char_length(trim(title)) > 0),
  code_ref text NOT NULL CHECK (char_length(trim(code_ref)) > 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code_family, edition, table_key)
);

CREATE INDEX IF NOT EXISTS idx_code_tables_family_edition_key
  ON public.code_tables (code_family, edition, table_key);

CREATE TRIGGER trg_code_tables_updated_at
  BEFORE UPDATE ON public.code_tables
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.code_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_tables FORCE ROW LEVEL SECURITY;

GRANT SELECT ON public.code_tables TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.code_tables TO authenticated;

CREATE POLICY code_tables_select_verified_or_staff
  ON public.code_tables FOR SELECT
  TO anon, authenticated
  USING (verified_at IS NOT NULL OR public.is_reviewer_or_admin());

CREATE POLICY code_tables_insert_admin
  ON public.code_tables FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY code_tables_update_admin
  ON public.code_tables FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY code_tables_delete_admin
  ON public.code_tables FOR DELETE
  TO authenticated
  USING (public.is_admin());
