import { describe, expect, it } from "vitest";
import { POST as recomputeReadinessPost } from "@/app/api/progress/readiness/route";
import { computeAccuracyMetrics } from "@/lib/accuracy/metrics";
import {
  SEED_BLUEPRINTS,
  SEED_DRAWING_EXERCISES,
  SEED_DRILL_QUESTIONS,
  SEED_JURISDICTIONS,
  SEED_TOPICS,
} from "@/lib/domain/seed-catalog";
import type { AttemptRecord, MockSessionRecord } from "@/lib/domain/types";
import {
  AI_ERROR_TYPES,
  computeDrawingLabProgress,
  computeMistakeProfile,
  computeMockTrend,
  computeTopicMasteryVsBlueprint,
  formatQuestionReviewStamp,
  inferAttemptErrorType,
  recomputeReadinessFromAttempts,
} from "@/lib/progress/analytics";
import { selectAdaptiveQuestions } from "@/lib/srs";

describe("readiness recomputation from attempts (client + server API parity)", () => {
  it("stays null until every topic has >= 15 verified correct answers and matches server endpoint output once unlocked", async () => {
    const partialAttempts: AttemptRecord[] = SEED_TOPICS.flatMap(
      (topic, tIdx) =>
        Array.from({ length: 15 }, (_, idx) => ({
          id: `p-${tIdx}-${idx}`,
          question_id: SEED_DRILL_QUESTIONS[0].id,
          topic_id: topic.id,
          // 12/15 correct = below 15 verified correct threshold -> remains locked
          is_correct: idx < 12,
          time_ms: 4000,
          mode: "practice" as const,
          attempted_at: "2026-11-20T12:00:00Z",
        }))
    );

    const lockedLocal = recomputeReadinessFromAttempts(
      SEED_TOPICS,
      partialAttempts
    );
    expect(lockedLocal.scorePct).toBeNull();
    expect(lockedLocal.isUnlocked).toBe(false);
    expect(lockedLocal.qualifiedTopicsCount).toBe(0);

    const fullAttempts: AttemptRecord[] = SEED_TOPICS.flatMap((topic, tIdx) =>
      Array.from({ length: 18 }, (_, idx) => ({
        id: `f-${tIdx}-${idx}`,
        question_id: SEED_DRILL_QUESTIONS[0].id,
        topic_id: topic.id,
        // 15 verified correct + 3 wrong = 83% per topic
        is_correct: idx < 15,
        time_ms: 4500,
        mode: "practice" as const,
        attempted_at: "2026-11-20T12:00:00Z",
      }))
    );

    const unlockedLocal = recomputeReadinessFromAttempts(
      SEED_TOPICS,
      fullAttempts
    );
    expect(unlockedLocal.isUnlocked).toBe(true);
    expect(unlockedLocal.scorePct).toBe(83);
    expect(unlockedLocal.qualifiedTopicsCount).toBe(10);

    // Order-invariant check via POST /api/progress/readiness
    const reversedAttempts = [...fullAttempts].reverse();
    const res = await recomputeReadinessPost(
      new Request("http://localhost/api/progress/readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempts: reversedAttempts }),
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      readiness: { scorePct: number | null; qualifiedTopicsCount: number; totalAnswers: number };
    };
    expect(json.readiness.scorePct).toBe(83);
    expect(json.readiness.qualifiedTopicsCount).toBe(10);
    expect(json.readiness.totalAnswers).toBe(180);
  });
});

describe("progress analytics (blueprint, mock trend, mistake profile, drawing scores)", () => {
  const tx = SEED_JURISDICTIONS.find((j) => j.state === "TX")!;
  const co = SEED_JURISDICTIONS.find((j) => j.state === "CO")!;

  it("compares topic mastery against jurisdiction blueprint weights", () => {
    const attempts: AttemptRecord[] = [
      {
        id: "a1",
        question_id: SEED_DRILL_QUESTIONS[5].id,
        topic_id: SEED_TOPICS[5].id, // Sanitary Drainage 18% weight
        is_correct: false,
        time_ms: 6000,
        mode: "practice",
        error_type: "concept",
        attempted_at: "2026-11-20T12:00:00Z",
      },
    ];

    const rows = computeTopicMasteryVsBlueprint(
      SEED_TOPICS,
      SEED_BLUEPRINTS,
      attempts,
      tx.id
    );
    expect(rows).toHaveLength(SEED_TOPICS.length);
    const dwvRow = rows.find((r) => r.topic.id === SEED_TOPICS[5].id)!;
    expect(dwvRow.blueprintWeightPct).toBe(18);
    expect(dwvRow.answered).toBe(1);
    expect(dwvRow.masteryPct).toBeLessThan(50);
    expect(dwvRow.priorityGap).toBeGreaterThan(0);
  });

  it("computes chronological mock score trend and deltas", () => {
    const sessions: MockSessionRecord[] = [
      {
        id: "m2",
        jurisdiction_id: tx.id,
        status: "submitted",
        started_at: "2026-11-18T10:00:00Z",
        score_pct: 74,
        passed: true,
      },
      {
        id: "m1",
        jurisdiction_id: tx.id,
        status: "submitted",
        started_at: "2026-11-15T10:00:00Z",
        score_pct: 62,
        passed: false,
      },
    ];

    const trend = computeMockTrend(sessions, tx);
    expect(trend.points).toHaveLength(2);
    expect(trend.points[0].sessionNumber).toBe(1);
    expect(trend.points[0].scorePct).toBe(62);
    expect(trend.points[1].scorePct).toBe(74);
    expect(trend.points[1].deltaFromPrevious).toBe(12);
    expect(trend.latestDelta).toBe(12);
    expect(trend.bestScorePct).toBe(74);
  });

  it("profiles all 6 error_type categories and adapts lookup CTA to open_book", () => {
    const attempts: AttemptRecord[] = [
      {
        id: "e1",
        question_id: "q1",
        topic_id: SEED_TOPICS[0].id,
        is_correct: false,
        time_ms: 5000,
        mode: "practice",
        error_type: "arithmetic",
        attempted_at: "2026-11-20T12:00:00Z",
      },
      {
        id: "e2",
        question_id: "q2",
        topic_id: SEED_TOPICS[1].id,
        is_correct: false,
        time_ms: 5000,
        mode: "practice",
        error_type: "lookup",
        attempted_at: "2026-11-20T12:01:00Z",
      },
    ];

    const closedProfile = computeMistakeProfile(attempts, tx);
    expect(closedProfile.items).toHaveLength(AI_ERROR_TYPES.length);
    expect(
      closedProfile.items.find((i) => i.errorType === "lookup")?.fixHref
    ).toBe("/practice?errorType=lookup");

    const openProfile = computeMistakeProfile(attempts, co);
    expect(
      openProfile.items.find((i) => i.errorType === "lookup")?.fixHref
    ).toBe("/navigate");
    expect(
      openProfile.items.find((i) => i.errorType === "arithmetic")?.fixHref
    ).toBe("/practice?errorType=arithmetic");
    expect(openProfile.totalTaggedMistakes).toBe(2);
  });

  it("prioritizes targeted error_type questions in selectAdaptiveQuestions", () => {
    const taggedId = "70000000-0000-4000-8000-000000000004";
    const attempts: AttemptRecord[] = [
      {
        id: "err-arith-1",
        question_id: taggedId,
        topic_id: "22222222-2222-4222-8222-222222222204",
        is_correct: false,
        time_ms: 6000,
        mode: "practice",
        error_type: "arithmetic",
        attempted_at: "2026-11-20T12:00:00Z",
      },
    ];

    const selected = selectAdaptiveQuestions({
      mode: "weak_spots",
      jurisdiction: tx,
      topics: SEED_TOPICS,
      questions: SEED_DRILL_QUESTIONS,
      attempts,
      srsStates: [],
      errorTypeFilter: "arithmetic",
      count: 5,
    });

    expect(selected.length).toBeGreaterThan(0);
    expect(selected[0].question.id).toBe(taggedId);
    expect(new Set(selected.map((s) => s.question.id)).size).toBe(
      selected.length
    );
  });

  it("computes drawing-lab progress summary and infers fallback error types", () => {
    const summary = computeDrawingLabProgress(
      [
        {
          id: "sub-1",
          exercise_id: SEED_DRAWING_EXERCISES[0].id,
          score: 70,
          mode: "practice",
          time_ms: 35000,
          created_at: "2026-11-19T12:00:00Z",
        },
        {
          id: "sub-2",
          exercise_id: SEED_DRAWING_EXERCISES[0].id,
          score: 90,
          mode: "exam",
          time_ms: 42000,
          created_at: "2026-11-20T12:00:00Z",
        },
      ],
      SEED_DRAWING_EXERCISES
    );

    expect(summary.totalSubmissions).toBe(2);
    expect(summary.averageScorePct).toBe(80);
    expect(summary.bestScorePct).toBe(90);
    expect(summary.latestScorePct).toBe(90);
    expect(summary.recentSubmissions[0].exerciseTitle).toBe(
      SEED_DRAWING_EXERCISES[0].title
    );

    expect(inferAttemptErrorType({ type: "calc" }, 5000)).toBe("arithmetic");
    expect(inferAttemptErrorType({ type: "lookup" }, 5000)).toBe("lookup");
    expect(inferAttemptErrorType({ type: "mcq" }, 1500)).toBe("misread");
    expect(inferAttemptErrorType({ type: "mcq" }, 8000)).toBe("concept");
  });
});

describe("public /accuracy metrics & question review stamps", () => {
  it("formats review stamps as 'Reviewed [month year] — [edition]'", () => {
    expect(
      formatQuestionReviewStamp("2026-11-12T00:00:00Z", "IPC", "2021")
    ).toBe("Reviewed November 2026 — IPC 2021");
    expect(formatQuestionReviewStamp(null, "UPC", "2024")).toBe(
      "Reviewed Pending — UPC 2024"
    );
  });

  it("computes published counts, licensed %, median review age, error rate/1000, and jurisdiction verification", () => {
    const sample = SEED_DRILL_QUESTIONS.slice(0, 4).map((q, idx) => ({
      ...q,
      reviewed_at:
        idx === 0
          ? "2026-11-18T00:00:00Z" // 2 days before 2026-11-20
          : idx === 1
            ? "2026-11-14T00:00:00Z" // 6 days
            : idx === 2
              ? "2026-11-10T00:00:00Z" // 10 days
              : "2026-11-06T00:00:00Z", // 14 days
      reviewer_license_no: idx < 3 ? "TX-MP-41892" : null,
    }));

    const snapshot = computeAccuracyMetrics({
      questions: sample,
      confirmedErrorCount: 3,
      totalAttemptsCount: 2500,
      jurisdictions: SEED_JURISDICTIONS,
      nowIso: "2026-11-20T00:00:00Z",
    });

    expect(snapshot.publishedQuestionsCount).toBe(4);
    expect(snapshot.licensedReviewedCount).toBe(3);
    expect(snapshot.pctReviewedByLicensed).toBe(75);
    // Median of [2, 6, 10, 14] = (6 + 10) / 2 = 8 days
    expect(snapshot.medianReviewAgeDays).toBe(8);
    expect(snapshot.confirmedErrorRatePer1000).toBe(1.2);
    expect(snapshot.jurisdictionVerifications).toHaveLength(3);
    expect(snapshot.jurisdictionVerifications.map((j) => j.state)).toEqual([
      "CA",
      "CO",
      "TX",
    ]);

    const zeroAttemptSnap = computeAccuracyMetrics({
      questions: SEED_DRILL_QUESTIONS,
      confirmedErrorCount: 0,
      totalAttemptsCount: 0,
      jurisdictions: SEED_JURISDICTIONS,
      includeReviewRevisions: true,
      nowIso: "2026-11-20T00:00:00Z",
    });
    expect(zeroAttemptSnap.publishedQuestionsCount).toBe(30);
    expect(zeroAttemptSnap.pctReviewedByLicensed).toBe(100);
    expect(zeroAttemptSnap.confirmedErrorRatePer1000).toBe(0);
    expect(zeroAttemptSnap.items.length).toBeGreaterThanOrEqual(31);
    expect(zeroAttemptSnap.items[0].criteria).toHaveLength(8);
    expect(zeroAttemptSnap.items[0].versionHistory.length).toBeGreaterThanOrEqual(1);
    expect(zeroAttemptSnap.errata.length).toBeGreaterThanOrEqual(2);
    expect(zeroAttemptSnap.errata.some((e) => e.status === "resolved")).toBe(true);
  });
});
