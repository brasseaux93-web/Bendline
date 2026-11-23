import type {
  AiErrorType,
  AttemptRecord,
  BlueprintWeight,
  Jurisdiction,
  PlanTier,
  PracticeMode,
  ServableQuestion,
  SrsStateRecord,
  Topic,
} from "@/lib/domain/types";

export const DEFAULT_EASE_FACTOR = 2.5;
export const MIN_EASE_FACTOR = 1.3;
export const FREE_TIER_DAILY_LIMIT = 12;

export type SelectionBucket = "due" | "new_weakest" | "blueprint" | "fallback";

export interface ScheduledQuestionItem {
  question: ServableQuestion;
  sourceBucket: SelectionBucket;
  targetDifficulty: number;
}

export interface TopicMasterySummary {
  topic: Topic;
  mastery: number;
  attemptedCount: number;
}

export interface Sm2UpdateResult {
  due_at: string;
  interval_days: number;
  repetitions: number;
  ease_factor: number;
  lapses: number;
  last_reviewed_at: string;
}

export interface FreeTierAllowanceResult {
  allowed: boolean;
  remaining: number;
  usedToday: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Timezone-safe calendar date & due-date math
// ---------------------------------------------------------------------------

export function getLocalDateKey(
  isoTimestamp: string,
  timeZone = "UTC"
): string {
  const parsedMs = Date.parse(isoTimestamp);
  const date = Number.isFinite(parsedMs) ? new Date(parsedMs) : new Date(0);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getTimeZoneOffsetMs(utcDate: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utcDate);

  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = Number(part.value);
    }
  }

  const asUtcMs = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second
  );
  return asUtcMs - utcDate.getTime();
}

export function computeNextDueAt(
  reviewedAtIso: string,
  intervalDays: number,
  timeZone = "UTC"
): string {
  const localDayKey = getLocalDateKey(reviewedAtIso, timeZone);
  const [y, m, d] = localDayKey.split("-").map(Number);

  const targetUtcDate = new Date(Date.UTC(y, m - 1, d + Math.max(0, intervalDays)));
  const ty = targetUtcDate.getUTCFullYear();
  const tm = targetUtcDate.getUTCMonth();
  const td = targetUtcDate.getUTCDate();

  const naiveUtcMs = Date.UTC(ty, tm, td, 0, 0, 0);
  const firstGuessMs = naiveUtcMs - getTimeZoneOffsetMs(new Date(naiveUtcMs), timeZone);
  const refinedMs =
    naiveUtcMs - getTimeZoneOffsetMs(new Date(firstGuessMs), timeZone);

  return new Date(refinedMs).toISOString();
}

export function isCardDue(
  dueAtIso: string,
  nowIso: string,
  timeZone = "UTC"
): boolean {
  const dueMs = Date.parse(dueAtIso);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs)) return false;

  const dueLocalDay = getLocalDateKey(dueAtIso, timeZone);
  const nowLocalDay = getLocalDateKey(nowIso, timeZone);
  return dueLocalDay <= nowLocalDay;
}

// ---------------------------------------------------------------------------
// SM-2 per-question ease factor + interval progression
// ---------------------------------------------------------------------------

export function deriveSm2Quality(input: {
  isCorrect: boolean;
  timeMs?: number;
  confidence?: number;
}): 0 | 1 | 2 | 3 | 4 | 5 {
  if (!input.isCorrect) return 1;
  if (typeof input.confidence === "number") {
    if (input.confidence >= 5) return 5;
    if (input.confidence <= 2) return 3;
    return 4;
  }
  const timeMs = input.timeMs ?? 20_000;
  if (timeMs <= 15_000) return 5;
  if (timeMs > 45_000) return 3;
  return 4;
}

export function computeSm2Update(
  prev: Pick<
    SrsStateRecord,
    "interval_days" | "repetitions" | "ease_factor" | "lapses"
  > | null,
  input: {
    isCorrect: boolean;
    quality?: 0 | 1 | 2 | 3 | 4 | 5;
    timeMs?: number;
    reviewedAt: string;
    timeZone?: string;
  }
): Sm2UpdateResult {
  const q =
    input.quality ??
    deriveSm2Quality({ isCorrect: input.isCorrect, timeMs: input.timeMs });
  const prevEase = prev?.ease_factor ?? DEFAULT_EASE_FACTOR;
  const prevReps = prev?.repetitions ?? 0;
  const prevInterval = prev?.interval_days ?? 0;
  const prevLapses = prev?.lapses ?? 0;

  const rawEase = prevEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  const nextEase = Math.max(
    MIN_EASE_FACTOR,
    Number(rawEase.toFixed(2))
  );

  let nextReps: number;
  let nextInterval: number;
  let nextLapses = prevLapses;

  if (!input.isCorrect || q < 3) {
    nextReps = 0;
    nextInterval = 1;
    nextLapses = prevLapses + 1;
  } else {
    if (prevReps === 0) {
      nextInterval = 1;
      nextReps = 1;
    } else if (prevReps === 1) {
      nextInterval = 6;
      nextReps = 2;
    } else {
      nextInterval = Math.max(1, Math.round(prevInterval * nextEase));
      nextReps = prevReps + 1;
    }
  }

  return {
    due_at: computeNextDueAt(input.reviewedAt, nextInterval, input.timeZone ?? "UTC"),
    interval_days: nextInterval,
    repetitions: nextReps,
    ease_factor: nextEase,
    lapses: nextLapses,
    last_reviewed_at: input.reviewedAt,
  };
}

// ---------------------------------------------------------------------------
// Per-topic recency-weighted mastery & difficulty stepping
// ---------------------------------------------------------------------------

export function computeRecencyWeightedMastery(
  topicId: string,
  attempts: AttemptRecord[],
  decay = 0.85
): number {
  const topicAttempts = attempts
    .filter((a) => a.topic_id === topicId)
    .sort(
      (a, b) => Date.parse(b.attempted_at) - Date.parse(a.attempted_at)
    );

  if (topicAttempts.length === 0) return 0;

  let weightedScore = 0;
  let weightSum = 0;

  topicAttempts.forEach((attempt, idx) => {
    const w = Math.pow(decay, idx);
    weightSum += w;
    if (attempt.is_correct) {
      weightedScore += w;
    }
  });

  if (weightSum === 0) return 0;
  return Number((weightedScore / weightSum).toFixed(4));
}

export function computeAllTopicMasteries(
  topics: Topic[],
  attempts: AttemptRecord[],
  decay = 0.85
): TopicMasterySummary[] {
  return [...topics]
    .sort((a, b) => a.display_order - b.display_order)
    .map((topic) => {
      const count = attempts.filter((a) => a.topic_id === topic.id).length;
      return {
        topic,
        mastery: computeRecencyWeightedMastery(topic.id, attempts, decay),
        attemptedCount: count,
      };
    });
}

export function computeTargetDifficulty(
  attempts: AttemptRecord[],
  baseDifficulty = 2
): number {
  if (attempts.length < 10) return baseDifficulty;

  const last10 = [...attempts]
    .sort((a, b) => Date.parse(b.attempted_at) - Date.parse(a.attempted_at))
    .slice(0, 10);

  const correctCount = last10.filter((a) => a.is_correct).length;
  const accuracy = correctCount / last10.length;

  if (accuracy > 0.8) {
    return Math.min(5, baseDifficulty + 1);
  }
  if (accuracy < 0.5) {
    return Math.max(1, baseDifficulty - 1);
  }
  return baseDifficulty;
}

// ---------------------------------------------------------------------------
// Servability filter & adaptive session selection (~50% due / ~35% new-weakest / ~15% blueprint)
// ---------------------------------------------------------------------------

export function filterServableQuestionsForJurisdiction(
  questions: ServableQuestion[],
  jurisdiction: Jurisdiction
): ServableQuestion[] {
  return questions.filter((q) => {
    const isPublished = (q.status ?? "published") === "published";
    const isApproved = (q.review_verdict ?? "approved") === "approved";
    if (!isPublished || !isApproved) return false;

    const codeMatches =
      q.code_family === jurisdiction.code_family &&
      q.edition === jurisdiction.edition;
    const jurisdictionMatches =
      !q.jurisdiction_id || q.jurisdiction_id === jurisdiction.id;

    return codeMatches && jurisdictionMatches;
  });
}

function rankByDifficultyFit(
  items: ServableQuestion[],
  targetDifficulty: number
): ServableQuestion[] {
  return [...items].sort((a, b) => {
    const diffA = Math.abs(a.difficulty - targetDifficulty);
    const diffB = Math.abs(b.difficulty - targetDifficulty);
    if (diffA !== diffB) return diffA - diffB;
    return a.id.localeCompare(b.id);
  });
}

export interface SelectAdaptiveParams {
  mode: PracticeMode;
  jurisdiction: Jurisdiction;
  topics: Topic[];
  questions: ServableQuestion[];
  attempts: AttemptRecord[];
  srsStates: SrsStateRecord[];
  blueprints?: BlueprintWeight[];
  topicId?: string | null;
  errorTypeFilter?: AiErrorType | null;
  excludeQuestionIds?: string[];
  count?: number;
  nowIso?: string;
  timeZone?: string;
}

export function selectAdaptiveQuestions(
  params: SelectAdaptiveParams
): ScheduledQuestionItem[] {
  const {
    mode,
    jurisdiction,
    topics,
    questions,
    attempts,
    srsStates,
    blueprints = [],
    topicId = null,
    errorTypeFilter = null,
    excludeQuestionIds = [],
    count = 12,
    nowIso = new Date().toISOString(),
    timeZone = "UTC",
  } = params;

  const excluded = new Set(excludeQuestionIds);
  const eligible = filterServableQuestionsForJurisdiction(questions, jurisdiction)
    .filter((q) => !excluded.has(q.id));

  if (eligible.length === 0 || count <= 0) return [];

  const targetDifficulty = computeTargetDifficulty(attempts, 2);
  const srsByQuestion = new Map<string, SrsStateRecord>();
  for (const srs of srsStates) {
    srsByQuestion.set(srs.question_id, srs);
  }

  const attemptedQuestionIds = new Set(attempts.map((a) => a.question_id));
  const missedCountByQuestion = new Map<string, number>();
  for (const a of attempts) {
    if (!a.is_correct) {
      missedCountByQuestion.set(
        a.question_id,
        (missedCountByQuestion.get(a.question_id) ?? 0) + 1
      );
    }
  }

  const masteries = computeAllTopicMasteries(topics, attempts);
  const masteryRank = new Map<string, number>();
  [...masteries]
    .sort((a, b) => {
      if (a.mastery !== b.mastery) return a.mastery - b.mastery;
      return a.topic.display_order - b.topic.display_order;
    })
    .forEach((m, index) => {
      masteryRank.set(m.topic.id, index);
    });

  const blueprintWeightByTopic = new Map<string, number>();
  for (const bp of blueprints) {
    if (bp.jurisdiction_id === jurisdiction.id) {
      blueprintWeightByTopic.set(bp.topic_id, bp.weight_pct);
    }
  }

  const pickedIds = new Set<string>();
  const result: ScheduledQuestionItem[] = [];

  const pushUnique = (q: ServableQuestion, bucket: SelectionBucket): boolean => {
    if (pickedIds.has(q.id) || result.length >= count) return false;
    pickedIds.add(q.id);
    result.push({
      question: q,
      sourceBucket: bucket,
      targetDifficulty,
    });
    return true;
  };

  if (errorTypeFilter) {
    const taggedQuestionIds = new Set(
      attempts
        .filter((a) => !a.is_correct && a.error_type === errorTypeFilter)
        .map((a) => a.question_id)
    );

    const isAlignedType = (q: ServableQuestion): boolean => {
      if (errorTypeFilter === "arithmetic" || errorTypeFilter === "unit") {
        return q.type === "calc";
      }
      if (errorTypeFilter === "lookup") {
        return q.type === "lookup" || q.type === "mcq";
      }
      if (errorTypeFilter === "misread") {
        return q.type === "scenario";
      }
      return q.type === "scenario" || q.type === "mcq";
    };

    const sortedForFix = [...eligible].sort((a, b) => {
      const aTagged = taggedQuestionIds.has(a.id);
      const bTagged = taggedQuestionIds.has(b.id);
      if (aTagged !== bTagged) return aTagged ? -1 : 1;

      const aAligned = isAlignedType(a);
      const bAligned = isAlignedType(b);
      if (aAligned !== bAligned) return aAligned ? -1 : 1;

      const diffA = Math.abs(a.difficulty - targetDifficulty);
      const diffB = Math.abs(b.difficulty - targetDifficulty);
      if (diffA !== diffB) return diffA - diffB;
      return a.id.localeCompare(b.id);
    });

    for (const q of sortedForFix) {
      pushUnique(q, taggedQuestionIds.has(q.id) ? "due" : "new_weakest");
    }
    return result;
  }

  if (mode === "topic_drill") {
    const topicFiltered = topicId
      ? eligible.filter((q) => q.topic_id === topicId)
      : eligible;
    const topicTargetDiff = topicId
      ? computeTargetDifficulty(
          attempts.filter((a) => a.topic_id === topicId),
          2
        )
      : targetDifficulty;

    const ordered = [...topicFiltered].sort((a, b) => {
      const aDue = srsByQuestion.get(a.id);
      const bDue = srsByQuestion.get(b.id);
      const aIsDue = aDue ? isCardDue(aDue.due_at, nowIso, timeZone) : false;
      const bIsDue = bDue ? isCardDue(bDue.due_at, nowIso, timeZone) : false;
      if (aIsDue !== bIsDue) return aIsDue ? -1 : 1;

      const aNew = !attemptedQuestionIds.has(a.id);
      const bNew = !attemptedQuestionIds.has(b.id);
      if (aNew !== bNew) return aNew ? -1 : 1;

      const diffA = Math.abs(a.difficulty - topicTargetDiff);
      const diffB = Math.abs(b.difficulty - topicTargetDiff);
      if (diffA !== diffB) return diffA - diffB;
      return a.id.localeCompare(b.id);
    });

    for (const q of ordered) {
      pushUnique(q, "due");
    }
    return result;
  }

  if (mode === "weak_spots") {
    const weakestTopicIds = new Set(
      [...masteries]
        .sort((a, b) => {
          if (a.mastery !== b.mastery) return a.mastery - b.mastery;
          return a.topic.display_order - b.topic.display_order;
        })
        .slice(0, 3)
        .map((m) => m.topic.id)
    );

    const weakPool = rankByDifficultyFit(
      eligible.filter((q) => weakestTopicIds.has(q.topic_id)),
      targetDifficulty
    ).sort((a, b) => {
      const rA = masteryRank.get(a.topic_id) ?? 99;
      const rB = masteryRank.get(b.topic_id) ?? 99;
      if (rA !== rB) return rA - rB;
      return (
        Math.abs(a.difficulty - targetDifficulty) -
        Math.abs(b.difficulty - targetDifficulty)
      );
    });

    for (const q of weakPool) {
      pushUnique(q, "new_weakest");
    }
    for (const q of rankByDifficultyFit(eligible, targetDifficulty)) {
      pushUnique(q, "fallback");
    }
    return result;
  }

  if (mode === "missed_review") {
    const missedPool = eligible
      .filter((q) => {
        const misses = missedCountByQuestion.get(q.id) ?? 0;
        const srs = srsByQuestion.get(q.id);
        const lapses = srs?.lapses ?? 0;
        return misses > 0 || lapses > 0;
      })
      .sort((a, b) => {
        const scoreA =
          (missedCountByQuestion.get(a.id) ?? 0) +
          (srsByQuestion.get(a.id)?.lapses ?? 0);
        const scoreB =
          (missedCountByQuestion.get(b.id) ?? 0) +
          (srsByQuestion.get(b.id)?.lapses ?? 0);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return (
          Math.abs(a.difficulty - targetDifficulty) -
          Math.abs(b.difficulty - targetDifficulty)
        );
      });

    for (const q of missedPool) {
      pushUnique(q, "due");
    }
    // Backfill with due SRS items if fewer missed items exist
    const dueFallback = eligible.filter((q) => {
      const srs = srsByQuestion.get(q.id);
      return srs ? isCardDue(srs.due_at, nowIso, timeZone) : false;
    });
    for (const q of rankByDifficultyFit(dueFallback, targetDifficulty)) {
      pushUnique(q, "due");
    }
    return result;
  }

  // Default: daily_12 (~50% due, ~35% new-weakest, ~15% blueprint-weighted)
  const dueQuota = Math.round(count * 0.5);
  const newWeakestQuota = Math.round(count * 0.35);
  const blueprintQuota = Math.max(0, count - dueQuota - newWeakestQuota);

  // 1. Due SRS bucket (~50%)
  const dueCandidates = eligible
    .filter((q) => {
      const srs = srsByQuestion.get(q.id);
      return srs ? isCardDue(srs.due_at, nowIso, timeZone) : false;
    })
    .sort((a, b) => {
      const dueA = Date.parse(srsByQuestion.get(a.id)!.due_at);
      const dueB = Date.parse(srsByQuestion.get(b.id)!.due_at);
      if (dueA !== dueB) return dueA - dueB;
      return (
        Math.abs(a.difficulty - targetDifficulty) -
        Math.abs(b.difficulty - targetDifficulty)
      );
    });

  let dueTaken = 0;
  for (const q of dueCandidates) {
    if (dueTaken >= dueQuota) break;
    if (pushUnique(q, "due")) dueTaken += 1;
  }

  // 2. New-weakest bucket (~35%)
  const newWeakestCandidates = eligible
    .filter((q) => !pickedIds.has(q.id) && !attemptedQuestionIds.has(q.id))
    .sort((a, b) => {
      const rankA = masteryRank.get(a.topic_id) ?? 99;
      const rankB = masteryRank.get(b.topic_id) ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      return (
        Math.abs(a.difficulty - targetDifficulty) -
        Math.abs(b.difficulty - targetDifficulty)
      );
    });

  let newWeakestTaken = 0;
  for (const q of newWeakestCandidates) {
    if (newWeakestTaken >= newWeakestQuota) break;
    if (pushUnique(q, "new_weakest")) newWeakestTaken += 1;
  }

  // 3. Blueprint-weighted bucket (~15%)
  const blueprintCandidates = eligible
    .filter((q) => !pickedIds.has(q.id))
    .sort((a, b) => {
      const wA = blueprintWeightByTopic.get(a.topic_id) ?? 0;
      const wB = blueprintWeightByTopic.get(b.topic_id) ?? 0;
      if (wA !== wB) return wB - wA;
      return (
        Math.abs(a.difficulty - targetDifficulty) -
        Math.abs(b.difficulty - targetDifficulty)
      );
    });

  let blueprintTaken = 0;
  for (const q of blueprintCandidates) {
    if (blueprintTaken >= blueprintQuota) break;
    if (pushUnique(q, "blueprint")) blueprintTaken += 1;
  }

  // 4. Backfill remaining slots up to count with zero repeats
  for (const q of rankByDifficultyFit(eligible, targetDifficulty)) {
    if (result.length >= count) break;
    pushUnique(q, "fallback");
  }

  return result;
}

// ---------------------------------------------------------------------------
// Free-tier daily attempt cap checker (pure helper matching server trigger)
// ---------------------------------------------------------------------------

export function checkFreeTierAllowance(input: {
  planTier: PlanTier;
  attempts: AttemptRecord[];
  nowIso?: string;
  timeZone?: string;
}): FreeTierAllowanceResult {
  const {
    planTier,
    attempts,
    nowIso = new Date().toISOString(),
    timeZone = "UTC",
  } = input;

  const todayKey = getLocalDateKey(nowIso, timeZone);
  const usedToday = attempts.filter(
    (a) => getLocalDateKey(a.attempted_at, timeZone) === todayKey
  ).length;

  if (planTier !== "free") {
    return {
      allowed: true,
      remaining: Number.POSITIVE_INFINITY,
      usedToday,
      limit: Number.POSITIVE_INFINITY,
    };
  }

  const remaining = Math.max(0, FREE_TIER_DAILY_LIMIT - usedToday);
  return {
    allowed: usedToday < FREE_TIER_DAILY_LIMIT,
    remaining,
    usedToday,
    limit: FREE_TIER_DAILY_LIMIT,
  };
}
