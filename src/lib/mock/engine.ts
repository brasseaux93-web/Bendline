import type {
  BlueprintWeight,
  CodeFamily,
  Jurisdiction,
  ServableQuestion,
  Topic,
} from "@/lib/domain/types";
import { filterServableQuestionsForJurisdiction } from "@/lib/srs";

/**
 * Client-safe question projection: strictly omits correct_index and explanation_seed
 * so answers cannot be inspected before server-side grading.
 */
export interface ClientMockQuestion {
  id: string;
  stem: string;
  type: "mcq" | "calc" | "lookup" | "scenario";
  options: string[];
  topic_id: string;
  difficulty: number;
  code_family: CodeFamily;
  edition: string;
  code_ref: string;
  reviewed_at?: string | null;
  version: number;
}

export interface SavedMockAnswer {
  selected_index: number;
  time_ms: number;
  updated_at: string;
}

export interface MockTopicBreakdownItem {
  topic_id: string;
  slug: string;
  title: string;
  total: number;
  answered: number;
  correct: number;
  accuracy_pct: number;
  avg_time_ms: number;
}

export interface MockQuestionReviewItem {
  question_id: string;
  topic_id: string;
  stem: string;
  options: string[];
  selected_index: number | null;
  correct_index: number;
  is_correct: boolean;
  time_ms: number;
  code_family: CodeFamily;
  edition: string;
  code_ref: string;
  reviewed_at?: string | null;
  explanation_seed: string;
}

export interface MockExamResult {
  score_pct: number;
  pass_pct: number;
  passed: boolean;
  correct_count: number;
  total_questions: number;
  answered_count: number;
  total_time_ms: number;
  avg_time_per_question_ms: number;
  topic_breakdown: MockTopicBreakdownItem[];
  weakest_topic_slugs: string[];
  question_review: MockQuestionReviewItem[];
}

export interface ServerMockSession {
  id: string;
  user_id: string;
  jurisdiction_id: string;
  question_ids: string[];
  answers: Record<string, SavedMockAnswer>;
  flagged_question_ids: string[];
  current_index: number;
  status: "in_progress" | "submitted" | "abandoned" | "expired";
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
  time_spent_ms: number;
  pass_pct: number;
  open_book: boolean;
  allowed_refs: string[];
  requested_question_count: number;
  is_scaled_preview: boolean;
  result: MockExamResult | null;
}

export interface ClientMockSession {
  id: string;
  jurisdiction_id: string;
  question_ids: string[];
  answers: Record<string, SavedMockAnswer>;
  flagged_question_ids: string[];
  current_index: number;
  status: "in_progress" | "submitted" | "abandoned" | "expired";
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
  time_spent_ms: number;
  pass_pct: number;
  open_book: boolean;
  allowed_refs: string[];
  requested_question_count: number;
  is_scaled_preview: boolean;
  result: MockExamResult | null;
}

export class InsufficientServableQuestionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientServableQuestionsError";
  }
}

export function stripAnswersForClient(
  question: ServableQuestion
): ClientMockQuestion {
  return {
    id: question.id,
    stem: question.stem,
    type: question.type,
    options: [...question.options],
    topic_id: question.topic_id,
    difficulty: question.difficulty,
    code_family: question.code_family,
    edition: question.edition,
    code_ref: question.code_ref,
    reviewed_at: question.reviewed_at ?? null,
    version: question.version,
  };
}

export function sanitizeSessionForClient(
  session: ServerMockSession
): ClientMockSession {
  return {
    id: session.id,
    jurisdiction_id: session.jurisdiction_id,
    question_ids: [...session.question_ids],
    answers: { ...session.answers },
    flagged_question_ids: [...session.flagged_question_ids],
    current_index: session.current_index,
    status: session.status,
    started_at: session.started_at,
    expires_at: session.expires_at,
    submitted_at: session.submitted_at,
    time_spent_ms: session.time_spent_ms,
    pass_pct: session.pass_pct,
    open_book: session.open_book,
    allowed_refs: session.open_book ? [...session.allowed_refs] : [],
    requested_question_count: session.requested_question_count,
    is_scaled_preview: session.is_scaled_preview,
    // Never reveal grading or review details while the exam is still in progress
    result: session.status === "in_progress" ? null : session.result,
  };
}

export function computeServerRemainingMs(
  expiresAtIso: string,
  serverNowIso: string
): number {
  const expMs = Date.parse(expiresAtIso);
  const nowMs = Date.parse(serverNowIso);
  if (!Number.isFinite(expMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, expMs - nowMs);
}

/**
 * Allocates integer question counts per topic using the Hamilton / Largest Remainder
 * method so every topic is strictly within 1 question of its exact blueprint weight
 * and the allocations sum exactly to questionCount.
 */
export function allocateTopicCountsByBlueprint(
  questionCount: number,
  blueprints: BlueprintWeight[],
  jurisdictionId: string,
  topics: Topic[]
): Map<string, number> {
  if (questionCount <= 0) {
    throw new Error("questionCount must be positive.");
  }
  if (topics.length === 0) {
    throw new Error("Cannot allocate blueprint without topics.");
  }

  const orderedTopics = [...topics].sort(
    (a, b) => a.display_order - b.display_order
  );
  const weightMap = new Map<string, number>();

  for (const bp of blueprints) {
    if (bp.jurisdiction_id === jurisdictionId) {
      weightMap.set(bp.topic_id, Math.max(0, bp.weight_pct));
    }
  }

  let totalWeight = orderedTopics.reduce(
    (sum, t) => sum + (weightMap.get(t.id) ?? 0),
    0
  );

  // If no explicit blueprint rows exist for this jurisdiction, fall back to equal distribution
  if (totalWeight <= 0) {
    for (const t of orderedTopics) {
      weightMap.set(t.id, 100 / orderedTopics.length);
    }
    totalWeight = 100;
  }

  const rows = orderedTopics.map((topic) => {
    const weight = weightMap.get(topic.id) ?? 0;
    const exact = (questionCount * weight) / totalWeight;
    const base = Math.floor(exact);
    return {
      topicId: topic.id,
      weight,
      displayOrder: topic.display_order,
      allocated: base,
      remainder: exact - base,
    };
  });

  let remaining =
    questionCount - rows.reduce((sum, r) => sum + r.allocated, 0);

  const byRemainder = [...rows].sort((a, b) => {
    if (Math.abs(b.remainder - a.remainder) > 1e-9) {
      return b.remainder - a.remainder;
    }
    if (b.weight !== a.weight) {
      return b.weight - a.weight;
    }
    return a.displayOrder - b.displayOrder;
  });

  let idx = 0;
  while (remaining > 0 && idx < byRemainder.length) {
    byRemainder[idx].allocated += 1;
    remaining -= 1;
    idx += 1;
  }

  const result = new Map<string, number>();
  for (const row of rows) {
    result.set(row.topicId, row.allocated);
  }
  return result;
}

export interface ComposeMockExamResult {
  questions: ServableQuestion[];
  allocations: Map<string, number>;
  requestedQuestionCount: number;
  isScaledPreview: boolean;
}

export function composeMockExamQuestions(params: {
  jurisdiction: Jurisdiction;
  topics: Topic[];
  questions: ServableQuestion[];
  blueprints: BlueprintWeight[];
  strictBankSize?: boolean;
}): ComposeMockExamResult {
  const {
    jurisdiction,
    topics,
    questions,
    blueprints,
    strictBankSize = true,
  } = params;

  const eligible = filterServableQuestionsForJurisdiction(
    questions,
    jurisdiction
  );

  if (eligible.length === 0) {
    throw new InsufficientServableQuestionsError(
      `No servable questions available for ${jurisdiction.state} (${jurisdiction.code_family} ${jurisdiction.edition}).`
    );
  }

  const effectiveCount = strictBankSize
    ? jurisdiction.question_count
    : Math.min(jurisdiction.question_count, eligible.length);

  if (strictBankSize && eligible.length < jurisdiction.question_count) {
    throw new InsufficientServableQuestionsError(
      `Need ${jurisdiction.question_count} servable questions for ${jurisdiction.state}, found ${eligible.length}.`
    );
  }

  const allocations = allocateTopicCountsByBlueprint(
    effectiveCount,
    blueprints,
    jurisdiction.id,
    topics
  );

  const byTopic = new Map<string, ServableQuestion[]>();
  for (const q of eligible) {
    const list = byTopic.get(q.topic_id) ?? [];
    list.push(q);
    byTopic.set(q.topic_id, list);
  }

  for (const list of byTopic.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id));
  }

  const selected: ServableQuestion[] = [];
  const selectedIds = new Set<string>();

  for (const topic of [...topics].sort(
    (a, b) => a.display_order - b.display_order
  )) {
    const quota = allocations.get(topic.id) ?? 0;
    const pool = byTopic.get(topic.id) ?? [];

    if (strictBankSize && pool.length < quota) {
      throw new InsufficientServableQuestionsError(
        `Topic ${topic.slug} needs ${quota} servable questions for ${jurisdiction.state}, found ${pool.length}.`
      );
    }

    for (let i = 0; i < Math.min(quota, pool.length); i += 1) {
      selected.push(pool[i]);
      selectedIds.add(pool[i].id);
    }
  }

  // Backfill only in non-strict preview mode if individual topic pools are smaller than quota
  if (!strictBankSize && selected.length < effectiveCount) {
    for (const q of [...eligible].sort((a, b) => a.id.localeCompare(b.id))) {
      if (selected.length >= effectiveCount) break;
      if (!selectedIds.has(q.id)) {
        selected.push(q);
        selectedIds.add(q.id);
      }
    }
  }

  return {
    questions: selected,
    allocations,
    requestedQuestionCount: jurisdiction.question_count,
    isScaledPreview: effectiveCount < jurisdiction.question_count,
  };
}

export function gradeMockSession(params: {
  session: ServerMockSession;
  questionsById: Map<string, ServableQuestion>;
  topics: Topic[];
  submittedAtIso: string;
}): MockExamResult {
  const { session, questionsById, topics, submittedAtIso } = params;
  const topicById = new Map(topics.map((t) => [t.id, t]));

  let correctCount = 0;
  let answeredCount = 0;
  let totalQuestionTimeMs = 0;

  const topicStats = new Map<
    string,
    { total: number; answered: number; correct: number; timeMs: number }
  >();
  const questionReview: MockQuestionReviewItem[] = [];

  for (const qId of session.question_ids) {
    const q = questionsById.get(qId);
    if (!q) continue;

    const saved = session.answers[qId];
    const selectedIndex =
      saved && Number.isInteger(saved.selected_index)
        ? saved.selected_index
        : null;
    const isAnswered = selectedIndex !== null;
    const isCorrect =
      selectedIndex !== null && selectedIndex === q.correct_index;
    const qTimeMs = Math.max(0, saved?.time_ms ?? 0);

    if (isAnswered) answeredCount += 1;
    if (isCorrect) correctCount += 1;
    totalQuestionTimeMs += qTimeMs;

    const prev = topicStats.get(q.topic_id) ?? {
      total: 0,
      answered: 0,
      correct: 0,
      timeMs: 0,
    };
    topicStats.set(q.topic_id, {
      total: prev.total + 1,
      answered: prev.answered + (isAnswered ? 1 : 0),
      correct: prev.correct + (isCorrect ? 1 : 0),
      timeMs: prev.timeMs + qTimeMs,
    });

    questionReview.push({
      question_id: q.id,
      topic_id: q.topic_id,
      stem: q.stem,
      options: [...q.options],
      selected_index: selectedIndex,
      correct_index: q.correct_index,
      is_correct: isCorrect,
      time_ms: qTimeMs,
      code_family: q.code_family,
      edition: q.edition,
      code_ref: q.code_ref,
      reviewed_at: q.reviewed_at ?? null,
      explanation_seed: q.explanation_seed,
    });
  }

  const totalQuestions = session.question_ids.length;
  const elapsedWallMs = Math.max(
    0,
    Date.parse(submittedAtIso) - Date.parse(session.started_at)
  );
  const totalTimeMs =
    totalQuestionTimeMs > 0
      ? totalQuestionTimeMs
      : session.time_spent_ms > 0
      ? session.time_spent_ms
      : elapsedWallMs;

  const scorePct =
    totalQuestions > 0
      ? Number(((correctCount / totalQuestions) * 100).toFixed(2))
      : 0;
  const passed = scorePct >= session.pass_pct;
  const avgTimePerQuestionMs =
    totalQuestions > 0 ? Math.round(totalTimeMs / totalQuestions) : 0;

  const topicBreakdown: MockTopicBreakdownItem[] = [];
  for (const [topicId, stat] of topicStats.entries()) {
    const topic = topicById.get(topicId);
    if (!topic) continue;
    const accuracyPct =
      stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
    topicBreakdown.push({
      topic_id: topicId,
      slug: topic.slug,
      title: topic.title,
      total: stat.total,
      answered: stat.answered,
      correct: stat.correct,
      accuracy_pct: accuracyPct,
      avg_time_ms: stat.total > 0 ? Math.round(stat.timeMs / stat.total) : 0,
    });
  }

  topicBreakdown.sort((a, b) => {
    if (a.accuracy_pct !== b.accuracy_pct) return a.accuracy_pct - b.accuracy_pct;
    if (b.total !== a.total) return b.total - a.total;
    return a.title.localeCompare(b.title);
  });

  const weakestTopicSlugs = topicBreakdown.slice(0, 3).map((t) => t.slug);

  return {
    score_pct: scorePct,
    pass_pct: session.pass_pct,
    passed,
    correct_count: correctCount,
    total_questions: totalQuestions,
    answered_count: answeredCount,
    total_time_ms: totalTimeMs,
    avg_time_per_question_ms: avgTimePerQuestionMs,
    topic_breakdown: topicBreakdown,
    weakest_topic_slugs: weakestTopicSlugs,
    question_review: questionReview,
  };
}
