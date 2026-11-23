import { beforeEach, describe, expect, it } from "vitest";
import { GET as exportCsvGet } from "@/app/api/admin/review/export/route";
import {
  GET as reviewQueueGet,
  PATCH as reviewQueuePatch,
  POST as reviewQueuePost,
} from "@/app/api/admin/review/route";
import {
  DEFAULT_RUBRIC_SCORES,
  RUBRIC_CRITERIA,
  SEED_REVIEW_DRAWING_EXERCISES,
  SEED_REVIEW_QUESTIONS,
  applyReviewToDrawingExercise,
  applyReviewToQuestion,
  buildReviewQueueEntries,
  createNewDrawingExerciseVersion,
  createNewQuestionVersion,
  evaluateHardGates,
  exportReviewsToCsv,
  isItemApprovedForCurrentVersion,
  validateReviewSubmission,
} from "../index";
import { resetMemoryReviewStore } from "../server-store";

describe("editorial 8-criteria rubric & hard gates", () => {
  it("defines exactly 8 criteria and enforces key_accuracy, distractors, and edition_fit >= 4", () => {
    expect(RUBRIC_CRITERIA).toHaveLength(8);

    for (const gateKey of ["key_accuracy", "distractors", "edition_fit"] as const) {
      const gateResult = evaluateHardGates({
        scores: { ...DEFAULT_RUBRIC_SCORES, [gateKey]: 3 },
        itemType: "mcq",
        calcIndependentlyVerified: false,
      });
      expect(gateResult.passed).toBe(false);
      expect(gateResult.failures.length).toBe(1);
    }

    const passingMcq = evaluateHardGates({
      scores: { ...DEFAULT_RUBRIC_SCORES },
      itemType: "mcq",
      calcIndependentlyVerified: false,
    });
    expect(passingMcq.passed).toBe(true);
  });

  it("blocks calc approval without calc_independently_verified and passes once checked", () => {
    const blocked = evaluateHardGates({
      scores: { ...DEFAULT_RUBRIC_SCORES },
      itemType: "calc",
      calcIndependentlyVerified: false,
    });
    expect(blocked.passed).toBe(false);

    const passed = evaluateHardGates({
      scores: { ...DEFAULT_RUBRIC_SCORES },
      itemType: "calc",
      calcIndependentlyVerified: true,
    });
    expect(passed.passed).toBe(true);

    // Non-hard-gate criteria below 4 do not block approval when gates >= 4
    const nonGateLow = validateReviewSubmission({
      itemKind: "question",
      itemId: "q1",
      itemTitle: "Test",
      itemVersion: 1,
      itemType: "mcq",
      topicId: "t1",
      codeFamily: "IPC",
      edition: "2021",
      reviewerId: "rev-1",
      reviewerName: "Marcus Vance",
      licenseNo: "CO-MP-20914",
      scores: { ...DEFAULT_RUBRIC_SCORES, clarity: 3, language_fairness: 3 },
      calcIndependentlyVerified: false,
      verdict: "approve",
      comments: "",
      suggestedFix: "",
    });
    expect(nonGateLow.ok).toBe(true);
  });
});

describe("verdict status transitions, version invalidation & drawing_exercises parity", () => {
  it("transitions approve -> published, revise -> revise, reject -> archived, and invalidates on new version", () => {
    const calcDraft = SEED_REVIEW_QUESTIONS[0];
    const approved = applyReviewToQuestion(calcDraft, {
      itemKind: "question",
      itemId: calcDraft.id,
      itemTitle: calcDraft.stem,
      itemVersion: calcDraft.version,
      itemType: "calc",
      topicId: calcDraft.topic_id,
      codeFamily: calcDraft.code_family,
      edition: calcDraft.edition,
      reviewerId: "rev-1",
      reviewerName: "Marcus Vance",
      licenseNo: "CO-MP-20914",
      scores: { ...DEFAULT_RUBRIC_SCORES },
      calcIndependentlyVerified: true,
      verdict: "approve",
      comments: "Checked math manually.",
      suggestedFix: "",
    });

    expect(approved.updatedQuestion.status).toBe("published");
    expect(approved.updatedQuestion.reviewed_at).toBeTruthy();
    expect(
      isItemApprovedForCurrentVersion(approved.updatedQuestion, "question", [
        approved.review,
      ])
    ).toBe(true);

    // Bump version => prior approval invalidated
    const v2 = createNewQuestionVersion(approved.updatedQuestion, {
      stem: "Updated v2 calculation stem.",
    });
    expect(v2.version).toBe(2);
    expect(v2.status).toBe("draft");
    expect(v2.reviewed_at).toBeNull();
    expect(
      isItemApprovedForCurrentVersion(v2, "question", [approved.review])
    ).toBe(false);

    // Drawing exercise uses identical workflow (revise -> reject -> new version)
    const ex = SEED_REVIEW_DRAWING_EXERCISES[0];
    const revised = applyReviewToDrawingExercise(ex, {
      itemKind: "drawing_exercise",
      itemId: ex.id,
      itemTitle: ex.title,
      itemVersion: ex.version,
      itemType: "drawing",
      topicId: ex.topic_id,
      codeFamily: ex.code_family,
      edition: ex.edition,
      reviewerId: "rev-1",
      reviewerName: "Marcus Vance",
      licenseNo: "CO-MP-20914",
      scores: { ...DEFAULT_RUBRIC_SCORES, distractors: 3 },
      calcIndependentlyVerified: false,
      verdict: "revise",
      comments: "Clarify fixture vent tie-in constraint.",
      suggestedFix: "Add cleanout prompt detail.",
    });
    expect(revised.updatedExercise.status).toBe("revise");

    const rejected = applyReviewToDrawingExercise(revised.updatedExercise, {
      itemKind: "drawing_exercise",
      itemId: ex.id,
      itemTitle: ex.title,
      itemVersion: revised.updatedExercise.version,
      itemType: "drawing",
      topicId: ex.topic_id,
      codeFamily: ex.code_family,
      edition: ex.edition,
      reviewerId: "rev-1",
      reviewerName: "Marcus Vance",
      licenseNo: "CO-MP-20914",
      scores: { ...DEFAULT_RUBRIC_SCORES, edition_fit: 2 },
      calcIndependentlyVerified: false,
      verdict: "reject",
      comments: "Outdated edition scope.",
      suggestedFix: "",
    });
    expect(rejected.updatedExercise.status).toBe("archived");

    const exV2 = createNewDrawingExerciseVersion(rejected.updatedExercise, {
      title: "Re-scoped v2 Exercise",
    });
    expect(exV2.version).toBe(2);
    expect(exV2.status).toBe("draft");
  });

  it("filters review queue entries by topic and item kind", () => {
    const entries = buildReviewQueueEntries({
      questions: SEED_REVIEW_QUESTIONS,
      drawingExercises: SEED_REVIEW_DRAWING_EXERCISES,
      topicId: "22222222-2222-4222-8222-222222222206",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(SEED_REVIEW_QUESTIONS[0].id);
  });
});

describe("CSV export & API route enforcement", () => {
  beforeEach(() => {
    resetMemoryReviewStore();
  });

  it("exports CSV with proper escaping and formula-injection neutralization", () => {
    const calcDraft = SEED_REVIEW_QUESTIONS[0];
    const { review } = applyReviewToQuestion(calcDraft, {
      itemKind: "question",
      itemId: calcDraft.id,
      itemTitle: "Test, \"Quoted\" Question",
      itemVersion: 1,
      itemType: "calc",
      topicId: calcDraft.topic_id,
      codeFamily: "IPC",
      edition: "2021",
      reviewerId: "rev-1",
      reviewerName: "Marcus Vance",
      licenseNo: "CO-MP-20914",
      scores: { ...DEFAULT_RUBRIC_SCORES },
      calcIndependentlyVerified: true,
      verdict: "approve",
      comments: "=SUM(A1:A2) potential injection, checked",
      suggestedFix: "",
    });

    const csv = exportReviewsToCsv([review]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("key_accuracy,distractors,edition_fit");
    expect(lines[1]).toContain('"=SUM(A1:A2) potential injection, checked"'.replace("=SUM", "'=SUM"));
    expect(lines[1]).toContain('"Test, ""Quoted"" Question"');
  });

  it("enforces hard gates on POST, handles version bump & role promotion on PATCH, and exports text/csv", async () => {
    const initialRes = await reviewQueueGet();
    expect(initialRes.status).toBe(200);
    const initialJson = (await initialRes.json()) as {
      questions: typeof SEED_REVIEW_QUESTIONS;
    };
    const calcQ = initialJson.questions.find((q) => q.type === "calc")!;

    // 1. Rejects calc approval when calc_independently_verified is false
    const badPost = await reviewQueuePost(
      new Request("http://localhost/api/admin/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemKind: "question",
          itemId: calcQ.id,
          itemTitle: calcQ.stem,
          itemVersion: calcQ.version,
          itemType: calcQ.type,
          topicId: calcQ.topic_id,
          codeFamily: calcQ.code_family,
          edition: calcQ.edition,
          reviewerId: "a1",
          reviewerName: "Admin",
          licenseNo: "TX-MP-41892",
          scores: DEFAULT_RUBRIC_SCORES,
          calcIndependentlyVerified: false,
          verdict: "approve",
          comments: "",
          suggestedFix: "",
        }),
      })
    );
    expect(badPost.status).toBe(400);

    // 2. Approves calc question when calc_independently_verified is true
    const goodPost = await reviewQueuePost(
      new Request("http://localhost/api/admin/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemKind: "question",
          itemId: calcQ.id,
          itemTitle: calcQ.stem,
          itemVersion: calcQ.version,
          itemType: calcQ.type,
          topicId: calcQ.topic_id,
          codeFamily: calcQ.code_family,
          edition: calcQ.edition,
          reviewerId: "a1",
          reviewerName: "Admin",
          licenseNo: "TX-MP-41892",
          scores: DEFAULT_RUBRIC_SCORES,
          calcIndependentlyVerified: true,
          verdict: "approve",
          comments: "Verified 72 * 0.25 = 18.",
          suggestedFix: "",
        }),
      })
    );
    expect(goodPost.status).toBe(200);
    const goodJson = (await goodPost.json()) as {
      updatedItem: { status: string; version: number };
    };
    expect(goodJson.updatedItem.status).toBe("published");

    // 3. New version invalidates approval
    const v2Res = await reviewQueuePatch(
      new Request("http://localhost/api/admin/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "new_version",
          itemKind: "question",
          itemId: calcQ.id,
          titleOrStem: "Updated 4-inch branch slope check",
        }),
      })
    );
    expect(v2Res.status).toBe(200);
    const v2Json = (await v2Res.json()) as {
      updatedItem: { status: string; version: number };
    };
    expect(v2Json.updatedItem.version).toBe(2);
    expect(v2Json.updatedItem.status).toBe("draft");

    // 4. Promote user role to reviewer
    const roleRes = await reviewQueuePatch(
      new Request("http://localhost/api/admin/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_role",
          targetUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
          role: "reviewer",
          licenseNo: "CA-C36-99102",
        }),
      })
    );
    expect(roleRes.status).toBe(200);
    const roleJson = (await roleRes.json()) as {
      reviewer: { role: string; license_no: string };
    };
    expect(roleJson.reviewer.role).toBe("reviewer");
    expect(roleJson.reviewer.license_no).toBe("CA-C36-99102");

    // 5. Export reviews CSV
    const csvRes = await exportCsvGet();
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get("content-type")).toContain("text/csv");
    const csvBody = await csvRes.text();
    expect(csvBody).toContain("Verified 72 * 0.25 = 18.");
  });
});
