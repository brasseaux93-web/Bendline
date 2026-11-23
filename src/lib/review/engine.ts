import {
  HARD_GATE_KEYS,
  HARD_GATE_MIN_SCORE,
  RUBRIC_CRITERIA,
  type DbReviewVerdict,
  type ReviewItemKind,
  type ReviewItemStatus,
  type ReviewRecord,
  type ReviewSubmissionInput,
  type ReviewVerdictAction,
  type ReviewableDrawingExercise,
  type ReviewableQuestion,
  type RubricScores,
  reviewSubmissionSchema,
} from "./types";

export const DEFAULT_RUBRIC_SCORES: RubricScores = {
  key_accuracy: 4,
  distractors: 4,
  edition_fit: 4,
  clarity: 4,
  source_support: 4,
  blueprint_difficulty: 4,
  explanation: 4,
  language_fairness: 4,
};

export interface HardGateEvaluation {
  passed: boolean;
  failures: string[];
}

export function evaluateHardGates(params: {
  scores: RubricScores;
  itemType: "mcq" | "calc" | "lookup" | "scenario" | "drawing";
  calcIndependentlyVerified: boolean;
}): HardGateEvaluation {
  const failures: string[] = [];

  for (const key of HARD_GATE_KEYS) {
    const score = params.scores[key];
    if (score < HARD_GATE_MIN_SCORE) {
      const meta = RUBRIC_CRITERIA.find((c) => c.key === key);
      failures.push(
        `${meta?.label ?? key} must be >= ${HARD_GATE_MIN_SCORE} to approve (currently ${score}).`
      );
    }
  }

  if (params.itemType === "calc" && !params.calcIndependentlyVerified) {
    failures.push(
      "Calculation questions require calc_independently_verified to be checked before approval."
    );
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

export function mapVerdictToStatus(
  verdict: ReviewVerdictAction
): ReviewItemStatus {
  switch (verdict) {
    case "approve":
      return "published";
    case "revise":
      return "revise";
    case "reject":
      return "archived";
  }
}

export function mapVerdictToDbVerdict(
  verdict: ReviewVerdictAction
): DbReviewVerdict {
  switch (verdict) {
    case "approve":
      return "approved";
    case "revise":
      return "needs_revision";
    case "reject":
      return "rejected";
  }
}

export function validateReviewSubmission(raw: unknown):
  | { ok: true; data: ReviewSubmissionInput }
  | { ok: false; errors: string[] } {
  const parsed = reviewSubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) =>
        i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message
      ),
    };
  }

  const data = parsed.data;
  const errors: string[] = [];

  if (data.verdict === "approve") {
    const gates = evaluateHardGates({
      scores: data.scores,
      itemType: data.itemType,
      calcIndependentlyVerified: data.calcIndependentlyVerified,
    });
    if (!gates.passed) {
      errors.push(...gates.failures);
    }
  }

  if (data.verdict === "revise" && data.comments.trim().length < 5) {
    errors.push(
      "Returning an item for revision requires reviewer comments explaining what to fix."
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data };
}

export function buildReviewRecord(
  input: ReviewSubmissionInput,
  options: { id?: string; reviewedAt?: string } = {}
): ReviewRecord {
  return {
    id: options.id ?? crypto.randomUUID(),
    item_kind: input.itemKind,
    item_id: input.itemId,
    item_title: input.itemTitle,
    item_version: input.itemVersion,
    item_type: input.itemType,
    topic_id: input.topicId,
    code_family: input.codeFamily,
    edition: input.edition,
    reviewer_id: input.reviewerId,
    reviewer_name: input.reviewerName,
    license_no: input.licenseNo,
    reviewed_at: options.reviewedAt ?? new Date().toISOString(),
    scores: { ...input.scores },
    calc_independently_verified: input.calcIndependentlyVerified,
    verdict: input.verdict,
    db_verdict: mapVerdictToDbVerdict(input.verdict),
    resulting_status: mapVerdictToStatus(input.verdict),
    comments: input.comments,
    suggested_fix: input.suggestedFix,
  };
}

export function applyReviewToQuestion(
  question: ReviewableQuestion,
  input: ReviewSubmissionInput,
  options: { id?: string; reviewedAt?: string } = {}
): { updatedQuestion: ReviewableQuestion; review: ReviewRecord } {
  const validation = validateReviewSubmission(input);
  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }

  const review = buildReviewRecord(validation.data, options);
  const nextStatus = review.resulting_status;

  const updatedQuestion: ReviewableQuestion = {
    ...question,
    status: nextStatus,
    reviewer_id:
      nextStatus === "published" ? review.reviewer_id : question.reviewer_id,
    reviewed_at:
      nextStatus === "published" ? review.reviewed_at : question.reviewed_at,
    reviewer_license_no:
      nextStatus === "published"
        ? review.license_no
        : question.reviewer_license_no,
    latest_review_comments: review.comments || null,
    latest_suggested_fix: review.suggested_fix || null,
  };

  return { updatedQuestion, review };
}

export function applyReviewToDrawingExercise(
  exercise: ReviewableDrawingExercise,
  input: ReviewSubmissionInput,
  options: { id?: string; reviewedAt?: string } = {}
): { updatedExercise: ReviewableDrawingExercise; review: ReviewRecord } {
  const validation = validateReviewSubmission(input);
  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }

  const review = buildReviewRecord(validation.data, options);
  const nextStatus = review.resulting_status;

  const updatedExercise: ReviewableDrawingExercise = {
    ...exercise,
    status: nextStatus,
    reviewer_id:
      nextStatus === "published" ? review.reviewer_id : exercise.reviewer_id,
    reviewed_at:
      nextStatus === "published" ? review.reviewed_at : exercise.reviewed_at,
    reviewer_license_no:
      nextStatus === "published"
        ? review.license_no
        : exercise.reviewer_license_no,
    latest_review_comments: review.comments || null,
    latest_suggested_fix: review.suggested_fix || null,
  };

  return { updatedExercise, review };
}

/**
 * Publishing a new version of a question strictly increments version and
 * invalidates any prior approval (resets status to 'draft' and clears review stamps).
 */
export function createNewQuestionVersion(
  question: ReviewableQuestion,
  patch: Partial<
    Pick<
      ReviewableQuestion,
      | "stem"
      | "options"
      | "correct_index"
      | "explanation_seed"
      | "code_ref"
      | "difficulty"
      | "edition"
    >
  >
): ReviewableQuestion {
  return {
    ...question,
    ...patch,
    version: question.version + 1,
    status: "draft",
    reviewer_id: null,
    reviewed_at: null,
    reviewer_license_no: null,
  };
}

/**
 * Publishing a new version of a drawing exercise strictly increments version
 * and invalidates any prior approval.
 */
export function createNewDrawingExerciseVersion(
  exercise: ReviewableDrawingExercise,
  patch: Partial<
    Pick<
      ReviewableDrawingExercise,
      "title" | "prompt_md" | "scoring_rubric" | "edition"
    >
  >
): ReviewableDrawingExercise {
  return {
    ...exercise,
    ...patch,
    version: exercise.version + 1,
    status: "draft",
    reviewer_id: null,
    reviewed_at: null,
    reviewer_license_no: null,
  };
}

export function isItemApprovedForCurrentVersion(
  item: Pick<
    ReviewableQuestion | ReviewableDrawingExercise,
    "id" | "status" | "version"
  >,
  itemKind: ReviewItemKind,
  reviews: ReviewRecord[]
): boolean {
  if (item.status !== "published") return false;
  return reviews.some(
    (r) =>
      r.item_kind === itemKind &&
      r.item_id === item.id &&
      r.item_version === item.version &&
      r.verdict === "approve"
  );
}

export interface ReviewQueueEntry {
  kind: ReviewItemKind;
  id: string;
  topicId: string;
  title: string;
  subtitle: string;
  itemType: "mcq" | "calc" | "lookup" | "scenario" | "drawing";
  codeFamily: "IPC" | "UPC";
  edition: string;
  status: ReviewItemStatus;
  version: number;
  latestComments: string | null;
}

export function buildReviewQueueEntries(params: {
  questions: ReviewableQuestion[];
  drawingExercises: ReviewableDrawingExercise[];
  topicId?: string | null;
  kindFilter?: "all" | ReviewItemKind;
  statusFilter?: "queue" | "published" | "archived" | "all";
}): ReviewQueueEntry[] {
  const {
    questions,
    drawingExercises,
    topicId = null,
    kindFilter = "all",
    statusFilter = "queue",
  } = params;

  const matchesStatus = (status: ReviewItemStatus) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "queue") {
      return status === "draft" || status === "revise" || status === "flagged";
    }
    return status === statusFilter;
  };

  const entries: ReviewQueueEntry[] = [];

  if (kindFilter === "all" || kindFilter === "question") {
    for (const q of questions) {
      if (topicId && q.topic_id !== topicId) continue;
      if (!matchesStatus(q.status)) continue;
      entries.push({
        kind: "question",
        id: q.id,
        topicId: q.topic_id,
        title: q.stem,
        subtitle: `${q.code_ref} · Diff ${q.difficulty}/5`,
        itemType: q.type,
        codeFamily: q.code_family,
        edition: q.edition,
        status: q.status,
        version: q.version,
        latestComments: q.latest_review_comments,
      });
    }
  }

  if (kindFilter === "all" || kindFilter === "drawing_exercise") {
    for (const ex of drawingExercises) {
      if (topicId && ex.topic_id !== topicId) continue;
      if (!matchesStatus(ex.status)) continue;
      entries.push({
        kind: "drawing_exercise",
        id: ex.id,
        topicId: ex.topic_id,
        title: ex.title,
        subtitle: `Isometric ${ex.pipe_system.toUpperCase()} · ${ex.fixtures.length} fixtures`,
        itemType: "drawing",
        codeFamily: ex.code_family,
        edition: ex.edition,
        status: ex.status,
        version: ex.version,
        latestComments: ex.latest_review_comments,
      });
    }
  }

  const statusOrder: Record<ReviewItemStatus, number> = {
    revise: 0,
    flagged: 1,
    draft: 2,
    reviewed: 3,
    published: 4,
    archived: 5,
  };

  return entries.sort((a, b) => {
    const sDiff = statusOrder[a.status] - statusOrder[b.status];
    if (sDiff !== 0) return sDiff;
    return a.id.localeCompare(b.id);
  });
}

function escapeCsvCell(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  let str = value === null || value === undefined ? "" : String(value);
  // Neutralize spreadsheet formula injection characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const REVIEW_CSV_HEADERS = [
  "review_id",
  "item_kind",
  "item_id",
  "item_version",
  "item_title",
  "topic_id",
  "code_family",
  "edition",
  "reviewer_id",
  "reviewer_name",
  "license_no",
  "reviewed_at",
  "verdict",
  "resulting_status",
  "calc_independently_verified",
  "key_accuracy",
  "distractors",
  "edition_fit",
  "clarity",
  "source_support",
  "blueprint_difficulty",
  "explanation",
  "language_fairness",
  "comments",
  "suggested_fix",
] as const;

export function exportReviewsToCsv(reviews: ReviewRecord[]): string {
  const lines: string[] = [REVIEW_CSV_HEADERS.join(",")];

  for (const r of reviews) {
    const row = [
      r.id,
      r.item_kind,
      r.item_id,
      r.item_version,
      r.item_title,
      r.topic_id,
      r.code_family,
      r.edition,
      r.reviewer_id,
      r.reviewer_name,
      r.license_no,
      r.reviewed_at,
      r.verdict,
      r.resulting_status,
      r.calc_independently_verified,
      r.scores.key_accuracy,
      r.scores.distractors,
      r.scores.edition_fit,
      r.scores.clarity,
      r.scores.source_support,
      r.scores.blueprint_difficulty,
      r.scores.explanation,
      r.scores.language_fairness,
      r.comments,
      r.suggested_fix,
    ];
    lines.push(row.map(escapeCsvCell).join(","));
  }

  return lines.join("\r\n");
}
