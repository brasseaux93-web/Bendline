-- Bendline Views and Row-Level Security Migration

-- ---------------------------------------------------------------------------
-- Security helper functions (SECURITY DEFINER to avoid recursive RLS lookups)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.current_user_role() = 'admin', false);
$$;

CREATE OR REPLACE FUNCTION public.is_reviewer_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.current_user_role() IN ('reviewer', 'admin'), false);
$$;

CREATE OR REPLACE FUNCTION public.has_approved_current_review(p_question_id uuid, p_version integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.question_reviews qr
    WHERE qr.question_id = p_question_id
      AND qr.question_version = p_version
      AND qr.verdict = 'approved'
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_reviewer_or_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_approved_current_review(uuid, integer) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Prevent non-admin profile role escalation (SECURITY INVOKER so current_user
-- reflects the caller attempting the UPDATE)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  jwt_role text;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    jwt_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    );

    IF current_user IN ('postgres', 'supabase_admin', 'service_role')
       OR jwt_role = 'service_role' THEN
      RETURN NEW;
    END IF;

    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators may change profile roles'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_profiles_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- ---------------------------------------------------------------------------
-- Servable questions view: published AND has an approved review for current version
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.servable_questions
WITH (security_invoker = true)
AS
SELECT
  q.id,
  q.stem,
  q.type,
  q.options,
  q.correct_index,
  q.topic_id,
  q.outline_node_id,
  q.jurisdiction_id,
  q.difficulty,
  q.code_family,
  q.edition,
  q.code_ref,
  q.explanation_seed,
  q.status,
  q.reviewer_id,
  q.reviewed_at,
  q.version,
  q.created_by,
  q.created_at,
  q.updated_at,
  qr.review_id,
  qr.approved_by_reviewer_id,
  qr.reviewer_license_no,
  qr.approval_reviewed_at,
  qr.review_scores,
  qr.review_verdict
FROM public.questions q
INNER JOIN LATERAL (
  SELECT
    r.id AS review_id,
    r.reviewer_id AS approved_by_reviewer_id,
    r.license_no AS reviewer_license_no,
    r.reviewed_at AS approval_reviewed_at,
    r.scores AS review_scores,
    r.verdict AS review_verdict
  FROM public.question_reviews r
  WHERE r.question_id = q.id
    AND r.question_version = q.version
    AND r.verdict = 'approved'
  ORDER BY r.reviewed_at DESC, r.id DESC
  LIMIT 1
) qr ON true
WHERE q.status = 'published';

GRANT SELECT ON public.servable_questions TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable and force RLS on every table
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.jurisdictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jurisdictions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics FORCE ROW LEVEL SECURITY;

ALTER TABLE public.blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprints FORCE ROW LEVEL SECURITY;

ALTER TABLE public.outline_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outline_nodes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.question_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_versions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.question_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_reviews FORCE ROW LEVEL SECURITY;

ALTER TABLE public.mock_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_exams FORCE ROW LEVEL SECURITY;

ALTER TABLE public.mock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.srs_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.srs_state FORCE ROW LEVEL SECURITY;

ALTER TABLE public.drawing_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_exercises FORCE ROW LEVEL SECURITY;

ALTER TABLE public.drawing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_rules FORCE ROW LEVEL SECURITY;

ALTER TABLE public.drawing_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_submissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_reports FORCE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Explicit table grants for anon / authenticated / service_role
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON
  public.jurisdictions,
  public.topics,
  public.blueprints,
  public.outline_nodes,
  public.drawing_rules,
  public.mock_exams,
  public.questions,
  public.question_versions,
  public.question_reviews,
  public.drawing_exercises
TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON
  public.jurisdictions,
  public.topics,
  public.blueprints,
  public.outline_nodes,
  public.drawing_rules,
  public.mock_exams,
  public.questions,
  public.question_versions,
  public.question_reviews,
  public.drawing_exercises
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles,
  public.mock_sessions,
  public.attempts,
  public.srs_state,
  public.drawing_submissions,
  public.error_reports,
  public.subscriptions
TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. profiles policies
-- ---------------------------------------------------------------------------

CREATE POLICY profiles_select_own_or_staff
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_reviewer_or_admin());

CREATE POLICY profiles_insert_self_or_admin
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid() = id AND role = 'user') OR public.is_admin());

CREATE POLICY profiles_update_self_or_admin
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

CREATE POLICY profiles_delete_admin_only
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Reference / catalog tables (jurisdictions, topics, blueprints,
--    outline_nodes, drawing_rules)
-- ---------------------------------------------------------------------------

CREATE POLICY jurisdictions_select_public
  ON public.jurisdictions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY jurisdictions_insert_admin
  ON public.jurisdictions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY jurisdictions_update_admin
  ON public.jurisdictions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY jurisdictions_delete_admin
  ON public.jurisdictions FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY topics_select_public
  ON public.topics FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY topics_insert_admin
  ON public.topics FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY topics_update_admin
  ON public.topics FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY topics_delete_admin
  ON public.topics FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY blueprints_select_public
  ON public.blueprints FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY blueprints_insert_admin
  ON public.blueprints FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY blueprints_update_admin
  ON public.blueprints FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY blueprints_delete_admin
  ON public.blueprints FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY outline_nodes_select_public
  ON public.outline_nodes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY outline_nodes_insert_admin
  ON public.outline_nodes FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY outline_nodes_update_admin
  ON public.outline_nodes FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY outline_nodes_delete_admin
  ON public.outline_nodes FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY drawing_rules_select_public
  ON public.drawing_rules FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY drawing_rules_insert_admin
  ON public.drawing_rules FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY drawing_rules_update_admin
  ON public.drawing_rules FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY drawing_rules_delete_admin
  ON public.drawing_rules FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. mock_exams policies
-- ---------------------------------------------------------------------------

CREATE POLICY mock_exams_select_active_or_staff
  ON public.mock_exams FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR public.is_reviewer_or_admin());

CREATE POLICY mock_exams_insert_admin
  ON public.mock_exams FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY mock_exams_update_admin
  ON public.mock_exams FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY mock_exams_delete_admin
  ON public.mock_exams FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. questions policies
-- ---------------------------------------------------------------------------

CREATE POLICY questions_select_servable_or_staff
  ON public.questions FOR SELECT
  TO anon, authenticated
  USING (
    (status = 'published' AND public.has_approved_current_review(id, version))
    OR public.is_reviewer_or_admin()
  );

CREATE POLICY questions_insert_staff
  ON public.questions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_reviewer_or_admin());

CREATE POLICY questions_update_staff
  ON public.questions FOR UPDATE
  TO authenticated
  USING (public.is_reviewer_or_admin())
  WITH CHECK (public.is_reviewer_or_admin());

CREATE POLICY questions_delete_admin
  ON public.questions FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. question_versions policies
-- ---------------------------------------------------------------------------

CREATE POLICY question_versions_select_servable_or_staff
  ON public.question_versions FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.questions q
      WHERE q.id = question_versions.question_id
        AND q.version = question_versions.version
        AND q.status = 'published'
        AND public.has_approved_current_review(q.id, q.version)
    )
    OR public.is_reviewer_or_admin()
  );

CREATE POLICY question_versions_insert_staff
  ON public.question_versions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_reviewer_or_admin());

CREATE POLICY question_versions_update_admin
  ON public.question_versions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY question_versions_delete_admin
  ON public.question_versions FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. question_reviews policies
-- ---------------------------------------------------------------------------

CREATE POLICY question_reviews_select_approved_or_staff
  ON public.question_reviews FOR SELECT
  TO anon, authenticated
  USING (verdict = 'approved' OR public.is_reviewer_or_admin());

CREATE POLICY question_reviews_insert_staff
  ON public.question_reviews FOR INSERT
  TO authenticated
  WITH CHECK (public.is_reviewer_or_admin() AND reviewer_id = auth.uid());

CREATE POLICY question_reviews_update_owner_or_admin
  ON public.question_reviews FOR UPDATE
  TO authenticated
  USING ((public.is_reviewer_or_admin() AND reviewer_id = auth.uid()) OR public.is_admin())
  WITH CHECK ((public.is_reviewer_or_admin() AND reviewer_id = auth.uid()) OR public.is_admin());

CREATE POLICY question_reviews_delete_admin
  ON public.question_reviews FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. drawing_exercises policies
-- ---------------------------------------------------------------------------

CREATE POLICY drawing_exercises_select_published_or_staff
  ON public.drawing_exercises FOR SELECT
  TO anon, authenticated
  USING (
    (status = 'published' AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)
    OR public.is_reviewer_or_admin()
  );

CREATE POLICY drawing_exercises_insert_staff
  ON public.drawing_exercises FOR INSERT
  TO authenticated
  WITH CHECK (public.is_reviewer_or_admin());

CREATE POLICY drawing_exercises_update_staff
  ON public.drawing_exercises FOR UPDATE
  TO authenticated
  USING (public.is_reviewer_or_admin())
  WITH CHECK (public.is_reviewer_or_admin());

CREATE POLICY drawing_exercises_delete_admin
  ON public.drawing_exercises FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. User-owned activity tables (attempts, srs_state, mock_sessions,
--    drawing_submissions)
-- ---------------------------------------------------------------------------

CREATE POLICY attempts_select_own_or_admin
  ON public.attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY attempts_insert_own
  ON public.attempts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY attempts_update_own
  ON public.attempts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY attempts_delete_own_or_admin
  ON public.attempts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY srs_state_select_own_or_admin
  ON public.srs_state FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY srs_state_insert_own
  ON public.srs_state FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY srs_state_update_own
  ON public.srs_state FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY srs_state_delete_own_or_admin
  ON public.srs_state FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY mock_sessions_select_own_or_admin
  ON public.mock_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY mock_sessions_insert_own
  ON public.mock_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY mock_sessions_update_own
  ON public.mock_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY mock_sessions_delete_own_or_admin
  ON public.mock_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY drawing_submissions_select_own_or_admin
  ON public.drawing_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY drawing_submissions_insert_own
  ON public.drawing_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY drawing_submissions_update_own
  ON public.drawing_submissions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY drawing_submissions_delete_own_or_admin
  ON public.drawing_submissions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 9. error_reports policies
-- ---------------------------------------------------------------------------

CREATE POLICY error_reports_select_own_or_staff
  ON public.error_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_reviewer_or_admin());

CREATE POLICY error_reports_insert_own
  ON public.error_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY error_reports_update_own_open_or_staff
  ON public.error_reports FOR UPDATE
  TO authenticated
  USING ((auth.uid() = user_id AND status = 'open') OR public.is_reviewer_or_admin())
  WITH CHECK ((auth.uid() = user_id AND status = 'open') OR public.is_reviewer_or_admin());

CREATE POLICY error_reports_delete_admin
  ON public.error_reports FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 10. subscriptions policies
-- ---------------------------------------------------------------------------

CREATE POLICY subscriptions_select_own_or_admin
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY subscriptions_insert_admin
  ON public.subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY subscriptions_update_admin
  ON public.subscriptions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY subscriptions_delete_admin
  ON public.subscriptions FOR DELETE
  TO authenticated
  USING (public.is_admin());
