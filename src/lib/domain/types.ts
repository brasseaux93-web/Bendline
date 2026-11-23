export type CodeFamily = "IPC" | "UPC";

export type LicenseLevel = "journeyman" | "master" | "apprentice" | "contractor";

export type UserRole = "user" | "reviewer" | "admin";

export type PipeSystem = "dwv" | "vent" | "supply";

export type PlanTier = "free" | "pro_monthly" | "pro_exam_pass" | "lifetime";

export type PracticeMode =
  | "daily_12"
  | "topic_drill"
  | "weak_spots"
  | "missed_review";

export type AiErrorType =
  | "concept"
  | "lookup"
  | "arithmetic"
  | "misread"
  | "edition_confusion"
  | "unit";

export interface Jurisdiction {
  id: string;
  state: string;
  name: string;
  license_level: LicenseLevel;
  code_family: CodeFamily;
  edition: string;
  amendments_note: string;
  exam_vendor: string;
  question_count: number;
  time_limit_min: number;
  pass_pct: number;
  open_book: boolean;
  allowed_refs: string[];
  bulletin_url: string | null;
  last_verified_at: string | null;
}

export interface Topic {
  id: string;
  slug: string;
  title: string;
  description: string;
  display_order: number;
}

export interface BlueprintWeight {
  jurisdiction_id: string;
  topic_id: string;
  weight_pct: number;
}

export interface Profile {
  id: string;
  role: UserRole;
  display_name: string | null;
  target_jurisdiction_id: string | null;
  exam_date: string | null;
  onboarding_completed_at: string | null;
  reduce_motion: boolean;
}

export interface ServableQuestion {
  id: string;
  stem: string;
  type: "mcq" | "calc" | "lookup" | "scenario";
  options: string[];
  correct_index: number;
  topic_id: string;
  difficulty: number;
  code_family: CodeFamily;
  edition: string;
  code_ref: string;
  explanation_seed: string;
  version: number;
  jurisdiction_id?: string | null;
  status?: "draft" | "reviewed" | "published" | "flagged";
  review_verdict?: "approved" | "needs_revision" | "rejected";
  reviewed_at?: string | null;
  reviewer_license_no?: string | null;
}

export interface DrawingSubmissionSummary {
  id: string;
  exercise_id: string;
  score: number;
  mode: "learn" | "practice" | "exam";
  time_ms: number;
  created_at: string;
}

export interface AttemptRecord {
  id: string;
  question_id: string;
  topic_id: string;
  is_correct: boolean;
  time_ms: number;
  mode: "learn" | "practice" | "exam" | "srs";
  error_type?: AiErrorType | null;
  attempted_at: string;
}

export interface SrsStateRecord {
  id: string;
  question_id: string;
  due_at: string;
  interval_days: number;
  repetitions: number;
  ease_factor?: number;
  lapses?: number;
  last_reviewed_at?: string | null;
}

export interface MockSessionRecord {
  id: string;
  jurisdiction_id: string;
  status: "in_progress" | "submitted" | "abandoned" | "expired";
  started_at: string;
  score_pct: number | null;
  passed: boolean | null;
}

export interface DrawingExerciseSummary {
  id: string;
  jurisdiction_id: string;
  title: string;
  prompt_md: string;
  pipe_system: PipeSystem;
  code_family: CodeFamily;
  edition: string;
}

export interface PracticeSessionAnswer {
  question_id: string;
  selected_index: number;
  is_correct: boolean;
  time_ms: number;
  answered_at: string;
}

export interface PracticeSessionRecord {
  id: string;
  jurisdiction_id: string;
  mode: PracticeMode;
  topic_id: string | null;
  question_ids: string[];
  current_index: number;
  answers: PracticeSessionAnswer[];
  flagged_question_ids: string[];
  elapsed_ms: number;
  status: "in_progress" | "completed" | "abandoned";
  started_at: string;
  updated_at: string;
}

export interface ErrorReportRecord {
  id: string;
  question_id: string;
  category:
    | "technical"
    | "code_citation"
    | "typo"
    | "calculation"
    | "jurisdiction_amendment"
    | "other";
  description: string;
  created_at: string;
}

export interface TopicPerformance {
  topic: Topic;
  answered: number;
  correct: number;
  accuracyPct: number | null;
  remainingForReadiness: number;
}

export interface ReadinessResult {
  scorePct: number | null;
  isUnlocked: boolean;
  qualifiedTopicsCount: number;
  totalTopics: number;
  minAnswersPerTopic: number;
  totalAnswers: number;
}

export interface NextMockSummary {
  title: string;
  questionCount: number;
  timeLimitMin: number;
  passPct: number;
  openBook: boolean;
  sessionNumber: number;
  hasInProgressSession: boolean;
}
