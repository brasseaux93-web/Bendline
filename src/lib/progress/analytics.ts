import type {
  AiErrorType,
  AttemptRecord,
  BlueprintWeight,
  CodeFamily,
  DrawingExerciseSummary,
  DrawingSubmissionSummary,
  Jurisdiction,
  MockSessionRecord,
  ReadinessResult,
  ServableQuestion,
  Topic,
} from "@/lib/domain/types";
import { computeReadiness } from "@/lib/domain/metrics";
import { computeAllTopicMasteries } from "@/lib/srs";

export const AI_ERROR_TYPES: readonly AiErrorType[] = [
  "concept",
  "lookup",
  "arithmetic",
  "misread",
  "edition_confusion",
  "unit",
] as const;

export const ERROR_TYPE_META: Record<
  AiErrorType,
  {
    label: string;
    shortDescription: string;
    fixLabel: string;
  }
> = {
  concept: {
    label: "Core Concept",
    shortDescription:
      "Underlying plumbing physics, trap seal protection, or venting principle.",
    fixLabel: "Fix Concept Gaps",
  },
  lookup: {
    label: "Code Lookup",
    shortDescription:
      "Finding the governing chapter, section, or sizing table quickly.",
    fixLabel: "Fix Code Lookups",
  },
  arithmetic: {
    label: "Arithmetic & Calc",
    shortDescription:
      "DFU/WSFU totals, slope grade drops, or 45° rolling-offset math.",
    fixLabel: "Fix Pipe Math",
  },
  misread: {
    label: "Stem Misread",
    shortDescription:
      "Missing qualifiers such as 'prohibited', 'horizontal', or fixture counts.",
    fixLabel: "Fix Careful Reading",
  },
  edition_confusion: {
    label: "IPC vs UPC Edition",
    shortDescription:
      "Confusing IPC and UPC terminology or state-adopted edition rules.",
    fixLabel: "Fix Edition Rules",
  },
  unit: {
    label: "Unit Conversion",
    shortDescription:
      "Converting psi/ft, inches of fall, gpm/BTUh, or nominal pipe sizes.",
    fixLabel: "Fix Unit Conversions",
  },
};

/**
 * Formats review stamp strictly as "Reviewed [month year] — [edition]" (e.g.
 * "Reviewed November 2026 — IPC 2021") for consistent display across every question screen.
 */
export function formatQuestionReviewStamp(
  reviewedAtIso: string | null | undefined,
  codeFamily: CodeFamily,
  edition: string
): string {
  const editionLabel = `${codeFamily} ${edition}`;
  if (!reviewedAtIso) {
    return `Reviewed Pending — ${editionLabel}`;
  }
  const parsed = Date.parse(reviewedAtIso);
  if (!Number.isFinite(parsed)) {
    return `Reviewed Pending — ${editionLabel}`;
  }
  const monthYear = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(parsed));

  return `Reviewed ${monthYear} — ${editionLabel}`;
}

export function inferAttemptErrorType(
  question: Pick<ServableQuestion, "type">,
  timeMs: number
): AiErrorType {
  if (question.type === "calc") return "arithmetic";
  if (question.type === "lookup") return "lookup";
  if (timeMs > 0 && timeMs < 4000) return "misread";
  return "concept";
}

export interface RecomputedReadiness extends ReadinessResult {
  recomputedAt: string;
}

/**
 * Pure equivalent of Supabase recompute_user_readiness(p_user_id) so client/tests/API
 * enforce identical 15-answer-per-topic readiness semantics.
 */
export function recomputeReadinessFromAttempts(
  topics: Topic[],
  attempts: AttemptRecord[],
  nowIso: string = new Date().toISOString()
): RecomputedReadiness {
  const base = computeReadiness(topics, attempts);
  return {
    ...base,
    recomputedAt: nowIso,
  };
}

export interface TopicMasteryVsBlueprintItem {
  topic: Topic;
  blueprintWeightPct: number;
  masteryPct: number;
  answered: number;
  correct: number;
  accuracyPct: number | null;
  priorityGap: number;
}

export function computeTopicMasteryVsBlueprint(
  topics: Topic[],
  blueprints: BlueprintWeight[],
  attempts: AttemptRecord[],
  jurisdictionId: string
): TopicMasteryVsBlueprintItem[] {
  const weightByTopic = new Map<string, number>();
  for (const bp of blueprints) {
    if (bp.jurisdiction_id === jurisdictionId) {
      weightByTopic.set(bp.topic_id, bp.weight_pct);
    }
  }

  const masteries = computeAllTopicMasteries(topics, attempts);
  const masteryByTopic = new Map(masteries.map((m) => [m.topic.id, m.mastery]));

  const countsByTopic = new Map<string, { answered: number; correct: number }>();
  for (const a of attempts) {
    const prev = countsByTopic.get(a.topic_id) ?? { answered: 0, correct: 0 };
    countsByTopic.set(a.topic_id, {
      answered: prev.answered + 1,
      correct: prev.correct + (a.is_correct ? 1 : 0),
    });
  }

  return [...topics]
    .sort((a, b) => a.display_order - b.display_order)
    .map((topic) => {
      const blueprintWeightPct = Math.round(weightByTopic.get(topic.id) ?? 10);
      const masteryPct = Math.round((masteryByTopic.get(topic.id) ?? 0.5) * 100);
      const counts = countsByTopic.get(topic.id) ?? { answered: 0, correct: 0 };
      const accuracyPct =
        counts.answered > 0
          ? Math.round((counts.correct / counts.answered) * 100)
          : null;
      // High blueprint weight + low mastery => positive priority gap
      const priorityGap = Math.round(
        blueprintWeightPct * (1 - masteryPct / 100)
      );

      return {
        topic,
        blueprintWeightPct,
        masteryPct,
        answered: counts.answered,
        correct: counts.correct,
        accuracyPct,
        priorityGap,
      };
    });
}

export interface MockTrendPoint {
  id: string;
  sessionNumber: number;
  scorePct: number;
  passed: boolean;
  startedAt: string;
  deltaFromPrevious: number | null;
}

export interface MockTrendSummary {
  points: MockTrendPoint[];
  passPct: number;
  latestScorePct: number | null;
  bestScorePct: number | null;
  averageScorePct: number | null;
  latestDelta: number | null;
}

export function computeMockTrend(
  mockSessions: MockSessionRecord[],
  jurisdiction: Pick<Jurisdiction, "id" | "pass_pct">
): MockTrendSummary {
  const completed = mockSessions
    .filter(
      (s) =>
        s.jurisdiction_id === jurisdiction.id &&
        s.status === "submitted" &&
        s.score_pct !== null
    )
    .sort((a, b) => a.started_at.localeCompare(b.started_at));

  const points: MockTrendPoint[] = completed.map((s, idx) => {
    const scorePct = Math.round(Number(s.score_pct));
    const prevScore =
      idx > 0 ? Math.round(Number(completed[idx - 1].score_pct)) : null;
    return {
      id: s.id,
      sessionNumber: idx + 1,
      scorePct,
      passed: s.passed ?? scorePct >= jurisdiction.pass_pct,
      startedAt: s.started_at,
      deltaFromPrevious: prevScore !== null ? scorePct - prevScore : null,
    };
  });

  if (points.length === 0) {
    return {
      points: [],
      passPct: jurisdiction.pass_pct,
      latestScorePct: null,
      bestScorePct: null,
      averageScorePct: null,
      latestDelta: null,
    };
  }

  const latest = points[points.length - 1];
  const bestScorePct = Math.max(...points.map((p) => p.scorePct));
  const averageScorePct = Math.round(
    points.reduce((sum, p) => sum + p.scorePct, 0) / points.length
  );

  return {
    points,
    passPct: jurisdiction.pass_pct,
    latestScorePct: latest.scorePct,
    bestScorePct,
    averageScorePct,
    latestDelta: latest.deltaFromPrevious,
  };
}

export interface MistakeProfileItem {
  errorType: AiErrorType;
  label: string;
  shortDescription: string;
  fixLabel: string;
  count: number;
  sharePct: number;
  fixHref: string;
}

export interface MistakeProfileSummary {
  totalTaggedMistakes: number;
  topErrorType: AiErrorType | null;
  items: MistakeProfileItem[];
}

export function computeMistakeProfile(
  attempts: AttemptRecord[],
  jurisdiction: Pick<Jurisdiction, "open_book">
): MistakeProfileSummary {
  const counts = new Map<AiErrorType, number>(
    AI_ERROR_TYPES.map((t) => [t, 0])
  );

  let totalTaggedMistakes = 0;
  for (const a of attempts) {
    if (!a.is_correct && a.error_type) {
      counts.set(a.error_type, (counts.get(a.error_type) ?? 0) + 1);
      totalTaggedMistakes += 1;
    }
  }

  const items: MistakeProfileItem[] = AI_ERROR_TYPES.map((errorType) => {
    const count = counts.get(errorType) ?? 0;
    const sharePct =
      totalTaggedMistakes > 0
        ? Math.round((count / totalTaggedMistakes) * 100)
        : 0;
    const meta = ERROR_TYPE_META[errorType];
    const fixHref =
      errorType === "lookup" && jurisdiction.open_book
        ? "/navigate"
        : `/practice?errorType=${errorType}`;

    return {
      errorType,
      label: meta.label,
      shortDescription: meta.shortDescription,
      fixLabel: meta.fixLabel,
      count,
      sharePct,
      fixHref,
    };
  }).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return AI_ERROR_TYPES.indexOf(a.errorType) - AI_ERROR_TYPES.indexOf(b.errorType);
  });

  const topErrorType =
    items[0] && items[0].count > 0 ? items[0].errorType : null;

  return {
    totalTaggedMistakes,
    topErrorType,
    items,
  };
}

export interface DrawingLabProgressSummary {
  totalSubmissions: number;
  averageScorePct: number | null;
  bestScorePct: number | null;
  latestScorePct: number | null;
  recentSubmissions: Array<
    DrawingSubmissionSummary & { exerciseTitle: string }
  >;
}

export function computeDrawingLabProgress(
  submissions: DrawingSubmissionSummary[],
  exercises: DrawingExerciseSummary[]
): DrawingLabProgressSummary {
  if (submissions.length === 0) {
    return {
      totalSubmissions: 0,
      averageScorePct: null,
      bestScorePct: null,
      latestScorePct: null,
      recentSubmissions: [],
    };
  }

  const exerciseMap = new Map(exercises.map((e) => [e.id, e.title]));
  const sorted = [...submissions].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );

  const scores = sorted.map((s) => Math.round(Number(s.score)));
  const averageScorePct = Math.round(
    scores.reduce((sum, s) => sum + s, 0) / scores.length
  );
  const bestScorePct = Math.max(...scores);
  const latestScorePct = scores[0] ?? null;

  return {
    totalSubmissions: sorted.length,
    averageScorePct,
    bestScorePct,
    latestScorePct,
    recentSubmissions: sorted.slice(0, 5).map((s) => ({
      ...s,
      score: Math.round(Number(s.score)),
      exerciseTitle: exerciseMap.get(s.exercise_id) ?? "Isometric Exercise",
    })),
  };
}
