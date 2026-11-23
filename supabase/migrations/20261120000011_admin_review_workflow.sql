-- Admin Review Studio Workflow Migration
-- Adds draft/revise/archived statuses, 8-criteria hard-gate enforcement,
-- calc_independently_verified gate, drawing_exercise_reviews table,
-- automatic approval invalidation on version increments, and admin role management RPC.

-- ---------------------------------------------------------------------------
-- 1. Extend questions & drawing_exercises statuses + drawing_exercises.version
-- ---------------------------------------------------------------------------

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_status_check;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_status_check
  CHECK (status IN ('draft', 'revise', 'reviewed', 'published', 'flagged', 'archived'));

ALTER TABLE public.drawing_exercises
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version >= 1);

ALTER TABLE public.drawing_exercises
  DROP CONSTRAINT IF EXISTS drawing_exercises_status_check;

ALTER TABLE public.drawing_exercises
  ADD CONSTRAINT drawing_exercises_status_check
  CHECK (status IN ('draft', 'revise', 'reviewed', 'published', 'flagged', 'archived'));

-- ---------------------------------------------------------------------------
-- 2. Extend question_reviews with calc_independently_verified + hard-gate check
-- ---------------------------------------------------------------------------

ALTER TABLE public.question_reviews
  ADD COLUMN IF NOT EXISTS calc_independently_verified boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.validate_question_review_gates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_q_type text;
  v_key_acc integer;
  v_distractors integer;
  v_edition_fit integer;
BEGIN
  IF NEW.verdict = 'approved' THEN
    IF jsonb_typeof(NEW.scores) = 'object' THEN
      v_key_acc := coalesce((NEW.scores ->> 'key_accuracy')::integer, 0);
      v_distractors := coalesce((NEW.scores ->> 'distractors')::integer, 0);
      v_edition_fit := coalesce((NEW.scores ->> 'edition_fit')::integer, 0);

      IF v_key_acc < 4 OR v_distractors < 4 OR v_edition_fit < 4 THEN
        RAISE EXCEPTION 'HARD_GATE_FAILED: key_accuracy, distractors, and edition_fit must all be >= 4 to approve'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    SELECT q.type INTO v_q_type
    FROM public.questions q
    WHERE q.id = NEW.question_id;

    IF v_q_type = 'calc' AND NEW.calc_independently_verified IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'HARD_GATE_FAILED: calc questions require calc_independently_verified = true to approve'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_question_reviews_hard_gates ON public.question_reviews;
CREATE TRIGGER trg_question_reviews_hard_gates
  BEFORE INSERT OR UPDATE ON public.question_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_question_review_gates();

-- ---------------------------------------------------------------------------
-- 3. New question version invalidates prior approval automatically
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invalidate_question_approval_on_new_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version > OLD.version THEN
    INSERT INTO public.question_versions (
      question_id,
      version,
      stem,
      type,
      options,
      correct_index,
      topic_id,
      difficulty,
      code_family,
      edition,
      code_ref,
      explanation_seed,
      change_note,
      created_by
    )
    VALUES (
      OLD.id,
      OLD.version,
      OLD.stem,
      OLD.type,
      OLD.options,
      OLD.correct_index,
      OLD.topic_id,
      OLD.difficulty,
      OLD.code_family,
      OLD.edition,
      OLD.code_ref,
      OLD.explanation_seed,
      'Archived prior version before v' || NEW.version,
      auth.uid()
    )
    ON CONFLICT (question_id, version) DO NOTHING;

    NEW.status := 'draft';
    NEW.reviewer_id := NULL;
    NEW.reviewed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_questions_invalidate_approval ON public.questions;
CREATE TRIGGER trg_questions_invalidate_approval
  BEFORE UPDATE ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_question_approval_on_new_version();

-- ---------------------------------------------------------------------------
-- 4. drawing_exercise_reviews (identical 8-criteria + hard-gate workflow)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.drawing_exercise_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES public.drawing_exercises(id) ON DELETE CASCADE,
  exercise_version integer NOT NULL DEFAULT 1 CHECK (exercise_version >= 1),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  license_no text NOT NULL CHECK (char_length(trim(license_no)) > 0),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  scores jsonb NOT NULL CHECK (public.is_valid_review_scores(scores)),
  calc_independently_verified boolean NOT NULL DEFAULT false,
  verdict text NOT NULL CHECK (verdict IN ('approved', 'needs_revision', 'rejected')),
  comments text,
  suggested_fix text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drawing_exercise_reviews_version
  ON public.drawing_exercise_reviews (exercise_id, exercise_version, verdict);

ALTER TABLE public.drawing_exercise_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_exercise_reviews FORCE ROW LEVEL SECURITY;

GRANT SELECT ON public.drawing_exercise_reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.drawing_exercise_reviews TO authenticated;

CREATE POLICY drawing_exercise_reviews_select_approved_or_staff
  ON public.drawing_exercise_reviews FOR SELECT
  TO anon, authenticated
  USING (verdict = 'approved' OR public.is_reviewer_or_admin());

CREATE POLICY drawing_exercise_reviews_insert_staff
  ON public.drawing_exercise_reviews FOR INSERT
  TO authenticated
  WITH CHECK (public.is_reviewer_or_admin() AND reviewer_id = auth.uid());

CREATE POLICY drawing_exercise_reviews_update_owner_or_admin
  ON public.drawing_exercise_reviews FOR UPDATE
  TO authenticated
  USING ((public.is_reviewer_or_admin() AND reviewer_id = auth.uid()) OR public.is_admin())
  WITH CHECK ((public.is_reviewer_or_admin() AND reviewer_id = auth.uid()) OR public.is_admin());

CREATE POLICY drawing_exercise_reviews_delete_admin
  ON public.drawing_exercise_reviews FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.validate_drawing_review_gates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_key_acc integer;
  v_distractors integer;
  v_edition_fit integer;
BEGIN
  IF NEW.verdict = 'approved' AND jsonb_typeof(NEW.scores) = 'object' THEN
    v_key_acc := coalesce((NEW.scores ->> 'key_accuracy')::integer, 0);
    v_distractors := coalesce((NEW.scores ->> 'distractors')::integer, 0);
    v_edition_fit := coalesce((NEW.scores ->> 'edition_fit')::integer, 0);

    IF v_key_acc < 4 OR v_distractors < 4 OR v_edition_fit < 4 THEN
      RAISE EXCEPTION 'HARD_GATE_FAILED: key_accuracy, distractors, and edition_fit must all be >= 4 to approve'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drawing_reviews_hard_gates ON public.drawing_exercise_reviews;
CREATE TRIGGER trg_drawing_reviews_hard_gates
  BEFORE INSERT OR UPDATE ON public.drawing_exercise_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_drawing_review_gates();

CREATE OR REPLACE FUNCTION public.invalidate_drawing_approval_on_new_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version > OLD.version THEN
    NEW.status := 'draft';
    NEW.reviewer_id := NULL;
    NEW.reviewed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drawing_exercises_invalidate_approval ON public.drawing_exercises;
CREATE TRIGGER trg_drawing_exercises_invalidate_approval
  BEFORE UPDATE ON public.drawing_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_drawing_approval_on_new_version();

-- ---------------------------------------------------------------------------
-- 5. Admin-only reviewer role management RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_target_user_id uuid,
  p_role text,
  p_license_no text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.profiles;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('user', 'reviewer', 'admin') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET
    role = p_role,
    license_no = coalesce(nullif(trim(p_license_no), ''), license_no),
    updated_at = now()
  WHERE id = p_target_user_id
  RETURNING * INTO v_updated;

  IF v_updated.id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text, text) TO authenticated, service_role;
