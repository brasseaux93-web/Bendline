import { describe, expect, it } from "vitest";
import { SEED_JURISDICTIONS } from "@/lib/domain/seed-catalog";
import {
  SEED_OUTLINE_NODES,
  buildOutlineTree,
  buildTabbingGuide,
  completeForegroundTimer,
  computeChapterLookupMetrics,
  computeMedianMs,
  computeOverallNavMetrics,
  createForegroundTimer,
  evaluateNavAttempt,
  filterOutlineForJurisdiction,
  generateNavDrillQueue,
  getElapsedForegroundMs,
  isNavigationTrainerEnabled,
  pauseForBackground,
  resumeFromBackground,
} from "../index";

describe("jurisdiction open_book gating", () => {
  it("disables navigation trainer for closed-book states (TX, CA) and enables for CO", () => {
    const tx = SEED_JURISDICTIONS.find((j) => j.state === "TX")!;
    const ca = SEED_JURISDICTIONS.find((j) => j.state === "CA")!;
    const co = SEED_JURISDICTIONS.find((j) => j.state === "CO")!;

    expect(tx.open_book).toBe(false);
    expect(ca.open_book).toBe(false);
    expect(co.open_book).toBe(true);

    expect(isNavigationTrainerEnabled(tx)).toBe(false);
    expect(isNavigationTrainerEnabled(ca)).toBe(false);
    expect(isNavigationTrainerEnabled(co)).toBe(true);
  });
});

describe("foreground-only stopwatch", () => {
  it("excludes all backgrounded intervals across multiple visibility switches", () => {
    let timer = createForegroundTimer(1_000);
    // Active from 1_000 -> 4_200 = 3_200 ms
    timer = pauseForBackground(timer, 4_200);
    expect(timer.isPaused).toBe(true);
    expect(timer.pauseCount).toBe(1);
    expect(getElapsedForegroundMs(timer, 50_000)).toBe(3_200);

    // Idempotent duplicate pause while hidden does not alter elapsed or pauseCount
    timer = pauseForBackground(timer, 9_000);
    expect(timer.pauseCount).toBe(1);
    expect(getElapsedForegroundMs(timer, 12_000)).toBe(3_200);

    // Resume at 25_000 -> 20_800 ms backgrounded excluded
    timer = resumeFromBackground(timer, 25_000);
    expect(timer.isPaused).toBe(false);
    expect(getElapsedForegroundMs(timer, 26_500)).toBe(4_700);

    // Second background interval 27_000 -> 90_000 excluded
    timer = pauseForBackground(timer, 27_000);
    timer = resumeFromBackground(timer, 90_000);
    // Idempotent resume while active does not reset start clock
    timer = resumeFromBackground(timer, 91_000);

    const finished = completeForegroundTimer(timer, 91_800);
    // Expected active = 3_200 + 2_000 + 1_800 = 7_000 ms
    expect(finished.elapsedMs).toBe(7_000);
  });

  it("clamps elapsed time cleanly >= 0 even with clock skew", () => {
    const timer = createForegroundTimer(10_000);
    expect(getElapsedForegroundMs(timer, 9_500)).toBe(0);
    const finished = completeForegroundTimer(timer, 9_500);
    expect(finished.elapsedMs).toBe(0);
  });
});

describe("outline drills and index-term generation", () => {
  const co = SEED_JURISDICTIONS.find((j) => j.state === "CO")!;
  const coNodes = filterOutlineForJurisdiction(SEED_OUTLINE_NODES, co);

  it("builds ordered chapters and resolves child section/table nodes", () => {
    const tree = buildOutlineTree(coNodes);
    expect(tree.chapters.length).toBeGreaterThanOrEqual(6);
    for (const group of tree.chapters) {
      expect(group.chapter.node_kind).toBe("chapter");
      expect(group.children.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("generates non-repeating where_is_it, timed_find, and 4-choice index_term drills", () => {
    const whereQ = generateNavDrillQueue(coNodes, "where_is_it", {
      count: 6,
      seed: 7,
    });
    expect(whereQ).toHaveLength(6);
    expect(new Set(whereQ.map((q) => q.targetNode.id)).size).toBe(6);
    expect(whereQ.every((q) => q.targetTimeMs === null)).toBe(true);

    const timedQ = generateNavDrillQueue(coNodes, "timed_find", {
      count: 5,
      seed: 7,
      targetTimeOverrideMs: 12_000,
    });
    expect(timedQ).toHaveLength(5);
    expect(timedQ.every((q) => q.targetTimeMs === 12_000)).toBe(true);

    const indexQ = generateNavDrillQueue(coNodes, "index_term", {
      count: 6,
      seed: 13,
    });
    expect(indexQ).toHaveLength(6);
    for (const q of indexQ) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.correctOptionIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctOptionIndex).toBeLessThan(4);
      expect(q.targetNode.index_terms).toContain(
        q.options![q.correctOptionIndex!]
      );
    }
  });

  it("filters drills strictly when chapterId is selected", () => {
    const firstChapter = coNodes.find((n) => n.node_kind === "chapter")!;
    const scopedQ = generateNavDrillQueue(coNodes, "where_is_it", {
      count: 10,
      chapterId: firstChapter.id,
    });
    expect(scopedQ.length).toBeGreaterThanOrEqual(2);
    expect(scopedQ.every((q) => q.chapterNode.id === firstChapter.id)).toBe(
      true
    );
  });
});

describe("accuracy, median lookup metrics & tabbing guide", () => {
  const co = SEED_JURISDICTIONS.find((j) => j.state === "CO")!;
  const coNodes = filterOutlineForJurisdiction(SEED_OUTLINE_NODES, co);

  it("computes first-try accuracy and met_target_time accurately", () => {
    const prompt = generateNavDrillQueue(coNodes, "timed_find", {
      count: 1,
      targetTimeOverrideMs: 15_000,
    })[0];

    const firstTryFast = evaluateNavAttempt({
      jurisdictionId: co.id,
      prompt,
      wrongGuesses: 0,
      elapsedMs: 9_400,
    });
    expect(firstTryFast.first_try_correct).toBe(true);
    expect(firstTryFast.attempt_count).toBe(1);
    expect(firstTryFast.met_target_time).toBe(true);

    const multiTrySlow = evaluateNavAttempt({
      jurisdictionId: co.id,
      prompt,
      wrongGuesses: 2,
      elapsedMs: 18_200,
    });
    expect(multiTrySlow.first_try_correct).toBe(false);
    expect(multiTrySlow.attempt_count).toBe(3);
    expect(multiTrySlow.met_target_time).toBe(false);
  });

  it("computes exact odd/even medians and per-chapter breakdown metrics", () => {
    expect(computeMedianMs([])).toBeNull();
    expect(computeMedianMs([4_000])).toBe(4_000);
    expect(computeMedianMs([12_000, 3_000, 7_000])).toBe(7_000);
    expect(computeMedianMs([10_000, 2_000, 6_000, 8_000])).toBe(7_000);

    const ch1 = coNodes.find((n) => n.node_kind === "chapter")!;
    const child1 = coNodes.find((n) => n.parent_id === ch1.id)!;

    const attempts = [
      {
        id: "a1",
        jurisdiction_id: co.id,
        outline_node_id: child1.id,
        chapter_node_id: ch1.id,
        drill_type: "where_is_it" as const,
        elapsed_ms: 4_000,
        target_time_ms: null,
        met_target_time: null,
        first_try_correct: true,
        attempt_count: 1,
        completed_at: "2026-11-20T10:00:00Z",
      },
      {
        id: "a2",
        jurisdiction_id: co.id,
        outline_node_id: child1.id,
        chapter_node_id: ch1.id,
        drill_type: "timed_find" as const,
        elapsed_ms: 10_000,
        target_time_ms: 15_000,
        met_target_time: true,
        first_try_correct: false,
        attempt_count: 2,
        completed_at: "2026-11-20T10:01:00Z",
      },
    ];

    const perChapter = computeChapterLookupMetrics(coNodes, attempts, co.id);
    const ch1Metric = perChapter.find((c) => c.chapter.id === ch1.id)!;
    expect(ch1Metric.totalAttempts).toBe(2);
    expect(ch1Metric.medianMs).toBe(7_000);
    expect(ch1Metric.firstTryAccuracyPct).toBe(50);

    const overall = computeOverallNavMetrics(attempts, co.id);
    expect(overall.totalAttempts).toBe(2);
    expect(overall.medianMs).toBe(7_000);
    expect(overall.firstTryAccuracyPct).toBe(50);
    expect(overall.targetHitRatePct).toBe(100);
  });

  it("includes state bulletin verification notice and disclaimer in tabbing guide", () => {
    const guide = buildTabbingGuide(co, coNodes);
    expect(guide.openBook).toBe(true);
    expect(guide.bulletinUrl).toBe(co.bulletin_url);
    expect(guide.bulletinVerificationNotice.toLowerCase()).toContain("bulletin");
    expect(guide.disclaimer).toBe("Verify against your adopted code. Not legal advice.");
    expect(guide.recommendedTabs.length).toBeGreaterThanOrEqual(5);
  });
});
