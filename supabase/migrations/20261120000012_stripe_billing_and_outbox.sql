-- Stripe Billing Grace Period, Webhook Idempotency & Offline Outbox Drawing Drafts

-- ---------------------------------------------------------------------------
-- 1. Extend subscriptions with failed-payment 3-day grace window columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_payment_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz;

CREATE OR REPLACE FUNCTION public.user_has_active_entitlement(
  p_user_id uuid,
  p_now timestamptz DEFAULT now()
)
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
      AND (
        (
          s.status IN ('active', 'trialing')
          AND (s.current_period_end IS NULL OR s.current_period_end > p_now)
        )
        OR (
          s.status = 'past_due'
          AND coalesce(
            s.grace_period_ends_at,
            s.last_payment_failed_at + interval '3 days'
          ) > p_now
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_active_entitlement(uuid, timestamptz)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_active_paid_subscription(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_active_entitlement(p_user_id, now());
$$;

-- ---------------------------------------------------------------------------
-- 2. stripe_webhook_events (idempotent Stripe event log)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'processed'
    CHECK (status IN ('processed', 'ignored', 'failed')),
  processed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated;
GRANT SELECT ON public.stripe_webhook_events TO authenticated;

CREATE POLICY stripe_webhook_events_admin_select
  ON public.stripe_webhook_events FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. drawing_drafts (server mirror for offline outbox replay idempotency)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.drawing_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  draft_key text NOT NULL,
  exercise_id uuid NOT NULL REFERENCES public.drawing_exercises(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('learn', 'practice', 'exam')),
  graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  elapsed_ms integer NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
  client_draft_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, draft_key),
  UNIQUE (user_id, client_draft_id)
);

CREATE INDEX IF NOT EXISTS idx_drawing_drafts_user_updated
  ON public.drawing_drafts (user_id, updated_at DESC);

CREATE TRIGGER trg_drawing_drafts_updated_at
  BEFORE UPDATE ON public.drawing_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.drawing_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_drafts FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drawing_drafts TO authenticated;

CREATE POLICY drawing_drafts_select_own
  ON public.drawing_drafts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY drawing_drafts_insert_own
  ON public.drawing_drafts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY drawing_drafts_update_own
  ON public.drawing_drafts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY drawing_drafts_delete_own
  ON public.drawing_drafts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());
