import type {
  AiErrorType,
  AttemptRecord,
  Jurisdiction,
  ServableQuestion,
  SrsStateRecord,
  Topic,
} from "@/lib/domain/types";
import { AI_ERROR_TYPES } from "@/lib/progress/analytics";
import { computeSm2Update, filterServableQuestionsForJurisdiction } from "@/lib/srs";

export const DIAGNOSTIC_STORAGE_KEY = "bendline_anon_diagnostic_v1";

export interface DiagnosticAnswerRecord {
  id: string;
  question_id: string;
  topic_id: string;
  selected_index: number;
  is_correct: boolean;
  time_ms: number;
  error_type: AiErrorType | null;
  answered_at: string;
}

export interface AnonymousDiagnosticState {
  session_id: string;
  jurisdiction_id: string;
  question_ids: string[];
  current_index: number;
  answers: DiagnosticAnswerRecord[];
  elapsed_ms: number;
  started_at: string;
  completed_at: string | null;
  migrated_at: string | null;
}

export interface DiagnosticDomainResult {
  topic: Topic;
  answered: number;
  correct: number;
  accuracyPct: number | null;
}

export interface DiagnosticSummary {
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  scorePct: number;
  passed: boolean;
  domainResults: DiagnosticDomainResult[];
  mistakeCounts: Record<AiErrorType, number>;
  weakestTopics: Topic[];
}

/**
 * Deterministically selects up to `count` published questions covering all 10
 * plumbing domains for an instant no-account diagnostic, prioritizing exact
 * jurisdiction code_family + edition matches.
 */
export function selectDiagnosticQuestions(
  jurisdiction: Jurisdiction,
  topics: Topic[],
  questions: ServableQuestion[],
  count = 10
): ServableQuestion[] {
  const editionMatches = filterServableQuestionsForJurisdiction(
    questions,
    jurisdiction
  );
  const allPublished = questions.filter(
    (q) =>
      (q.status ?? "published") === "published" &&
      (q.review_verdict ?? "approved") === "approved"
  );

  const sortedTopics = [...topics].sort(
    (a, b) => a.display_order - b.display_order
  );

  const selected: ServableQuestion[] = [];
  const usedIds = new Set<string>();

  for (const topic of sortedTopics) {
    if (selected.length >= count) break;
    const match =
      editionMatches.find(
        (q) => q.topic_id === topic.id && !usedIds.has(q.id)
      ) ??
      allPublished.find(
        (q) =>
          q.topic_id === topic.id &&
          q.code_family === jurisdiction.code_family &&
          !usedIds.has(q.id)
      ) ??
      allPublished.find(
        (q) => q.topic_id === topic.id && !usedIds.has(q.id)
      );

    if (match) {
      selected.push(match);
      usedIds.add(match.id);
    }
  }

  for (const q of editionMatches) {
    if (selected.length >= count) break;
    if (!usedIds.has(q.id)) {
      selected.push(q);
      usedIds.add(q.id);
    }
  }

  return selected.slice(0, count);
}

/**
 * Computes deterministic diagnostic summary across all 10 domains and 6 error types.
 */
export function computeDiagnosticSummary(
  state: AnonymousDiagnosticState,
  topics: Topic[],
  jurisdiction: Jurisdiction
): DiagnosticSummary {
  const totalQuestions = state.question_ids.length;
  const answeredCount = state.answers.length;
  const correctCount = state.answers.filter((a) => a.is_correct).length;
  const scorePct =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const passed = scorePct >= jurisdiction.pass_pct;

  const domainResults: DiagnosticDomainResult[] = [...topics]
    .sort((a, b) => a.display_order - b.display_order)
    .map((topic) => {
      const topicAnswers = state.answers.filter((a) => a.topic_id === topic.id);
      const topicCorrect = topicAnswers.filter((a) => a.is_correct).length;
      return {
        topic,
        answered: topicAnswers.length,
        correct: topicCorrect,
        accuracyPct:
          topicAnswers.length > 0
            ? Math.round((topicCorrect / topicAnswers.length) * 100)
            : null,
      };
    });

  const mistakeCounts = Object.fromEntries(
    AI_ERROR_TYPES.map((t) => [t, 0])
  ) as Record<AiErrorType, number>;

  for (const ans of state.answers) {
    if (!ans.is_correct && ans.error_type) {
      mistakeCounts[ans.error_type] = (mistakeCounts[ans.error_type] ?? 0) + 1;
    }
  }

  const weakestTopics = domainResults
    .filter((d) => d.answered > 0 && d.correct < d.answered)
    .map((d) => d.topic);

  return {
    totalQuestions,
    answeredCount,
    correctCount,
    scorePct,
    passed,
    domainResults,
    mistakeCounts,
    weakestTopics,
  };
}

/**
 * Converts anonymous diagnostic answers into AttemptRecord + SrsStateRecord entries
 * ready for atomic Dexie persistence and background server sync on sign-in.
 */
export function convertDiagnosticToMigrationRecords(
  state: AnonymousDiagnosticState,
  timeZone = "UTC"
): {
  attempts: AttemptRecord[];
  srsStates: SrsStateRecord[];
} {
  const attempts: AttemptRecord[] = [];
  const srsByQuestion = new Map<string, SrsStateRecord>();

  const sortedAnswers = [...state.answers].sort((a, b) =>
    a.answered_at.localeCompare(b.answered_at)
  );

  for (const ans of sortedAnswers) {
    attempts.push({
      id: ans.id,
      question_id: ans.question_id,
      topic_id: ans.topic_id,
      is_correct: ans.is_correct,
      time_ms: ans.time_ms,
      mode: "practice",
      error_type: ans.is_correct ? null : ans.error_type,
      attempted_at: ans.answered_at,
    });

    const prevSrs = srsByQuestion.get(ans.question_id) ?? null;
    const sm2 = computeSm2Update(prevSrs, {
      isCorrect: ans.is_correct,
      timeMs: ans.time_ms,
      reviewedAt: ans.answered_at,
      timeZone,
    });

    srsByQuestion.set(ans.question_id, {
      id: prevSrs?.id ?? ans.id,
      question_id: ans.question_id,
      due_at: sm2.due_at,
      interval_days: sm2.interval_days,
      repetitions: sm2.repetitions,
      ease_factor: sm2.ease_factor,
      lapses: sm2.lapses,
      last_reviewed_at: sm2.last_reviewed_at,
    });
  }

  return {
    attempts,
    srsStates: [...srsByQuestion.values()],
  };
}

export function loadAnonymousDiagnostic(): AnonymousDiagnosticState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DIAGNOSTIC_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AnonymousDiagnosticState>;
    if (
      !parsed ||
      typeof parsed.session_id !== "string" ||
      typeof parsed.jurisdiction_id !== "string" ||
      !Array.isArray(parsed.question_ids) ||
      !Array.isArray(parsed.answers)
    ) {
      return null;
    }
    return {
      session_id: parsed.session_id,
      jurisdiction_id: parsed.jurisdiction_id,
      question_ids: parsed.question_ids,
      current_index:
        typeof parsed.current_index === "number" ? parsed.current_index : 0,
      answers: parsed.answers,
      elapsed_ms: typeof parsed.elapsed_ms === "number" ? parsed.elapsed_ms : 0,
      started_at:
        typeof parsed.started_at === "string"
          ? parsed.started_at
          : new Date().toISOString(),
      completed_at: parsed.completed_at ?? null,
      migrated_at: parsed.migrated_at ?? null,
    };
  } catch {
    return null;
  }
}

export function saveAnonymousDiagnostic(state: AnonymousDiagnosticState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors in restricted browsing modes
  }
}

export function markAnonymousDiagnosticMigrated(
  migratedAt: string = new Date().toISOString()
): AnonymousDiagnosticState | null {
  const existing = loadAnonymousDiagnostic();
  if (!existing) return null;
  const updated: AnonymousDiagnosticState = {
    ...existing,
    migrated_at: migratedAt,
  };
  saveAnonymousDiagnostic(updated);
  return updated;
}

export function clearAnonymousDiagnostic(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DIAGNOSTIC_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
