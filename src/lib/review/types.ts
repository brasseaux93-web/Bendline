import { z } from "zod";
import type { CodeFamily, PipeSystem, UserRole } from "@/lib/domain/types";
import type { DrawNode } from "@/lib/draw/graph";

export const RUBRIC_CRITERIA = [
  {
    key: "key_accuracy",
    label: "Key Accuracy",
    description:
      "Correct option / scoring rubric strictly matches adopted code principles with zero ambiguity.",
    isHardGate: true,
    minForApproval: 4,
  },
  {
    key: "distractors",
    label: "Distractors",
    description:
      "Plausible field-realistic wrong choices or drawing traps without trick wording.",
    isHardGate: true,
    minForApproval: 4,
  },
  {
    key: "edition_fit",
    label: "Edition Fit",
    description:
      "Accurately scoped to tagged code family (IPC/UPC), edition year, and state amendments.",
    isHardGate: true,
    minForApproval: 4,
  },
  {
    key: "clarity",
    label: "Clarity",
    description:
      "Stem and prompt are concise, concrete, and unambiguous under timed exam pressure.",
    isHardGate: false,
    minForApproval: 1,
  },
  {
    key: "source_support",
    label: "Source Support",
    description:
      "Code pointer / section reference points cleanly to the governing chapter/table without verbatim copying.",
    isHardGate: false,
    minForApproval: 1,
  },
  {
    key: "blueprint_difficulty",
    label: "Blueprint / Difficulty",
    description:
      "Topic mapping and difficulty (1–5) align with Journeyman licensing blueprint depth.",
    isHardGate: false,
    minForApproval: 1,
  },
  {
    key: "explanation",
    label: "Explanation",
    description:
      "Explanation seed states why the right answer works and clarifies common field pitfalls.",
    isHardGate: false,
    minForApproval: 1,
  },
  {
    key: "language_fairness",
    label: "Language Fairness",
    description:
      "Plain trade terminology free of regional jargon bias, double negatives, or unnecessary verbosity.",
    isHardGate: false,
    minForApproval: 1,
  },
] as const;

export type RubricCriterionKey = (typeof RUBRIC_CRITERIA)[number]["key"];

export const HARD_GATE_KEYS: readonly RubricCriterionKey[] = [
  "key_accuracy",
  "distractors",
  "edition_fit",
] as const;

export const HARD_GATE_MIN_SCORE = 4;

const criterionScoreSchema = z.number().int().min(1).max(5);

export const rubricScoresSchema = z.object({
  key_accuracy: criterionScoreSchema,
  distractors: criterionScoreSchema,
  edition_fit: criterionScoreSchema,
  clarity: criterionScoreSchema,
  source_support: criterionScoreSchema,
  blueprint_difficulty: criterionScoreSchema,
  explanation: criterionScoreSchema,
  language_fairness: criterionScoreSchema,
});
export type RubricScores = z.infer<typeof rubricScoresSchema>;

export const reviewItemKindSchema = z.enum(["question", "drawing_exercise"]);
export type ReviewItemKind = z.infer<typeof reviewItemKindSchema>;

export const reviewItemStatusSchema = z.enum([
  "draft",
  "revise",
  "reviewed",
  "published",
  "flagged",
  "archived",
]);
export type ReviewItemStatus = z.infer<typeof reviewItemStatusSchema>;

export const reviewVerdictActionSchema = z.enum(["approve", "revise", "reject"]);
export type ReviewVerdictAction = z.infer<typeof reviewVerdictActionSchema>;

export const dbReviewVerdictSchema = z.enum([
  "approved",
  "needs_revision",
  "rejected",
]);
export type DbReviewVerdict = z.infer<typeof dbReviewVerdictSchema>;

export const reviewSubmissionSchema = z.object({
  itemKind: reviewItemKindSchema,
  itemId: z.string().min(1),
  itemTitle: z.string().min(1),
  itemVersion: z.number().int().min(1),
  itemType: z.enum(["mcq", "calc", "lookup", "scenario", "drawing"]),
  topicId: z.string().min(1),
  codeFamily: z.enum(["IPC", "UPC"]),
  edition: z.string().min(1),
  reviewerId: z.string().min(1),
  reviewerName: z.string().trim().min(1),
  licenseNo: z
    .string()
    .trim()
    .min(2, "Licensed reviewer license number is required."),
  scores: rubricScoresSchema,
  calcIndependentlyVerified: z.boolean().default(false),
  verdict: reviewVerdictActionSchema,
  comments: z.string().trim().default(""),
  suggestedFix: z.string().trim().default(""),
});
export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;

export interface ReviewRecord {
  id: string;
  item_kind: ReviewItemKind;
  item_id: string;
  item_title: string;
  item_version: number;
  item_type: "mcq" | "calc" | "lookup" | "scenario" | "drawing";
  topic_id: string;
  code_family: CodeFamily;
  edition: string;
  reviewer_id: string;
  reviewer_name: string;
  license_no: string;
  reviewed_at: string;
  scores: RubricScores;
  calc_independently_verified: boolean;
  verdict: ReviewVerdictAction;
  db_verdict: DbReviewVerdict;
  resulting_status: ReviewItemStatus;
  comments: string;
  suggested_fix: string;
}

export interface ReviewableQuestion {
  id: string;
  topic_id: string;
  stem: string;
  type: "mcq" | "calc" | "lookup" | "scenario";
  options: string[];
  correct_index: number;
  difficulty: number;
  code_family: CodeFamily;
  edition: string;
  code_ref: string;
  explanation_seed: string;
  status: ReviewItemStatus;
  version: number;
  reviewer_id: string | null;
  reviewed_at: string | null;
  reviewer_license_no: string | null;
  latest_review_comments: string | null;
  latest_suggested_fix: string | null;
}

export interface ReviewableDrawingExercise {
  id: string;
  jurisdiction_id: string;
  topic_id: string;
  title: string;
  prompt_md: string;
  fixtures: DrawNode[];
  pipe_system: PipeSystem;
  constraints: Record<string, unknown>;
  scoring_rubric: Record<string, number>;
  code_family: CodeFamily;
  edition: string;
  status: ReviewItemStatus;
  version: number;
  reviewer_id: string | null;
  reviewed_at: string | null;
  reviewer_license_no: string | null;
  latest_review_comments: string | null;
  latest_suggested_fix: string | null;
}

export interface ReviewerRoleRecord {
  id: string;
  display_name: string;
  email: string;
  role: UserRole;
  license_no: string | null;
  updated_at: string;
}
