import { describe, expect, it } from "vitest";
import {
  READINESS_MIN_ANSWERS_PER_TOPIC,
  computeDaysToExam,
  computeDueReviewsCount,
  computeNextMockSummary,
  computeReadiness,
  computeStreakDays,
  computeTopicsOrderedByWeakness,
  computeWeakestTopic,
} from "../metrics";
import { SEED_JURISDICTIONS, SEED_TOPICS } from "../seed-catalog";
import type { AttemptRecord } from "../types";

function makeAttempts(
  topicId: string,
  correctCount: number,
  wrongCount: number,
  day = "2026-11-20T12:00:00Z"
): AttemptRecord[] {
  const rows: AttemptRecord[] = [];
  for (let i = 0; i < correctCount; i++) {
    rows.push({
      id: `${topicId}-c-${i}`,
      question_id: `q-${topicId}-${i}`,
      topic_id: topicId,
      is_correct: true,
      time_ms: 4000,
      mode: "practice",
      attempted_at: day,
    });
  }
  for (let i = 0; i < wrongCount; i++) {
    rows.push({
      id: `${topicId}-w-${i}`,
      question_id: `q-${topicId}-w-${i}`,
      topic_id: topicId,
      is_correct: false,
      time_ms: 5000,
      mode: "practice",
      attempted_at: day,
    });
  }
  return rows;
}

describe("Bendline deterministic metrics", () => {
  it("keeps readiness null until every topic reaches 15 verified correct answers", () => {
    expect(computeReadiness(SEED_TOPICS, []).scorePct).toBeNull();

    // 15 attempts with only 12 correct stays locked
    const fifteenAttemptTwelveCorrect: AttemptRecord[] = SEED_TOPICS.flatMap(
      (topic) => makeAttempts(topic.id, 12, 3)
    );
    const lockedWithFifteenAttempts = computeReadiness(
      SEED_TOPICS,
      fifteenAttemptTwelveCorrect
    );
    expect(lockedWithFifteenAttempts.scorePct).toBeNull();
    expect(lockedWithFifteenAttempts.isUnlocked).toBe(false);
    expect(lockedWithFifteenAttempts.qualifiedTopicsCount).toBe(0);

    // 9 topics with 15 correct, 10th topic with 14 correct -> still null
    const almostReady: AttemptRecord[] = [];
    SEED_TOPICS.forEach((topic, index) => {
      const count = index === 9 ? 14 : READINESS_MIN_ANSWERS_PER_TOPIC;
      almostReady.push(...makeAttempts(topic.id, count, 0));
    });

    const partial = computeReadiness(SEED_TOPICS, almostReady);
    expect(partial.scorePct).toBeNull();
    expect(partial.isUnlocked).toBe(false);
    expect(partial.qualifiedTopicsCount).toBe(9);
    expect(partial.totalTopics).toBe(10);

    // Add 15th verified correct answer on final topic -> unlocks exact readiness score
    const unlockedAttempts = [
      ...almostReady,
      ...makeAttempts(SEED_TOPICS[9].id, 1, 0),
    ];
    const unlocked = computeReadiness(SEED_TOPICS, unlockedAttempts);
    expect(unlocked.isUnlocked).toBe(true);
    expect(unlocked.scorePct).toBe(100);
    expect(unlocked.qualifiedTopicsCount).toBe(10);
  });

  it("identifies weakest topic and reorders deterministically when accuracy shifts", () => {
    const t1 = SEED_TOPICS[0];
    const t2 = SEED_TOPICS[1];
    const initial = [
      ...makeAttempts(t1.id, 1, 1), // 50%
      ...makeAttempts(t2.id, 3, 1), // 75%
    ];

    expect(computeWeakestTopic(SEED_TOPICS, initial).topic.id).toBe(t1.id);

    const shifted = [
      ...initial,
      ...makeAttempts(t2.id, 0, 4), // 3/8 = 38%
    ];

    const ordered = computeTopicsOrderedByWeakness(SEED_TOPICS, shifted);
    expect(ordered[0].topic.id).toBe(t2.id);
    expect(ordered[0].accuracyPct).toBe(38);
    expect(ordered[1].topic.id).toBe(t1.id);
  });

  it("counts due SRS reviews accurately at boundary timestamps", () => {
    const now = new Date("2026-11-20T18:00:00Z");
    const count = computeDueReviewsCount(
      [
        { id: "1", question_id: "q1", due_at: "2026-11-20T17:59:59Z", interval_days: 1, repetitions: 1 },
        { id: "2", question_id: "q2", due_at: "2026-11-20T18:00:00Z", interval_days: 1, repetitions: 1 },
        { id: "3", question_id: "q3", due_at: "2026-11-20T18:00:01Z", interval_days: 2, repetitions: 2 },
      ],
      now
    );
    expect(count).toBe(2);
  });

  it("computes consecutive study streaks and days to exam safely in UTC", () => {
    const streak = computeStreakDays(
      [
        "2026-11-18T10:00:00Z",
        "2026-11-19T14:00:00Z",
        "2026-11-20T09:00:00Z",
        "2026-11-15T10:00:00Z",
      ],
      "2026-11-20"
    );
    expect(streak).toBe(3);

    expect(computeDaysToExam(null, "2026-11-20")).toBeNull();
    expect(computeDaysToExam("2026-12-05", "2026-11-20")).toBe(15);
    expect(computeDaysToExam("2026-11-10", "2026-11-20")).toBe(0);
  });

  it("builds jurisdiction-specific next mock exam summary", () => {
    const co = SEED_JURISDICTIONS[2];
    const summary = computeNextMockSummary(co, [
      {
        id: "m1",
        jurisdiction_id: co.id,
        status: "submitted",
        started_at: "2026-11-19T10:00:00Z",
        score_pct: 75,
        passed: true,
      },
    ]);
    expect(summary.questionCount).toBe(80);
    expect(summary.timeLimitMin).toBe(210);
    expect(summary.openBook).toBe(true);
    expect(summary.sessionNumber).toBe(2);
  });
});
