-- Timed Mock Exam Sessions state columns & jurisdiction blueprint weights

ALTER TABLE public.mock_sessions
  ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(answers) = 'object'),
  ADD COLUMN IF NOT EXISTS flagged_question_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS current_index integer NOT NULL DEFAULT 0
    CHECK (current_index >= 0),
  ADD COLUMN IF NOT EXISTS correct_count integer
    CHECK (correct_count IS NULL OR correct_count >= 0),
  ADD COLUMN IF NOT EXISTS total_questions integer NOT NULL DEFAULT 0
    CHECK (total_questions >= 0),
  ADD COLUMN IF NOT EXISTS pass_pct_snapshot numeric(5,2),
  ADD COLUMN IF NOT EXISTS open_book_snapshot boolean NOT NULL DEFAULT false;

-- Seed 100%-normalized topic blueprint weights for TX, CA, and CO jurisdictions
WITH weights(topic_id, weight_pct) AS (
  VALUES
    ('22222222-2222-4222-8222-222222222201'::uuid, 8.00::numeric(5,2)),
    ('22222222-2222-4222-8222-222222222202'::uuid, 10.00::numeric(5,2)),
    ('22222222-2222-4222-8222-222222222203'::uuid, 9.00::numeric(5,2)),
    ('22222222-2222-4222-8222-222222222204'::uuid, 14.00::numeric(5,2)),
    ('22222222-2222-4222-8222-222222222205'::uuid, 8.00::numeric(5,2)),
    ('22222222-2222-4222-8222-222222222206'::uuid, 18.00::numeric(5,2)),
    ('22222222-2222-4222-8222-222222222207'::uuid, 13.00::numeric(5,2)),
    ('22222222-2222-4222-8222-222222222208'::uuid, 8.00::numeric(5,2)),
    ('22222222-2222-4222-8222-222222222209'::uuid, 6.00::numeric(5,2)),
    ('22222222-2222-4222-8222-222222222210'::uuid, 6.00::numeric(5,2))
),
jurisdictions_seed(jurisdiction_id) AS (
  VALUES
    ('11111111-1111-4111-8111-111111111101'::uuid),
    ('11111111-1111-4111-8111-111111111102'::uuid),
    ('11111111-1111-4111-8111-111111111103'::uuid)
)
INSERT INTO public.blueprints (jurisdiction_id, topic_id, weight_pct)
SELECT j.jurisdiction_id, w.topic_id, w.weight_pct
FROM jurisdictions_seed j
CROSS JOIN weights w
ON CONFLICT (jurisdiction_id, topic_id) DO NOTHING;
