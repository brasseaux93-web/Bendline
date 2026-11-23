import { beforeEach, describe, expect, it } from "vitest";
import {
  SEED_BLUEPRINTS,
  SEED_DRILL_QUESTIONS,
  SEED_JURISDICTIONS,
  SEED_TOPICS,
} from "@/lib/domain/seed-catalog";
import type { ServableQuestion } from "@/lib/domain/types";
import {
  InsufficientServableQuestionsError,
  allocateTopicCountsByBlueprint,
  composeMockExamQuestions,
  computeServerRemainingMs,
  stripAnswersForClient,
} from "../engine";
import {
  MockSessionExpiredError,
  clearMemoryMockStore,
  createMockSessionOnServer,
  getMockSessionOnServer,
  patchMockSessionOnServer,
  submitMockSessionOnServer,
} from "../server-store";

function buildSyntheticBank(
  codeFamily: "IPC" | "UPC",
  edition: string,
  perTopicCount: number
): ServableQuestion[] {
  const items: ServableQuestion[] = [];
  for (const topic of SEED_TOPICS) {
    for (let i = 0; i < perTopicCount; i += 1) {
      items.push({
        id: `90000000-${String(topic.display_order).padStart(4, "0")}-4000-8000-${String(i).padStart(12, "0")}`,
        stem: `Synthetic ${codeFamily} ${topic.slug} item ${i + 1}`,
        type: "mcq",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correct_index: i % 4,
        topic_id: topic.id,
        difficulty: ((i % 5) + 1),
        code_family: codeFamily,
        edition,
        code_ref: `${codeFamily} Sec. ${topic.display_order}.${i + 1}`,
        explanation_seed: `Explanation for ${topic.slug} item ${i + 1}`,
        version: 1,
        status: "published",
        review_verdict: "approved",
      });
    }
  }
  return items;
}

describe("Bendline timed mock exam blueprint, secrecy, resume, and server grading", () => {
  const tx = SEED_JURISDICTIONS[0]; // TX: 100 Qs, 180 min, 70%, open_book=false
  const co = SEED_JURISDICTIONS[2]; // CO: 80 Qs, 210 min, 70%, open_book=true

  beforeEach(() => {
    clearMemoryMockStore();
  });

  it("allocates topic counts within one question of blueprint weights and sums exactly", () => {
    for (const total of [100, 80, 73, 15]) {
      const alloc = allocateTopicCountsByBlueprint(
        total,
        SEED_BLUEPRINTS,
        tx.id,
        SEED_TOPICS
      );

      let sum = 0;
      for (const bp of SEED_BLUEPRINTS.filter((b) => b.jurisdiction_id === tx.id)) {
        const assigned = alloc.get(bp.topic_id) ?? 0;
        const exact = (total * bp.weight_pct) / 100;
        expect(Math.abs(assigned - exact)).toBeLessThan(1);
        sum += assigned;
      }
      expect(sum).toBe(total);
    }
  });

  it("composes exact weighted mock exam from servable bank and fails loudly when strict bank is short", () => {
    const fullIpcBank = buildSyntheticBank("IPC", "2021", 20); // 200 servable questions
    const composedTx = composeMockExamQuestions({
      jurisdiction: tx,
      topics: SEED_TOPICS,
      questions: fullIpcBank,
      blueprints: SEED_BLUEPRINTS,
      strictBankSize: true,
    });

    expect(composedTx.questions).toHaveLength(100);
    expect(composedTx.isScaledPreview).toBe(false);
    expect(new Set(composedTx.questions.map((q) => q.id)).size).toBe(100);

    // Fails loudly when strict bank does not meet jurisdiction question_count
    expect(() =>
      composeMockExamQuestions({
        jurisdiction: tx,
        topics: SEED_TOPICS,
        questions: SEED_DRILL_QUESTIONS,
        blueprints: SEED_BLUEPRINTS,
        strictBankSize: true,
      })
    ).toThrowError(InsufficientServableQuestionsError);
  });

  it("strictly preserves answer secrecy before submission", async () => {
    const startIso = "2026-11-20T18:00:00.000Z";
    const bank = buildSyntheticBank("IPC", "2021", 20);

    const created = await createMockSessionOnServer({
      jurisdictionId: tx.id,
      strictBankSize: true,
      userIdOverride: "test-user-secrecy",
      nowIso: startIso,
      customQuestions: bank,
    });

    // Neither create nor get nor patch may expose correct_index, explanation_seed, or result
    expect(created.session.result).toBeNull();
    expect(created.session.open_book).toBe(false);
    expect(created.session.allowed_refs).toEqual([]);

    for (const q of created.questions) {
      expect("correct_index" in q).toBe(false);
      expect("explanation_seed" in q).toBe(false);
    }

    const stripped = stripAnswersForClient(bank[0]);
    expect(Object.keys(stripped)).not.toContain("correct_index");
    expect(Object.keys(stripped)).not.toContain("explanation_seed");

    const patched = await patchMockSessionOnServer({
      sessionId: created.session.id,
      userIdOverride: "test-user-secrecy",
      answers: {
        [created.questions[0].id]: { selected_index: 2, time_ms: 8500 },
      },
      currentIndex: 1,
      nowIso: "2026-11-20T18:01:00.000Z",
    });

    expect(patched.session.result).toBeNull();
    expect(
      "is_correct" in patched.session.answers[created.questions[0].id]
    ).toBe(false);
  });

  it("supports resume with server-authoritative countdown, rejects late edits, and grades server-side", async () => {
    const startIso = "2026-11-20T18:00:00.000Z";
    const bank = buildSyntheticBank("IPC", "2021", 20);

    const created = await createMockSessionOnServer({
      jurisdictionId: co.id, // 80 Qs, 210 min, 70%, open_book=true
      strictBankSize: true,
      userIdOverride: "test-user-resume",
      nowIso: startIso,
      customQuestions: bank,
    });

    expect(created.session.open_book).toBe(true);
    expect(created.session.allowed_refs).toContain(
      "2021 International Plumbing Code (IPC)"
    );
    expect(created.remaining_ms).toBe(210 * 60_000);

    // Auto-save 60 correct answers and flag question 3
    const bankById = new Map(bank.map((q) => [q.id, q]));
    const savedBatch: Record<string, { selected_index: number; time_ms: number }> = {};
    created.questions.forEach((q, idx) => {
      const full = bankById.get(q.id)!;
      savedBatch[q.id] = {
        selected_index: idx < 60 ? full.correct_index : (full.correct_index + 1) % 4,
        time_ms: 10_000,
      };
    });

    await patchMockSessionOnServer({
      sessionId: created.session.id,
      userIdOverride: "test-user-resume",
      answers: savedBatch,
      flaggedQuestionIds: [created.questions[2].id],
      currentIndex: 14,
      nowIso: "2026-11-20T18:45:00.000Z",
    });

    // Simulate refresh / reconnect 45 minutes after start
    const resumed = await getMockSessionOnServer({
      sessionId: created.session.id,
      userIdOverride: "test-user-resume",
      nowIso: "2026-11-20T19:00:00.000Z",
      customQuestions: bank,
    });

    expect(resumed.session.current_index).toBe(14);
    expect(resumed.session.flagged_question_ids).toEqual([
      created.questions[2].id,
    ]);
    expect(Object.keys(resumed.session.answers)).toHaveLength(80);
    expect(resumed.remaining_ms).toBe(150 * 60_000);
    expect(resumed.session.result).toBeNull();
    expect(
      computeServerRemainingMs(
        resumed.session.expires_at,
        "2026-11-20T22:00:00.000Z"
      )
    ).toBe(0);

    // Reject late answer PATCH after expires_at
    await expect(
      patchMockSessionOnServer({
        sessionId: created.session.id,
        userIdOverride: "test-user-resume",
        answers: {
          [created.questions[0].id]: { selected_index: 0, time_ms: 2000 },
        },
        nowIso: "2026-11-20T22:00:00.000Z",
      })
    ).rejects.toThrowError(MockSessionExpiredError);

    // Submit and verify server-side grading (60/80 = 75% >= 70% pass)
    const graded = await submitMockSessionOnServer({
      sessionId: created.session.id,
      userIdOverride: "test-user-resume",
      nowIso: "2026-11-20T19:05:00.000Z",
      customQuestions: bank,
    });

    expect(graded.result.score_pct).toBe(75);
    expect(graded.result.passed).toBe(true);
    expect(graded.result.correct_count).toBe(60);
    expect(graded.result.total_questions).toBe(80);
    expect(graded.result.avg_time_per_question_ms).toBe(10_000);
    expect(graded.result.topic_breakdown.length).toBeGreaterThan(0);
    expect(graded.result.weakest_topic_slugs.length).toBeGreaterThan(0);
    expect(graded.result.question_review[0].explanation_seed).toBeTruthy();
  });
});
