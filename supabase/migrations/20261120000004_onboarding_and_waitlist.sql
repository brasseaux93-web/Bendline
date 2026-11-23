-- Additive migration for onboarding fields and "My state isn't listed" waitlist

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS exam_date date,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.state_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  state text NOT NULL CHECK (char_length(state) = 2 AND state = upper(state)),
  license_level text NOT NULL DEFAULT 'journeyman' CHECK (
    license_level IN ('journeyman', 'master', 'apprentice', 'contractor')
  ),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, state, license_level)
);

CREATE INDEX IF NOT EXISTS idx_state_waitlist_state_created
  ON public.state_waitlist (state, created_at DESC);

ALTER TABLE public.state_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_waitlist FORCE ROW LEVEL SECURITY;

GRANT INSERT ON public.state_waitlist TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.state_waitlist TO authenticated;

CREATE POLICY state_waitlist_insert_public
  ON public.state_waitlist FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY state_waitlist_select_own_or_admin
  ON public.state_waitlist FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY state_waitlist_delete_admin
  ON public.state_waitlist FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Populate verified verification date on the 3 seeded jurisdictions so
-- onboarding displays "Last verified [date]" alongside bulletin_url.
UPDATE public.jurisdictions
SET last_verified_at = '2026-11-15T00:00:00Z'::timestamptz
WHERE id IN (
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111102',
  '11111111-1111-4111-8111-111111111103'
)
  AND last_verified_at IS NULL;
