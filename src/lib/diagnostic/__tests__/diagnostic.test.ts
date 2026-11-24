import { describe, expect, it } from "vitest";
import {
  SEED_DRILL_QUESTIONS,
  SEED_JURISDICTIONS,
  SEED_TOPICS,
} from "@/lib/domain/seed-catalog";
import {
  computeDiagnosticSummary,
  convertDiagnosticToMigrationRecords,
  selectDiagnosticQuestions,
  type AnonymousDiagnosticState,
} from "../index";

describe("Free no-account diagnostic & migration engine", () => {
  const tx = SEED_JURISDICTIONS.find((j) => j.state === "TX")!;
  const ca = SEED_JURISDICTIONS.find((j) => j.state === "CA")!;
  const co = SEED_JURISDICTIONS.find((j) => j.state === "CO")!;

  it("selects 10 edition-aligned questions covering all 10 domains for TX, CA, and CO", () => {
    for (const jur of [tx, ca, co]) {
      const selected = selectDiagnosticQuestions(
        jur,
        SEED_TOPICS,
        SEED_DRILL_QUESTIONS,
        10
      );
      expect(selected).toHaveLength(10);
      expect(new Set(selected.map((q) => q.topic_id)).size).toBe(10);
      expect(new Set(selected.map((q) => q.id)).size).toBe(10);
      for (const q of selected) {
        expect(q.code_family).toBe(jur.code_family);
        expect(q.edition).toBe(jur.edition);
      }
    }
  });

  it("computes deterministic diagnostic summary and 6-category miss breakdown", () => {
    const questions = selectDiagnosticQuestions(
      tx,
      SEED_TOPICS,
      SEED_DRILL_QUESTIONS,
      10
    );

    const state: AnonymousDiagnosticState = {
      session_id: "diag-1",
      jurisdiction_id: tx.id,
      question_ids: questions.map((q) => q.id),
      current_index: 10,
      answers: questions.map((q, idx) => ({
        id: `ans-${idx}`,
        question_id: q.id,
        topic_id: q.topic_id,
        selected_index: idx < 7 ? q.correct_index : (q.correct_index + 1) % 4,
        is_correct: idx < 7,
        time_ms: 4000,
        error_type: idx < 7 ? null : idx === 7 ? "arithmetic" : "concept",
        answered_at: "2026-11-23T12:00:00Z",
      })),
      elapsed_ms: 40_000,
      started_at: "2026-11-23T11:59:00Z",
      completed_at: "2026-11-23T12:00:00Z",
      migrated_at: null,
    };

    const summary = computeDiagnosticSummary(state, SEED_TOPICS, tx);
    expect(summary.totalQuestions).toBe(10);
    expect(summary.answeredCount).toBe(10);
    expect(summary.correctCount).toBe(7);
    expect(summary.scorePct).toBe(70);
    expect(summary.passed).toBe(true);
    expect(summary.domainResults).toHaveLength(10);
    expect(summary.mistakeCounts.arithmetic).toBe(1);
    expect(summary.mistakeCounts.concept).toBe(2);
    expect(summary.weakestTopics).toHaveLength(3);
  });

  it("converts anonymous diagnostic answers into idempotent AttemptRecord and SrsStateRecord items", () => {
    const state: AnonymousDiagnosticState = {
      session_id: "diag-2",
      jurisdiction_id: ca.id,
      question_ids: ["q1", "q2"],
      current_index: 2,
      answers: [
        {
          id: "anon-a1",
          question_id: "q1",
          topic_id: SEED_TOPICS[0].id,
          selected_index: 1,
          is_correct: true,
          time_ms: 3500,
          error_type: null,
          answered_at: "2026-11-23T10:00:00Z",
        },
        {
          id: "anon-a2",
          question_id: "q2",
          topic_id: SEED_TOPICS[1].id,
          selected_index: 0,
          is_correct: false,
          time_ms: 8200,
          error_type: "lookup",
          answered_at: "2026-11-23T10:01:00Z",
        },
      ],
      elapsed_ms: 11_700,
      started_at: "2026-11-23T09:59:48Z",
      completed_at: "2026-11-23T10:01:00Z",
      migrated_at: null,
    };

    const { attempts, srsStates } = convertDiagnosticToMigrationRecords(
      state,
      "UTC"
    );

    expect(attempts).toHaveLength(2);
    expect(attempts[0].id).toBe("anon-a1");
    expect(attempts[1].error_type).toBe("lookup");

    expect(srsStates).toHaveLength(2);
    expect(srsStates[0].repetitions).toBe(1);
    expect(srsStates[1].lapses).toBe(1);
    expect(srsStates[1].interval_days).toBe(1);
  });
});
