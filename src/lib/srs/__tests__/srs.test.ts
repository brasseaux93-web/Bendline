import { describe, expect, it } from "vitest";
import {
  SEED_BLUEPRINTS,
  SEED_DRILL_QUESTIONS,
  SEED_JURISDICTIONS,
  SEED_TOPICS,
} from "@/lib/domain/seed-catalog";
import type { AttemptRecord, ServableQuestion, SrsStateRecord } from "@/lib/domain/types";
import {
  FREE_TIER_DAILY_LIMIT,
  checkFreeTierAllowance,
  computeNextDueAt,
  computeRecencyWeightedMastery,
  computeSm2Update,
  computeTargetDifficulty,
  filterServableQuestionsForJurisdiction,
  getLocalDateKey,
  isCardDue,
  selectAdaptiveQuestions,
} from "../index";

function makeAttempt(
  id: string,
  questionId: string,
  topicId: string,
  isCorrect: boolean,
  attemptedAt: string
): AttemptRecord {
  return {
    id,
    question_id: questionId,
    topic_id: topicId,
    is_correct: isCorrect,
    time_ms: 5000,
    mode: "practice",
    attempted_at: attemptedAt,
  };
}

describe("Bendline /lib/srs adaptive scheduler & SM-2 engine", () => {
  const tx = SEED_JURISDICTIONS[0]; // TX IPC 2021
  const ca = SEED_JURISDICTIONS[1]; // CA UPC 2024

  it("never repeats a question within a session across all adaptive modes", () => {
    const attempts: AttemptRecord[] = [
      makeAttempt("a1", SEED_DRILL_QUESTIONS[0].id, SEED_DRILL_QUESTIONS[0].topic_id, false, "2026-11-20T10:00:00Z"),
      makeAttempt("a2", SEED_DRILL_QUESTIONS[1].id, SEED_DRILL_QUESTIONS[1].topic_id, true, "2026-11-20T10:05:00Z"),
    ];
    const srsStates: SrsStateRecord[] = [
      {
        id: "s1",
        question_id: SEED_DRILL_QUESTIONS[0].id,
        due_at: "2026-11-19T00:00:00Z",
        interval_days: 1,
        repetitions: 0,
        ease_factor: 2.3,
        lapses: 1,
      },
    ];

    for (const mode of ["daily_12", "topic_drill", "weak_spots", "missed_review"] as const) {
      const scheduled = selectAdaptiveQuestions({
        mode,
        jurisdiction: tx,
        topics: SEED_TOPICS,
        questions: SEED_DRILL_QUESTIONS,
        attempts,
        srsStates,
        blueprints: SEED_BLUEPRINTS,
        topicId: SEED_TOPICS[6].id,
        count: 12,
        nowIso: "2026-11-20T18:00:00Z",
        timeZone: "America/Los_Angeles",
      });

      const ids = scheduled.map((s) => s.question.id);
      expect(new Set(ids).size).toBe(ids.length);
      if (mode === "daily_12") {
        expect(ids.length).toBe(12);
      }
    }

    // Also respects excludeQuestionIds
    const excludedId = SEED_DRILL_QUESTIONS[0].id;
    const withoutExcluded = selectAdaptiveQuestions({
      mode: "daily_12",
      jurisdiction: tx,
      topics: SEED_TOPICS,
      questions: SEED_DRILL_QUESTIONS,
      attempts,
      srsStates,
      excludeQuestionIds: [excludedId],
      count: 12,
      nowIso: "2026-11-20T18:00:00Z",
    });
    expect(withoutExcluded.some((s) => s.question.id === excludedId)).toBe(false);
  });

  it("progresses SM-2 ease and intervals (1d -> 6d -> round(6 * ease)) and resets on miss", () => {
    const r1 = computeSm2Update(null, {
      isCorrect: true,
      quality: 5,
      reviewedAt: "2026-11-20T14:00:00Z",
      timeZone: "UTC",
    });
    expect(r1.repetitions).toBe(1);
    expect(r1.interval_days).toBe(1);
    expect(r1.ease_factor).toBe(2.6);
    expect(r1.due_at).toBe("2026-11-21T00:00:00.000Z");

    const r2 = computeSm2Update(r1, {
      isCorrect: true,
      quality: 4,
      reviewedAt: "2026-11-21T14:00:00Z",
      timeZone: "UTC",
    });
    expect(r2.repetitions).toBe(2);
    expect(r2.interval_days).toBe(6);
    expect(r2.due_at).toBe("2026-11-27T00:00:00.000Z");

    const r3 = computeSm2Update(r2, {
      isCorrect: true,
      quality: 4,
      reviewedAt: "2026-11-27T14:00:00Z",
      timeZone: "UTC",
    });
    expect(r3.repetitions).toBe(3);
    expect(r3.interval_days).toBe(Math.round(6 * r3.ease_factor));

    // Wrong answer resets repetitions to 0, interval to 1, and increments lapses
    const missed = computeSm2Update(r3, {
      isCorrect: false,
      reviewedAt: "2026-12-12T10:00:00Z",
      timeZone: "UTC",
    });
    expect(missed.repetitions).toBe(0);
    expect(missed.interval_days).toBe(1);
    expect(missed.lapses).toBe(1);
    expect(missed.ease_factor).toBeGreaterThanOrEqual(1.3);
  });

  it("handles local timezone midnight boundaries accurately when computing due dates", () => {
    // 2026-11-21T03:00:00Z is 2026-11-20 19:00 PST in America/Los_Angeles (UTC-8)
    const lateEveningUtc = "2026-11-21T03:00:00Z";
    expect(getLocalDateKey(lateEveningUtc, "America/Los_Angeles")).toBe("2026-11-20");
    expect(getLocalDateKey(lateEveningUtc, "UTC")).toBe("2026-11-21");

    const dueLa = computeNextDueAt(lateEveningUtc, 1, "America/Los_Angeles");
    // Next LA calendar day (2026-11-21 00:00 PST) = 2026-11-21T08:00:00.000Z
    expect(dueLa).toBe("2026-11-21T08:00:00.000Z");

    // 23:59 PST on Nov 20 is NOT yet due in LA
    expect(isCardDue(dueLa, "2026-11-21T07:59:59Z", "America/Los_Angeles")).toBe(false);
    // 00:00 PST on Nov 21 IS due in LA
    expect(isCardDue(dueLa, "2026-11-21T08:00:00Z", "America/Los_Angeles")).toBe(true);
  });

  it("switches strictly to the active jurisdiction code family and excludes unservable questions", () => {
    const draftOrRejected: ServableQuestion[] = [
      ...SEED_DRILL_QUESTIONS,
      {
        ...SEED_DRILL_QUESTIONS[15],
        id: "70000000-0000-4000-8000-000000000998",
        status: "draft",
        review_verdict: "approved",
      },
      {
        ...SEED_DRILL_QUESTIONS[15],
        id: "70000000-0000-4000-8000-000000000999",
        status: "published",
        review_verdict: "rejected",
      },
    ];

    const txEligible = filterServableQuestionsForJurisdiction(draftOrRejected, tx);
    expect(txEligible.every((q) => q.code_family === "IPC" && q.edition === "2021")).toBe(true);

    const caEligible = filterServableQuestionsForJurisdiction(draftOrRejected, ca);
    expect(caEligible.every((q) => q.code_family === "UPC" && q.edition === "2024")).toBe(true);
    expect(caEligible.some((q) => q.id.endsWith("0998") || q.id.endsWith("0999"))).toBe(false);

    const caSession = selectAdaptiveQuestions({
      mode: "daily_12",
      jurisdiction: ca,
      topics: SEED_TOPICS,
      questions: draftOrRejected,
      attempts: [],
      srsStates: [],
      count: 12,
    });
    expect(caSession).toHaveLength(12);
    expect(caSession.every((s) => s.question.code_family === "UPC")).toBe(true);
  });

  it("achieves ~50% due / ~35% new-weakest / ~15% blueprint mix and steps difficulty above 80% over last 10", () => {
    const ipcQuestions = SEED_DRILL_QUESTIONS.filter((q) => q.code_family === "IPC");
    // Mark first 6 IPC questions as due
    const srsStates: SrsStateRecord[] = ipcQuestions.slice(0, 6).map((q, i) => ({
      id: `srs-${i}`,
      question_id: q.id,
      due_at: "2026-11-19T00:00:00Z",
      interval_days: 1,
      repetitions: 1,
      ease_factor: 2.5,
      lapses: 0,
    }));

    // 9/10 correct over last 10 (> 80%) steps difficulty from 2 -> 3
    const attempts: AttemptRecord[] = Array.from({ length: 10 }, (_, idx) =>
      makeAttempt(
        `att-${idx}`,
        ipcQuestions[idx % 6].id,
        ipcQuestions[idx % 6].topic_id,
        idx !== 0,
        `2026-11-20T10:${String(idx).padStart(2, "0")}:00Z`
      )
    );

    expect(computeTargetDifficulty(attempts, 2)).toBe(3);

    // Recency-weighted mastery prioritizes newer attempts
    const topicId = ipcQuestions[0].topic_id;
    const mastery = computeRecencyWeightedMastery(topicId, [
      makeAttempt("old-fail", "q1", topicId, false, "2026-11-10T10:00:00Z"),
      makeAttempt("new-pass", "q1", topicId, true, "2026-11-20T10:00:00Z"),
    ]);
    expect(mastery).toBeGreaterThan(0.5);

    const mix = selectAdaptiveQuestions({
      mode: "daily_12",
      jurisdiction: tx,
      topics: SEED_TOPICS,
      questions: SEED_DRILL_QUESTIONS,
      attempts,
      srsStates,
      blueprints: SEED_BLUEPRINTS,
      count: 12,
      nowIso: "2026-11-20T18:00:00Z",
    });

    const dueCount = mix.filter((m) => m.sourceBucket === "due").length;
    const newWeakCount = mix.filter((m) => m.sourceBucket === "new_weakest").length;
    const blueprintCount = mix.filter((m) => m.sourceBucket === "blueprint").length;

    expect(dueCount).toBe(6);
    expect(newWeakCount).toBe(4);
    expect(blueprintCount).toBe(2);
  });

  it("enforces the 12/day free-tier cap by local calendar day", () => {
    const twelveToday: AttemptRecord[] = Array.from(
      { length: FREE_TIER_DAILY_LIMIT },
      (_, idx) =>
        makeAttempt(
          `free-${idx}`,
          SEED_DRILL_QUESTIONS[0].id,
          SEED_DRILL_QUESTIONS[0].topic_id,
          true,
          "2026-11-20T15:00:00Z"
        )
    );

    const blocked = checkFreeTierAllowance({
      planTier: "free",
      attempts: twelveToday,
      nowIso: "2026-11-20T20:00:00Z",
      timeZone: "America/Los_Angeles",
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);

    const nextDay = checkFreeTierAllowance({
      planTier: "free",
      attempts: twelveToday,
      nowIso: "2026-11-21T08:05:00Z",
      timeZone: "America/Los_Angeles",
    });
    expect(nextDay.allowed).toBe(true);
    expect(nextDay.remaining).toBe(12);

    const paid = checkFreeTierAllowance({
      planTier: "pro_monthly",
      attempts: twelveToday,
      nowIso: "2026-11-20T20:00:00Z",
      timeZone: "America/Los_Angeles",
    });
    expect(paid.allowed).toBe(true);
  });
});
