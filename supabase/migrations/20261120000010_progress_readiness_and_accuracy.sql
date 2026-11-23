-- Progress Readiness Recomputation (View + RPC) & Public Accuracy Ledger RPC
-- Safely aggregates readiness per authenticated user and anonymous platform-level trust metrics.

-- ---------------------------------------------------------------------------
-- 1. user_readiness_summary view (security_invoker so RLS scopes attempts)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.user_readiness_summary
WITH (security_invoker = true)
AS
WITH topic_counts AS (
  SELECT
    t.id AS topic_id,
    t.slug,
    t.title,
    t.display_order,
    a.user_id,
    count(a.id)::integer AS answered_count,
    count(a.id) FILTER (WHERE a.is_correct)::integer AS correct_count
  FROM public.topics t
  CROSS JOIN (SELECT DISTINCT user_id FROM public.attempts) u
  LEFT JOIN public.questions q
    ON q.topic_id = t.id
  LEFT JOIN public.attempts a
    ON a.question_id = q.id
   AND a.user_id = u.user_id
  GROUP BY t.id, t.slug, t.title, t.display_order, a.user_id, u.user_id
)
SELECT
  tc.user_id,
  count(tc.topic_id)::integer AS total_topics,
  count(tc.topic_id) FILTER (WHERE tc.answered_count >= 15)::integer AS qualified_topics_count,
  coalesce(sum(tc.answered_count), 0)::integer AS total_answers,
  CASE
    WHEN count(tc.topic_id) > 0
     AND count(tc.topic_id) FILTER (WHERE tc.answered_count >= 15) = count(tc.topic_id)
    THEN round(
      avg(
        round((tc.correct_count::numeric / NULLIF(tc.answered_count, 0)) * 100)
      )
    )::integer
    ELSE NULL
  END AS score_pct
FROM topic_counts tc
GROUP BY tc.user_id;

GRANT SELECT ON public.user_readiness_summary TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. recompute_user_readiness(p_user_id uuid) RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recompute_user_readiness(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_total_topics integer := 0;
  v_qualified integer := 0;
  v_total_answers integer := 0;
  v_score_pct integer := NULL;
  v_breakdown jsonb := '[]'::jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_ID_REQUIRED' USING ERRCODE = '22004';
  END IF;

  IF v_caller IS NOT NULL AND v_caller <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN_READINESS_ACCESS' USING ERRCODE = '42501';
  END IF;

  WITH per_topic AS (
    SELECT
      t.id AS topic_id,
      t.slug,
      t.title,
      t.display_order,
      count(a.id)::integer AS answered,
      count(a.id) FILTER (WHERE a.is_correct)::integer AS correct,
      CASE
        WHEN count(a.id) > 0
        THEN round((count(a.id) FILTER (WHERE a.is_correct)::numeric / count(a.id)::numeric) * 100)::integer
        ELSE NULL
      END AS accuracy_pct
    FROM public.topics t
    LEFT JOIN public.questions q
      ON q.topic_id = t.id
    LEFT JOIN public.attempts a
      ON a.question_id = q.id
     AND a.user_id = p_user_id
    GROUP BY t.id, t.slug, t.title, t.display_order
    ORDER BY t.display_order ASC
  )
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE answered >= 15)::integer,
    coalesce(sum(answered), 0)::integer,
    CASE
      WHEN count(*) > 0 AND count(*) FILTER (WHERE answered >= 15) = count(*)
      THEN round(avg(accuracy_pct))::integer
      ELSE NULL
    END,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'topic_id', topic_id,
          'slug', slug,
          'title', title,
          'answered', answered,
          'correct', correct,
          'accuracy_pct', accuracy_pct,
          'remaining_for_readiness', greatest(0, 15 - answered)
        )
        ORDER BY display_order ASC
      ),
      '[]'::jsonb
    )
  INTO v_total_topics, v_qualified, v_total_answers, v_score_pct, v_breakdown
  FROM per_topic;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'score_pct', v_score_pct,
    'is_unlocked', (v_score_pct IS NOT NULL),
    'qualified_topics_count', v_qualified,
    'total_topics', v_total_topics,
    'min_answers_per_topic', 15,
    'total_answers', v_total_answers,
    'topic_breakdown', v_breakdown,
    'recomputed_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_user_readiness(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. public_accuracy_metrics() RPC (aggregate-only, zero PII / no user rows)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.public_accuracy_metrics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH servable_rows AS (
    SELECT
      sq.id,
      coalesce(sq.approval_reviewed_at, sq.reviewed_at) AS effective_reviewed_at,
      sq.reviewer_license_no
    FROM public.servable_questions sq
  ),
  agg_questions AS (
    SELECT
      count(*)::integer AS published_questions_count,
      count(*) FILTER (
        WHERE sr.reviewer_license_no IS NOT NULL
          AND char_length(trim(sr.reviewer_license_no)) > 0
      )::integer AS licensed_reviewed_count,
      round(
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY extract(epoch FROM (now() - sr.effective_reviewed_at)) / 86400.0
        )
      )::integer AS median_review_age_days
    FROM servable_rows sr
    WHERE sr.effective_reviewed_at IS NOT NULL
  ),
  agg_errors AS (
    SELECT
      (SELECT count(*)::integer FROM public.error_reports er WHERE er.status = 'resolved') AS confirmed_error_count,
      (SELECT count(*)::integer FROM public.attempts a) AS total_attempts_count
  )
  SELECT jsonb_build_object(
    'published_questions_count', coalesce(aq.published_questions_count, 0),
    'licensed_reviewed_count', coalesce(aq.licensed_reviewed_count, 0),
    'pct_reviewed_by_licensed', CASE
      WHEN coalesce(aq.published_questions_count, 0) > 0
      THEN round((aq.licensed_reviewed_count::numeric / aq.published_questions_count::numeric) * 100)::integer
      ELSE 0
    END,
    'median_review_age_days', coalesce(aq.median_review_age_days, 0),
    'confirmed_error_count', ae.confirmed_error_count,
    'total_attempts_count', ae.total_attempts_count,
    'confirmed_error_rate_per_1000', CASE
      WHEN ae.total_attempts_count > 0
      THEN round((ae.confirmed_error_count::numeric / ae.total_attempts_count::numeric) * 1000.0, 2)
      ELSE 0
    END,
    'generated_at', now()
  )
  FROM agg_questions aq
  CROSS JOIN agg_errors ae;
$$;

GRANT EXECUTE ON FUNCTION public.public_accuracy_metrics() TO anon, authenticated, service_role;
