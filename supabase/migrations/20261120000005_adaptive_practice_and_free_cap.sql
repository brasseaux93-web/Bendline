-- Adaptive Practice Sessions & Server-Side Free-Tier Daily Cap

-- ---------------------------------------------------------------------------
-- 1. practice_sessions (resumable adaptive practice state)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  jurisdiction_id uuid NOT NULL REFERENCES public.jurisdictions(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('daily_12', 'topic_drill', 'weak_spots', 'missed_review')),
  topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL,
  question_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  current_index integer NOT NULL DEFAULT 0 CHECK (current_index >= 0),
  answers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(answers) = 'array'),
  flagged_question_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  elapsed_ms integer NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_status_updated
  ON public.practice_sessions (user_id, status, updated_at DESC);

CREATE TRIGGER trg_practice_sessions_updated_at
  BEFORE UPDATE ON public.practice_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_sessions FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_sessions TO authenticated;

CREATE POLICY practice_sessions_select_own_or_admin
  ON public.practice_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY practice_sessions_insert_own
  ON public.practice_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY practice_sessions_update_own
  ON public.practice_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY practice_sessions_delete_own_or_admin
  ON public.practice_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Server-side free-tier daily cap enforcement (12 attempts / UTC day)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_active_paid_subscription(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = p_user_id
      AND s.plan_tier IN ('pro_monthly', 'pro_exam_pass', 'lifetime')
      AND s.status IN ('active', 'trialing')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_free_tier_attempt_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_day date;
  v_daily_count integer;
BEGIN
  -- Allow idempotent offline sync retries carrying an already-recorded client_attempt_id
  IF NEW.client_attempt_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.attempts a
    WHERE a.user_id = NEW.user_id
      AND a.client_attempt_id = NEW.client_attempt_id
  ) THEN
    RETURN NEW;
  END IF;

  IF public.has_active_paid_subscription(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  v_attempt_day := (coalesce(NEW.attempted_at, now()) AT TIME ZONE 'UTC')::date;

  SELECT count(*)::integer
  INTO v_daily_count
  FROM public.attempts a
  WHERE a.user_id = NEW.user_id
    AND (a.attempted_at AT TIME ZONE 'UTC')::date = v_attempt_day;

  IF v_daily_count >= 12 THEN
    RAISE EXCEPTION 'FREE_TIER_DAILY_CAP_REACHED: Free tier is limited to 12 questions per day'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attempts_enforce_free_cap ON public.attempts;
CREATE TRIGGER trg_attempts_enforce_free_cap
  BEFORE INSERT ON public.attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_free_tier_attempt_cap();
