-- Bendline Core Schema Migration
-- Tables: profiles, jurisdictions, topics, blueprints, outline_nodes, questions,
-- question_versions, question_reviews, mock_exams, mock_sessions, attempts,
-- srs_state, drawing_exercises, drawing_rules, drawing_submissions,
-- error_reports, subscriptions.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared trigger and validation helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_review_scores(scores jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN scores IS NULL THEN false
    WHEN jsonb_typeof(scores) = 'object' THEN (
      SELECT count(*) = 8
        AND bool_and(
          jsonb_typeof(e.value) = 'number'
          AND (e.value #>> '{}') ~ '^[1-5]$'
        )
      FROM jsonb_each(scores) AS e(key, value)
    )
    WHEN jsonb_typeof(scores) = 'array' THEN (
      SELECT jsonb_array_length(scores) = 8
        AND bool_and(
          jsonb_typeof(e.value) = 'number'
          AND (e.value #>> '{}') ~ '^[1-5]$'
        )
      FROM jsonb_array_elements(scores) AS e(value)
    )
    ELSE false
  END;
$$;

-- ---------------------------------------------------------------------------
-- 1. jurisdictions
-- ---------------------------------------------------------------------------

CREATE TABLE public.jurisdictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL CHECK (char_length(state) = 2 AND state = upper(state)),
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  license_level text NOT NULL CHECK (license_level IN ('journeyman', 'master', 'apprentice', 'contractor')),
  code_family text NOT NULL CHECK (code_family IN ('IPC', 'UPC')),
  edition text NOT NULL CHECK (char_length(trim(edition)) > 0),
  amendments_note text NOT NULL DEFAULT '',
  exam_vendor text NOT NULL CHECK (char_length(trim(exam_vendor)) > 0),
  question_count integer NOT NULL CHECK (question_count > 0),
  time_limit_min integer NOT NULL CHECK (time_limit_min > 0),
  pass_pct numeric(5,2) NOT NULL CHECK (pass_pct > 0 AND pass_pct <= 100),
  open_book boolean NOT NULL DEFAULT false,
  allowed_refs text[] NOT NULL DEFAULT '{}'::text[],
  bulletin_url text,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state, license_level)
);

CREATE TRIGGER trg_jurisdictions_updated_at
  BEFORE UPDATE ON public.jurisdictions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. profiles
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'reviewer', 'admin')),
  display_name text,
  license_no text,
  target_jurisdiction_id uuid REFERENCES public.jurisdictions(id) ON DELETE SET NULL,
  reduce_motion boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. topics
-- ---------------------------------------------------------------------------

CREATE TABLE public.topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (char_length(trim(slug)) > 0),
  title text NOT NULL CHECK (char_length(trim(title)) > 0),
  description text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_topics_updated_at
  BEFORE UPDATE ON public.topics
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. blueprints
-- ---------------------------------------------------------------------------

CREATE TABLE public.blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id uuid NOT NULL REFERENCES public.jurisdictions(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
  weight_pct numeric(5,2) NOT NULL CHECK (weight_pct >= 0 AND weight_pct <= 100),
  target_question_count integer CHECK (target_question_count IS NULL OR target_question_count >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction_id, topic_id)
);

CREATE INDEX idx_blueprints_topic_id ON public.blueprints (topic_id);

CREATE TRIGGER trg_blueprints_updated_at
  BEFORE UPDATE ON public.blueprints
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. outline_nodes
-- ---------------------------------------------------------------------------

CREATE TABLE public.outline_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.outline_nodes(id) ON DELETE CASCADE,
  jurisdiction_id uuid REFERENCES public.jurisdictions(id) ON DELETE CASCADE,
  code_family text NOT NULL CHECK (code_family IN ('IPC', 'UPC')),
  edition text NOT NULL CHECK (char_length(trim(edition)) > 0),
  code_ref text NOT NULL CHECK (char_length(trim(code_ref)) > 0),
  title text NOT NULL CHECK (char_length(trim(title)) > 0),
  summary_md text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_outline_nodes_topic_order ON public.outline_nodes (topic_id, display_order);
CREATE INDEX idx_outline_nodes_parent_id ON public.outline_nodes (parent_id);

CREATE TRIGGER trg_outline_nodes_updated_at
  BEFORE UPDATE ON public.outline_nodes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. questions
-- ---------------------------------------------------------------------------

CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stem text NOT NULL CHECK (char_length(trim(stem)) > 0),
  type text NOT NULL CHECK (type IN ('mcq', 'calc', 'lookup', 'scenario')),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) >= 2),
  correct_index integer NOT NULL CHECK (correct_index >= 0),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
  outline_node_id uuid REFERENCES public.outline_nodes(id) ON DELETE SET NULL,
  jurisdiction_id uuid REFERENCES public.jurisdictions(id) ON DELETE SET NULL,
  difficulty smallint NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  code_family text NOT NULL CHECK (code_family IN ('IPC', 'UPC')),
  edition text NOT NULL CHECK (char_length(trim(edition)) > 0),
  code_ref text NOT NULL CHECK (char_length(trim(code_ref)) > 0),
  explanation_seed text NOT NULL CHECK (char_length(trim(explanation_seed)) > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'published', 'flagged')),
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT questions_correct_index_in_bounds CHECK (correct_index < jsonb_array_length(options))
);

CREATE INDEX idx_questions_topic_status_code_edition
  ON public.questions (topic_id, status, code_family, edition);
CREATE INDEX idx_questions_jurisdiction_id ON public.questions (jurisdiction_id);
CREATE INDEX idx_questions_outline_node_id ON public.questions (outline_node_id);

CREATE TRIGGER trg_questions_updated_at
  BEFORE UPDATE ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. question_versions
-- ---------------------------------------------------------------------------

CREATE TABLE public.question_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  stem text NOT NULL CHECK (char_length(trim(stem)) > 0),
  type text NOT NULL CHECK (type IN ('mcq', 'calc', 'lookup', 'scenario')),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) >= 2),
  correct_index integer NOT NULL CHECK (correct_index >= 0 AND correct_index < jsonb_array_length(options)),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  code_family text NOT NULL CHECK (code_family IN ('IPC', 'UPC')),
  edition text NOT NULL CHECK (char_length(trim(edition)) > 0),
  code_ref text NOT NULL CHECK (char_length(trim(code_ref)) > 0),
  explanation_seed text NOT NULL CHECK (char_length(trim(explanation_seed)) > 0),
  change_note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, version)
);

-- ---------------------------------------------------------------------------
-- 8. question_reviews
-- ---------------------------------------------------------------------------

CREATE TABLE public.question_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  question_version integer NOT NULL DEFAULT 1 CHECK (question_version >= 1),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  license_no text NOT NULL CHECK (char_length(trim(license_no)) > 0),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  scores jsonb NOT NULL CHECK (public.is_valid_review_scores(scores)),
  verdict text NOT NULL CHECK (verdict IN ('approved', 'needs_revision', 'rejected')),
  comments text,
  suggested_fix text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_question_reviews_question_version_verdict
  ON public.question_reviews (question_id, question_version, verdict);
CREATE INDEX idx_question_reviews_reviewer_id
  ON public.question_reviews (reviewer_id);

-- ---------------------------------------------------------------------------
-- 9. mock_exams
-- ---------------------------------------------------------------------------

CREATE TABLE public.mock_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id uuid NOT NULL REFERENCES public.jurisdictions(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) > 0),
  description text NOT NULL DEFAULT '',
  question_count integer NOT NULL CHECK (question_count > 0),
  time_limit_min integer NOT NULL CHECK (time_limit_min > 0),
  pass_pct numeric(5,2) NOT NULL CHECK (pass_pct > 0 AND pass_pct <= 100),
  open_book boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mock_exams_jurisdiction_active
  ON public.mock_exams (jurisdiction_id, is_active);

CREATE TRIGGER trg_mock_exams_updated_at
  BEFORE UPDATE ON public.mock_exams
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. mock_sessions
-- ---------------------------------------------------------------------------

CREATE TABLE public.mock_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mock_exam_id uuid REFERENCES public.mock_exams(id) ON DELETE SET NULL,
  jurisdiction_id uuid NOT NULL REFERENCES public.jurisdictions(id) ON DELETE RESTRICT,
  question_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'abandoned', 'expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  time_spent_ms integer NOT NULL DEFAULT 0 CHECK (time_spent_ms >= 0),
  score_pct numeric(5,2) CHECK (score_pct IS NULL OR (score_pct >= 0 AND score_pct <= 100)),
  passed boolean,
  topic_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mock_sessions_user_started
  ON public.mock_sessions (user_id, started_at DESC);

CREATE TRIGGER trg_mock_sessions_updated_at
  BEFORE UPDATE ON public.mock_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 11. attempts
-- ---------------------------------------------------------------------------

CREATE TABLE public.attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  question_version integer NOT NULL DEFAULT 1 CHECK (question_version >= 1),
  mock_session_id uuid REFERENCES public.mock_sessions(id) ON DELETE SET NULL,
  selected_index integer NOT NULL CHECK (selected_index >= 0),
  is_correct boolean NOT NULL,
  time_ms integer NOT NULL DEFAULT 0 CHECK (time_ms >= 0),
  mode text NOT NULL DEFAULT 'practice' CHECK (mode IN ('learn', 'practice', 'exam', 'srs')),
  confidence smallint CHECK (confidence IS NULL OR confidence BETWEEN 1 AND 5),
  client_attempt_id uuid,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_attempt_id)
);

CREATE INDEX idx_attempts_user_attempted_at
  ON public.attempts (user_id, attempted_at DESC);
CREATE INDEX idx_attempts_question_id
  ON public.attempts (question_id);
CREATE INDEX idx_attempts_mock_session_id
  ON public.attempts (mock_session_id);

-- ---------------------------------------------------------------------------
-- 12. srs_state
-- ---------------------------------------------------------------------------

CREATE TABLE public.srs_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL DEFAULT now(),
  interval_days numeric(8,2) NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
  ease_factor numeric(5,2) NOT NULL DEFAULT 2.50 CHECK (ease_factor >= 1.30),
  repetitions integer NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
  lapses integer NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);

CREATE INDEX idx_srs_state_user_due_at
  ON public.srs_state (user_id, due_at);

CREATE TRIGGER trg_srs_state_updated_at
  BEFORE UPDATE ON public.srs_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 13. drawing_exercises
-- ---------------------------------------------------------------------------

CREATE TABLE public.drawing_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id uuid NOT NULL REFERENCES public.jurisdictions(id) ON DELETE RESTRICT,
  topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(trim(title)) > 0),
  prompt_md text NOT NULL CHECK (char_length(trim(prompt_md)) > 0),
  fixtures jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fixtures) = 'array'),
  pipe_system text NOT NULL CHECK (pipe_system IN ('dwv', 'vent', 'supply')),
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(constraints) = 'object'),
  scoring_rubric jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scoring_rubric) = 'object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'published', 'flagged')),
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  code_family text NOT NULL DEFAULT 'IPC' CHECK (code_family IN ('IPC', 'UPC')),
  edition text NOT NULL CHECK (char_length(trim(edition)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drawing_exercises_published_requires_review CHECK (
    status <> 'published' OR (reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX idx_drawing_exercises_jurisdiction_status
  ON public.drawing_exercises (jurisdiction_id, status, pipe_system, edition);

CREATE TRIGGER trg_drawing_exercises_updated_at
  BEFORE UPDATE ON public.drawing_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 14. drawing_rules
-- ---------------------------------------------------------------------------

CREATE TABLE public.drawing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_family text NOT NULL CHECK (code_family IN ('IPC', 'UPC')),
  edition text NOT NULL CHECK (char_length(trim(edition)) > 0),
  rule_key text NOT NULL CHECK (char_length(trim(rule_key)) > 0),
  description_paraphrased text NOT NULL CHECK (char_length(trim(description_paraphrased)) > 0),
  params jsonb NOT NULL CHECK (jsonb_typeof(params) = 'object'),
  code_ref text NOT NULL CHECK (char_length(trim(code_ref)) > 0),
  topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code_family, edition, rule_key)
);

CREATE INDEX idx_drawing_rules_code_edition
  ON public.drawing_rules (code_family, edition);

CREATE TRIGGER trg_drawing_rules_updated_at
  BEFORE UPDATE ON public.drawing_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 15. drawing_submissions
-- ---------------------------------------------------------------------------

CREATE TABLE public.drawing_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.drawing_exercises(id) ON DELETE RESTRICT,
  graph jsonb NOT NULL CHECK (jsonb_typeof(graph) = 'object'),
  score numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  rubric_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rubric_breakdown) = 'object'),
  time_ms integer NOT NULL DEFAULT 0 CHECK (time_ms >= 0),
  mode text NOT NULL CHECK (mode IN ('learn', 'practice', 'exam')),
  client_submission_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_submission_id)
);

CREATE INDEX idx_drawing_submissions_user_created
  ON public.drawing_submissions (user_id, created_at DESC);
CREATE INDEX idx_drawing_submissions_exercise_id
  ON public.drawing_submissions (exercise_id);

-- ---------------------------------------------------------------------------
-- 16. error_reports
-- ---------------------------------------------------------------------------

CREATE TABLE public.error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.questions(id) ON DELETE CASCADE,
  drawing_exercise_id uuid REFERENCES public.drawing_exercises(id) ON DELETE CASCADE,
  jurisdiction_id uuid REFERENCES public.jurisdictions(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'technical' CHECK (
    category IN ('technical', 'code_citation', 'typo', 'calculation', 'jurisdiction_amendment', 'other')
  ),
  description text NOT NULL CHECK (char_length(trim(description)) > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'resolved', 'dismissed')),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT error_reports_target_check CHECK (
    question_id IS NOT NULL OR drawing_exercise_id IS NOT NULL
  )
);

CREATE INDEX idx_error_reports_status_created
  ON public.error_reports (status, created_at DESC);
CREATE INDEX idx_error_reports_user_id
  ON public.error_reports (user_id);

CREATE TRIGGER trg_error_reports_updated_at
  BEFORE UPDATE ON public.error_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 17. subscriptions
-- ---------------------------------------------------------------------------

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  plan_tier text NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro_monthly', 'pro_exam_pass', 'lifetime')),
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')
  ),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
