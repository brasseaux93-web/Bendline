import type {
  AttemptRecord,
  Jurisdiction,
  MockSessionRecord,
  NextMockSummary,
  ReadinessResult,
  SrsStateRecord,
  Topic,
  TopicPerformance,
} from "./types";

export const READINESS_MIN_ANSWERS_PER_TOPIC = 15;

export function computeTopicPerformances(
  topics: Topic[],
  attempts: AttemptRecord[]
): TopicPerformance[] {
  const counts = new Map<string, { answered: number; correct: number }>();

  for (const attempt of attempts) {
    const prev = counts.get(attempt.topic_id) ?? { answered: 0, correct: 0 };
    counts.set(attempt.topic_id, {
      answered: prev.answered + 1,
      correct: prev.correct + (attempt.is_correct ? 1 : 0),
    });
  }

  return [...topics]
    .sort((a, b) => a.display_order - b.display_order)
    .map((topic) => {
      const stat = counts.get(topic.id) ?? { answered: 0, correct: 0 };
      const accuracyPct =
        stat.answered > 0
          ? Math.round((stat.correct / stat.answered) * 100)
          : null;
      return {
        topic,
        answered: stat.answered,
        correct: stat.correct,
        accuracyPct,
        remainingForReadiness: Math.max(
          0,
          READINESS_MIN_ANSWERS_PER_TOPIC - stat.answered
        ),
      };
    });
}

export function computeReadiness(
  topics: Topic[],
  attempts: AttemptRecord[]
): ReadinessResult {
  const performances = computeTopicPerformances(topics, attempts);
  const qualifiedTopics = performances.filter(
    (item) => item.answered >= READINESS_MIN_ANSWERS_PER_TOPIC
  );
  const totalAnswers = performances.reduce((sum, item) => sum + item.answered, 0);

  if (
    performances.length === 0 ||
    qualifiedTopics.length < performances.length
  ) {
    return {
      scorePct: null,
      isUnlocked: false,
      qualifiedTopicsCount: qualifiedTopics.length,
      totalTopics: performances.length,
      minAnswersPerTopic: READINESS_MIN_ANSWERS_PER_TOPIC,
      totalAnswers,
    };
  }

  const meanAccuracy =
    performances.reduce((sum, item) => sum + (item.accuracyPct ?? 0), 0) /
    performances.length;

  return {
    scorePct: Math.round(meanAccuracy),
    isUnlocked: true,
    qualifiedTopicsCount: qualifiedTopics.length,
    totalTopics: performances.length,
    minAnswersPerTopic: READINESS_MIN_ANSWERS_PER_TOPIC,
    totalAnswers,
  };
}

export function computeTopicsOrderedByWeakness(
  topics: Topic[],
  attempts: AttemptRecord[]
): TopicPerformance[] {
  const performances = computeTopicPerformances(topics, attempts);

  return [...performances].sort((a, b) => {
    const aHas = a.answered > 0;
    const bHas = b.answered > 0;

    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;

    if (aHas && bHas) {
      const accDiff = (a.accuracyPct ?? 0) - (b.accuracyPct ?? 0);
      if (accDiff !== 0) return accDiff;

      const aWrong = a.answered - a.correct;
      const bWrong = b.answered - b.correct;
      if (aWrong !== bWrong) return bWrong - aWrong;
    }

    return a.topic.display_order - b.topic.display_order;
  });
}

export function computeWeakestTopic(
  topics: Topic[],
  attempts: AttemptRecord[]
): TopicPerformance {
  const ordered = computeTopicsOrderedByWeakness(topics, attempts);
  if (ordered.length === 0) {
    throw new Error("Cannot compute weakest topic without at least one topic.");
  }
  return ordered[0];
}

export function computeDueReviewsCount(
  srsStates: SrsStateRecord[],
  now: Date = new Date()
): number {
  const nowMs = now.getTime();
  return srsStates.filter((item) => {
    const dueMs = Date.parse(item.due_at);
    return Number.isFinite(dueMs) && dueMs <= nowMs;
  }).length;
}

function toUtcDayKey(input: string): string | null {
  const datePart = input.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return datePart;
  }
  const parsed = Date.parse(input);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function parseUtcDayMs(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function computeStreakDays(
  attemptTimestamps: string[],
  nowIsoDate: string = new Date().toISOString().slice(0, 10)
): number {
  const daySet = new Set<string>();
  for (const ts of attemptTimestamps) {
    const dayKey = toUtcDayKey(ts);
    if (dayKey) daySet.add(dayKey);
  }
  if (daySet.size === 0) return 0;

  const todayKey = toUtcDayKey(nowIsoDate);
  if (!todayKey) return 0;

  const oneDayMs = 86_400_000;
  let cursorMs = parseUtcDayMs(todayKey);

  if (!daySet.has(new Date(cursorMs).toISOString().slice(0, 10))) {
    const yesterdayMs = cursorMs - oneDayMs;
    if (!daySet.has(new Date(yesterdayMs).toISOString().slice(0, 10))) {
      return 0;
    }
    cursorMs = yesterdayMs;
  }

  let streak = 0;
  while (daySet.has(new Date(cursorMs).toISOString().slice(0, 10))) {
    streak += 1;
    cursorMs -= oneDayMs;
  }
  return streak;
}

export function computeDaysToExam(
  examDateIso: string | null | undefined,
  nowIsoDate: string = new Date().toISOString().slice(0, 10)
): number | null {
  if (!examDateIso) return null;
  const examDayKey = toUtcDayKey(examDateIso);
  const todayKey = toUtcDayKey(nowIsoDate);
  if (!examDayKey || !todayKey) return null;

  const diffMs = parseUtcDayMs(examDayKey) - parseUtcDayMs(todayKey);
  return Math.max(0, Math.ceil(diffMs / 86_400_000));
}

export function computeNextMockSummary(
  jurisdiction: Jurisdiction,
  mockSessions: MockSessionRecord[]
): NextMockSummary {
  const jurisdictionSessions = mockSessions.filter(
    (s) => s.jurisdiction_id === jurisdiction.id
  );
  const inProgress = jurisdictionSessions.some((s) => s.status === "in_progress");
  const completedCount = jurisdictionSessions.filter(
    (s) => s.status === "submitted"
  ).length;

  return {
    title: `${jurisdiction.state} Journeyman Simulation #${completedCount + 1}`,
    questionCount: jurisdiction.question_count,
    timeLimitMin: jurisdiction.time_limit_min,
    passPct: jurisdiction.pass_pct,
    openBook: jurisdiction.open_book,
    sessionNumber: completedCount + 1,
    hasInProgressSession: inProgress,
  };
}
