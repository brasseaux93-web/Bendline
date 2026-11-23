-- pgTAP isolation, schema, servability, and RLS verification tests for Bendline

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(80);

-- ===========================================================================
-- 1. Verify all 17 tables and servable_questions view exist (18 tests)
-- ===========================================================================

SELECT has_table('public', 'profiles', 'table public.profiles exists');
SELECT has_table('public', 'jurisdictions', 'table public.jurisdictions exists');
SELECT has_table('public', 'topics', 'table public.topics exists');
SELECT has_table('public', 'blueprints', 'table public.blueprints exists');
SELECT has_table('public', 'outline_nodes', 'table public.outline_nodes exists');
SELECT has_table('public', 'questions', 'table public.questions exists');
SELECT has_table('public', 'question_versions', 'table public.question_versions exists');
SELECT has_table('public', 'question_reviews', 'table public.question_reviews exists');
SELECT has_table('public', 'mock_exams', 'table public.mock_exams exists');
SELECT has_table('public', 'mock_sessions', 'table public.mock_sessions exists');
SELECT has_table('public', 'attempts', 'table public.attempts exists');
SELECT has_table('public', 'srs_state', 'table public.srs_state exists');
SELECT has_table('public', 'drawing_exercises', 'table public.drawing_exercises exists');
SELECT has_table('public', 'drawing_rules', 'table public.drawing_rules exists');
SELECT has_table('public', 'drawing_submissions', 'table public.drawing_submissions exists');
SELECT has_table('public', 'error_reports', 'table public.error_reports exists');
SELECT has_table('public', 'subscriptions', 'table public.subscriptions exists');
SELECT has_view('public', 'servable_questions', 'view public.servable_questions exists');

-- ===========================================================================
-- 2. Verify RLS is enabled and forced on all 17 tables + required indexes (19 tests)
-- ===========================================================================

SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'profiles'),
  'RLS enabled and forced on profiles'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'jurisdictions'),
  'RLS enabled and forced on jurisdictions'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'topics'),
  'RLS enabled and forced on topics'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'blueprints'),
  'RLS enabled and forced on blueprints'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'outline_nodes'),
  'RLS enabled and forced on outline_nodes'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'questions'),
  'RLS enabled and forced on questions'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'question_versions'),
  'RLS enabled and forced on question_versions'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'question_reviews'),
  'RLS enabled and forced on question_reviews'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'mock_exams'),
  'RLS enabled and forced on mock_exams'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'mock_sessions'),
  'RLS enabled and forced on mock_sessions'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'attempts'),
  'RLS enabled and forced on attempts'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'srs_state'),
  'RLS enabled and forced on srs_state'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'drawing_exercises'),
  'RLS enabled and forced on drawing_exercises'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'drawing_rules'),
  'RLS enabled and forced on drawing_rules'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'drawing_submissions'),
  'RLS enabled and forced on drawing_submissions'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'error_reports'),
  'RLS enabled and forced on error_reports'
);
SELECT ok(
  (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'subscriptions'),
  'RLS enabled and forced on subscriptions'
);

SELECT has_index(
  'public',
  'questions',
  'idx_questions_topic_status_code_edition',
  'questions has composite index (topic_id, status, code_family, edition)'
);
SELECT has_index(
  'public',
  'srs_state',
  'idx_srs_state_user_due_at',
  'srs_state has composite index (user_id, due_at)'
);

-- ===========================================================================
-- 3. Verify seeded jurisdictions and topics (2 tests)
-- ===========================================================================

SELECT is((SELECT count(*)::int FROM public.jurisdictions), 3, '3 jurisdictions seeded');
SELECT is((SELECT count(*)::int FROM public.topics), 10, '10 topics seeded');

-- ===========================================================================
-- 4. Fixture setup (superuser) + profile trigger check (1 test)
-- ===========================================================================

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_user_b uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  v_rev_1  uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  v_adm_1  uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
  v_tx_id  uuid := '11111111-1111-4111-8111-111111111101';
  v_top_1  uuid := '22222222-2222-4222-8222-222222222206';
  v_scores jsonb := '{"technical_accuracy":5,"code_citation":5,"originality":5,"stem_clarity":4,"distractor_quality":4,"difficulty_calibration":4,"explanation_accuracy":5,"jurisdiction_fit":5}'::jsonb;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  VALUES
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'user_a@bendline.test', '$2a$10$abcdefghijklmnopqrstuv', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'user_b@bendline.test', '$2a$10$abcdefghijklmnopqrstuv', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_rev_1,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rev_1@bendline.test',  '$2a$10$abcdefghijklmnopqrstuv', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_adm_1,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm_1@bendline.test',  '$2a$10$abcdefghijklmnopqrstuv', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  UPDATE public.profiles SET role = 'reviewer', license_no = 'TX-MP-40921' WHERE id = v_rev_1;
  UPDATE public.profiles SET role = 'admin' WHERE id = v_adm_1;

  -- Seed a subscription row for user_a to test cross-user isolation
  INSERT INTO public.subscriptions (user_id, plan_tier, status)
  VALUES (v_user_a, 'pro_monthly', 'active');

  -- Questions spanning every lifecycle state
  INSERT INTO public.questions (
    id, stem, type, options, correct_index, topic_id, jurisdiction_id,
    difficulty, code_family, edition, code_ref, explanation_seed,
    status, reviewer_id, reviewed_at, version, created_by
  )
  VALUES
    -- q1: draft, no review
    (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      'Draft question not ready for learners.',
      'mcq', '["A", "B", "C", "D"]'::jsonb, 0, v_top_1, v_tx_id,
      2, 'IPC', '2021', 'IPC 704.1', 'Seed explanation for q1.',
      'draft', NULL, NULL, 1, v_adm_1
    ),
    -- q2: reviewed but not published, approved review v1
    (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
      'Reviewed question not yet published.',
      'mcq', '["A", "B", "C", "D"]'::jsonb, 1, v_top_1, v_tx_id,
      2, 'IPC', '2021', 'IPC 704.1', 'Seed explanation for q2.',
      'reviewed', v_rev_1, now(), 1, v_adm_1
    ),
    -- q3: published, NO review row at all
    (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
      'Published question lacking any review.',
      'mcq', '["A", "B", "C", "D"]'::jsonb, 2, v_top_1, v_tx_id,
      3, 'IPC', '2021', 'IPC 704.1', 'Seed explanation for q3.',
      'published', NULL, NULL, 1, v_adm_1
    ),
    -- q4: published, rejected review v1
    (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc4',
      'Published question with rejected review.',
      'mcq', '["A", "B", "C", "D"]'::jsonb, 0, v_top_1, v_tx_id,
      3, 'IPC', '2021', 'IPC 704.1', 'Seed explanation for q4.',
      'published', v_rev_1, now(), 1, v_adm_1
    ),
    -- q5: published v2, approved review ONLY for v1 (stale approval)
    (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc5',
      'Published v2 question whose only approval is on v1.',
      'calc', '["1/8 in/ft", "1/4 in/ft", "1/2 in/ft", "1 in/ft"]'::jsonb, 1, v_top_1, v_tx_id,
      3, 'IPC', '2021', 'IPC Table 704.1', 'Seed explanation for q5.',
      'published', v_rev_1, now(), 2, v_adm_1
    ),
    -- q6: flagged even with approved v1 review
    (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc6',
      'Flagged question with prior approval.',
      'lookup', '["A", "B", "C", "D"]'::jsonb, 0, v_top_1, v_tx_id,
      4, 'IPC', '2021', 'IPC 708.1', 'Seed explanation for q6.',
      'flagged', v_rev_1, now(), 1, v_adm_1
    ),
    -- q7: published v2 WITH approved v2 review (ONLY servable question)
    (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc7',
      'Servable v2 question on horizontal drainage slope.',
      'scenario', '["Opt A", "Opt B", "Opt C", "Opt D"]'::jsonb, 1, v_top_1, v_tx_id,
      3, 'IPC', '2021', 'IPC Table 704.1', 'Seed explanation for q7.',
      'published', v_rev_1, now(), 2, v_adm_1
    );

  INSERT INTO public.question_versions (
    question_id, version, stem, type, options, correct_index,
    topic_id, difficulty, code_family, edition, code_ref, explanation_seed, created_by
  )
  VALUES
    (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc7', 1,
      'Prior v1 stem.', 'scenario', '["Opt A", "Opt B", "Opt C", "Opt D"]'::jsonb, 1,
      v_top_1, 3, 'IPC', '2021', 'IPC Table 704.1', 'Prior seed.', v_adm_1
    ),
    (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc7', 2,
      'Servable v2 question on horizontal drainage slope.', 'scenario', '["Opt A", "Opt B", "Opt C", "Opt D"]'::jsonb, 1,
      v_top_1, 3, 'IPC', '2021', 'IPC Table 704.1', 'Seed explanation for q7.', v_adm_1
    );

  INSERT INTO public.question_reviews (
    question_id, question_version, reviewer_id, license_no, scores, verdict, comments
  )
  VALUES
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 1, v_rev_1, 'TX-MP-40921', v_scores, 'approved', 'OK but still unpublished'),
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc4', 1, v_rev_1, 'TX-MP-40921', v_scores, 'rejected', 'Ambiguous distractor'),
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc5', 1, v_rev_1, 'TX-MP-40921', v_scores, 'approved', 'Approved v1 only'),
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc6', 1, v_rev_1, 'TX-MP-40921', v_scores, 'approved', 'Flagged later'),
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc7', 2, v_rev_1, 'TX-MP-40921', v_scores, 'approved', 'Approved current v2');

  -- Drawing exercises: 1 published + reviewed, 1 draft
  INSERT INTO public.drawing_exercises (
    id, jurisdiction_id, topic_id, title, prompt_md, fixtures, pipe_system,
    constraints, scoring_rubric, status, reviewer_id, reviewed_at, code_family, edition
  )
  VALUES
    (
      'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
      v_tx_id, v_top_1,
      'Bathroom Group DWV Layout',
      'Connect WC, lavatory, and tub to the 3-inch building drain.',
      '[{"type":"wc"},{"type":"lav"},{"type":"tub"}]'::jsonb,
      'dwv',
      '{"min_slope_in_per_ft":0.25}'::jsonb,
      '{"drainage_connection":50,"venting":50}'::jsonb,
      'published', v_rev_1, now(), 'IPC', '2021'
    ),
    (
      'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
      v_tx_id, v_top_1,
      'Draft Kitchen Island Vent',
      'Draft exercise not yet published.',
      '[{"type":"sink"}]'::jsonb,
      'vent',
      '{}'::jsonb,
      '{}'::jsonb,
      'draft', NULL, NULL, 'IPC', '2021'
    );
END $$;

SELECT is(
  (SELECT role FROM public.profiles WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid),
  'user',
  'auth.users insert trigger creates profile with default user role'
);

-- ===========================================================================
-- 5. Servability & content visibility under regular authenticated user_a (8 tests)
-- ===========================================================================

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.servable_questions WHERE id IN (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc4'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc5'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc6'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc7'::uuid
  )),
  1,
  'servable_questions returns only 1 of 7 lifecycle questions'
);

SELECT is(
  (SELECT id FROM public.servable_questions WHERE id IN (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc4'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc5'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc6'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc7'::uuid
  )),
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc7'::uuid,
  'servable_questions returns the published question with approved current-version review'
);

SELECT is(
  (SELECT count(*)::int FROM public.questions WHERE id IN (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc4'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc5'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc6'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc7'::uuid
  )),
  1,
  'regular user querying base questions table directly sees only the 1 servable question'
);

SELECT is(
  (SELECT id FROM public.questions WHERE id IN (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc4'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc5'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc6'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc7'::uuid
  )),
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc7'::uuid,
  'base questions table returns exact servable question to user_a'
);

SELECT is(
  (SELECT count(*)::int FROM public.question_versions WHERE question_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc7'::uuid),
  1,
  'regular user only sees current servable version in question_versions'
);

SELECT is(
  (SELECT count(*)::int FROM public.question_reviews WHERE verdict <> 'approved'),
  0,
  'non-approved question reviews are hidden from regular users'
);

SELECT is(
  (SELECT count(*)::int FROM public.drawing_exercises WHERE id IN (
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'::uuid,
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'::uuid
  )),
  1,
  'regular user sees only published and reviewed drawing exercises'
);

SELECT is(
  (SELECT id FROM public.drawing_exercises WHERE id IN (
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'::uuid,
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'::uuid
  )),
  'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'::uuid,
  'published drawing exercise is readable by user_a'
);

-- ===========================================================================
-- 6. User_a creates own records & privilege escalation is blocked (8 tests)
-- ===========================================================================

SELECT lives_ok(
  $$
    INSERT INTO public.mock_sessions (
      id, user_id, jurisdiction_id, question_ids, status, expires_at
    ) VALUES (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '11111111-1111-4111-8111-111111111101',
      ARRAY['cccccccc-cccc-4ccc-8ccc-ccccccccccc7'::uuid],
      'in_progress',
      now() + interval '3 hours'
    )
  $$,
  'user_a can insert own mock_session'
);

SELECT lives_ok(
  $$
    INSERT INTO public.attempts (
      id, user_id, question_id, question_version, mock_session_id,
      selected_index, is_correct, time_ms, mode
    ) VALUES (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc7',
      2,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
      1, true, 4200, 'practice'
    )
  $$,
  'user_a can insert own attempt'
);

SELECT lives_ok(
  $$
    INSERT INTO public.srs_state (
      user_id, question_id, due_at, interval_days, ease_factor, repetitions
    ) VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc7',
      now() + interval '1 day', 1, 2.50, 1
    )
  $$,
  'user_a can insert own srs_state'
);

SELECT lives_ok(
  $$
    INSERT INTO public.drawing_submissions (
      id, user_id, exercise_id, graph, score, rubric_breakdown, time_ms, mode
    ) VALUES (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
      '{"nodes":[],"edges":[]}'::jsonb,
      95.00,
      '{"drainage_connection":50,"venting":45}'::jsonb,
      18000,
      'practice'
    )
  $$,
  'user_a can insert own drawing_submission'
);

SELECT lives_ok(
  $$
    INSERT INTO public.error_reports (
      user_id, question_id, category, description
    ) VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc7',
      'typo',
      'Minor phrasing feedback.'
    )
  $$,
  'user_a can insert own error_report'
);

SELECT lives_ok(
  $$
    UPDATE public.profiles
    SET display_name = 'Alex Journeyman'
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  $$,
  'user_a can update non-role fields on own profile'
);

SELECT throws_ok(
  $$
    UPDATE public.profiles
    SET role = 'admin'
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  $$,
  '42501',
  NULL,
  'user_a cannot escalate own profile role to admin'
);

SELECT throws_ok(
  $$
    INSERT INTO public.subscriptions (user_id, plan_tier, status)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'lifetime', 'active')
  $$,
  '42501',
  NULL,
  'regular user cannot insert subscriptions'
);

-- ===========================================================================
-- 7. Cross-user isolation checks as user_b (14 tests)
-- ===========================================================================

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.attempts WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid),
  0,
  'user_b sees 0 attempts belonging to user_a'
);

SELECT is(
  (SELECT count(*)::int FROM public.srs_state WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid),
  0,
  'user_b sees 0 srs_state rows belonging to user_a'
);

SELECT is(
  (SELECT count(*)::int FROM public.mock_sessions WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid),
  0,
  'user_b sees 0 mock_sessions belonging to user_a'
);

SELECT is(
  (SELECT count(*)::int FROM public.drawing_submissions WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid),
  0,
  'user_b sees 0 drawing_submissions belonging to user_a'
);

SELECT is(
  (SELECT count(*)::int FROM public.error_reports WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid),
  0,
  'user_b sees 0 error_reports belonging to user_a'
);

SELECT is(
  (SELECT count(*)::int FROM public.subscriptions WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid),
  0,
  'user_b sees 0 subscriptions belonging to user_a'
);

SELECT is(
  (SELECT count(*)::int FROM public.profiles WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid),
  0,
  'user_b sees 0 profile rows belonging to user_a'
);

SELECT throws_ok(
  $$
    INSERT INTO public.attempts (
      user_id, question_id, question_version, selected_index, is_correct, time_ms, mode
    ) VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc7',
      2, 1, false, 1000, 'practice'
    )
  $$,
  '42501',
  NULL,
  'user_b cannot insert attempt spoofing user_a user_id'
);

SELECT throws_ok(
  $$
    INSERT INTO public.srs_state (
      user_id, question_id, due_at, interval_days, ease_factor, repetitions
    ) VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc7',
      now(), 1, 2.50, 1
    )
  $$,
  '42501',
  NULL,
  'user_b cannot insert srs_state spoofing user_a user_id'
);

SELECT throws_ok(
  $$
    INSERT INTO public.drawing_submissions (
      user_id, exercise_id, graph, score, rubric_breakdown, time_ms, mode
    ) VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
      '{"nodes":[]}'::jsonb, 10.00, '{}'::jsonb, 500, 'learn'
    )
  $$,
  '42501',
  NULL,
  'user_b cannot insert drawing_submission spoofing user_a user_id'
);

SELECT throws_ok(
  $$
    INSERT INTO public.mock_sessions (
      user_id, jurisdiction_id, expires_at
    ) VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '11111111-1111-4111-8111-111111111101',
      now() + interval '1 hour'
    )
  $$,
  '42501',
  NULL,
  'user_b cannot insert mock_session spoofing user_a user_id'
);

-- Attempt cross-user UPDATE & DELETE as user_b (RLS should match 0 rows)
UPDATE public.attempts
SET is_correct = false
WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid;

DELETE FROM public.attempts
WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid;

DELETE FROM public.srs_state
WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid;

DELETE FROM public.drawing_submissions
WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.attempts WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid AND is_correct = true),
  1,
  'user_b could not update or delete user_a attempt'
);

SELECT is(
  (SELECT count(*)::int FROM public.srs_state WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid),
  1,
  'user_b could not delete user_a srs_state'
);

SELECT is(
  (SELECT count(*)::int FROM public.drawing_submissions WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid),
  1,
  'user_b could not delete user_a drawing_submission'
);

-- ===========================================================================
-- 8. Reviewer workflow, 8-criteria score validation & anon visibility (10 tests)
-- ===========================================================================

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.questions WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid),
  1,
  'reviewer can read draft questions for review'
);

SELECT is(
  (SELECT count(*)::int FROM public.servable_questions WHERE id IN (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc7'::uuid
  )),
  1,
  'servable_questions hides draft questions even from reviewers'
);

SELECT lives_ok(
  $$
    INSERT INTO public.question_reviews (
      question_id, question_version, reviewer_id, license_no, scores, verdict, comments
    ) VALUES (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      1,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      'TX-MP-40921',
      '{"technical_accuracy":4,"code_citation":5,"originality":5,"stem_clarity":3,"distractor_quality":4,"difficulty_calibration":4,"explanation_accuracy":4,"jurisdiction_fit":5}'::jsonb,
      'needs_revision',
      'Tighten stem wording.'
    )
  $$,
  'reviewer can submit valid 8-criteria review'
);

SELECT throws_ok(
  $$
    INSERT INTO public.question_reviews (
      question_id, question_version, reviewer_id, license_no, scores, verdict
    ) VALUES (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      1,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      'TX-MP-40921',
      '{"c1":4,"c2":5,"c3":5,"c4":3,"c5":4,"c6":4,"c7":4}'::jsonb,
      'needs_revision'
    )
  $$,
  '23514',
  NULL,
  'question_reviews rejects fewer than 8 scoring criteria'
);

SELECT throws_ok(
  $$
    INSERT INTO public.question_reviews (
      question_id, question_version, reviewer_id, license_no, scores, verdict
    ) VALUES (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      1,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      'TX-MP-40921',
      '{"c1":6,"c2":5,"c3":5,"c4":3,"c5":4,"c6":4,"c7":4,"c8":5}'::jsonb,
      'needs_revision'
    )
  $$,
  '23514',
  NULL,
  'question_reviews rejects score outside 1-5 range'
);

SELECT throws_ok(
  $$
    INSERT INTO public.question_reviews (
      question_id, question_version, reviewer_id, license_no, scores, verdict
    ) VALUES (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      1,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'FAKE-LIC',
      '{"c1":4,"c2":5,"c3":5,"c4":3,"c5":4,"c6":4,"c7":4,"c8":5}'::jsonb,
      'approved'
    )
  $$,
  '42501',
  NULL,
  'reviewer cannot spoof another user as reviewer_id'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT is((SELECT count(*)::int FROM public.jurisdictions), 3, 'anon can read seeded jurisdictions');
SELECT is((SELECT count(*)::int FROM public.topics), 10, 'anon can read seeded topics');
SELECT is(
  (SELECT count(*)::int FROM public.servable_questions WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc7'::uuid),
  1,
  'anon can read servable_questions'
);
SELECT is((SELECT count(*)::int FROM public.attempts), 0, 'anon sees 0 attempts');

SELECT * FROM finish();

ROLLBACK;
