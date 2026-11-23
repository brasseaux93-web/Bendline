-- Server-only AI explanation cache & attempts.error_type tracking

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS error_type text CHECK (
    error_type IS NULL
    OR error_type IN (
      'concept',
      'lookup',
      'arithmetic',
      'misread',
      'edition_confusion',
      'unit'
    )
  );

CREATE INDEX IF NOT EXISTS idx_attempts_user_error_type
  ON public.attempts (user_id, error_type)
  WHERE error_type IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_explanation_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_key text NOT NULL CHECK (char_length(trim(answer_key)) > 0),
  code_family text NOT NULL CHECK (code_family IN ('IPC', 'UPC')),
  edition text NOT NULL CHECK (char_length(trim(edition)) > 0),
  prompt_version text NOT NULL CHECK (char_length(trim(prompt_version)) > 0),
  model_used text NOT NULL CHECK (char_length(trim(model_used)) > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, answer_key, code_family, edition, prompt_version)
);

CREATE INDEX IF NOT EXISTS idx_ai_explanation_cache_lookup
  ON public.ai_explanation_cache (question_id, answer_key, code_family, edition, prompt_version);

ALTER TABLE public.ai_explanation_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_explanation_cache FORCE ROW LEVEL SECURITY;

GRANT SELECT ON public.ai_explanation_cache TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_explanation_cache TO authenticated;

CREATE POLICY ai_explanation_cache_select_servable_or_admin
  ON public.ai_explanation_cache FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.questions q
      WHERE q.id = ai_explanation_cache.question_id
        AND q.status = 'published'
        AND public.has_approved_current_review(q.id, q.version)
    )
    OR public.is_admin()
  );

CREATE POLICY ai_explanation_cache_insert_admin
  ON public.ai_explanation_cache FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY ai_explanation_cache_update_admin
  ON public.ai_explanation_cache FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY ai_explanation_cache_delete_admin
  ON public.ai_explanation_cache FOR DELETE
  TO authenticated
  USING (public.is_admin());
