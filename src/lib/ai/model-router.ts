import type { ExplainInput } from "./schemas";

export type ExplainModelTier = "routine" | "complex";

export interface ModelRoutingDecision {
  tier: ExplainModelTier;
  model: string;
}

export function selectExplainModel(input: ExplainInput): ModelRoutingDecision {
  const difficulty = input.question.difficulty ?? 3;
  const isComplex =
    input.question.type === "calc" ||
    input.question.type === "scenario" ||
    Boolean(input.calc_context) ||
    difficulty >= 4;

  if (isComplex) {
    return {
      tier: "complex",
      model: process.env.BENDLINE_AI_COMPLEX_MODEL ?? "gemini-2.5-flash",
    };
  }

  return {
    tier: "routine",
    model:
      process.env.BENDLINE_AI_ROUTINE_MODEL ?? "gemini-2.5-flash-lite",
  };
}

export class AiRateLimitError extends Error {
  readonly retryAfterSec: number;

  constructor(message: string, retryAfterSec = 60) {
    super(message);
    this.name = "AiRateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

export interface RateLimitConfig {
  maxPerMinute: number;
  maxPerDay: number;
}

export const DEFAULT_EXPLAIN_RATE_LIMIT: RateLimitConfig = {
  maxPerMinute: 20,
  maxPerDay: 100,
};

interface UserRateBucket {
  minuteTimestamps: number[];
  dayKey: string;
  dayCount: number;
}

const globalForRateLimit = globalThis as unknown as {
  __bendlineAiRateLimits?: Map<string, UserRateBucket>;
};

function getRateMap(): Map<string, UserRateBucket> {
  if (!globalForRateLimit.__bendlineAiRateLimits) {
    globalForRateLimit.__bendlineAiRateLimits = new Map();
  }
  return globalForRateLimit.__bendlineAiRateLimits;
}

export function resetRateLimiterForTests(): void {
  getRateMap().clear();
}

export async function checkPerUserRateLimit(
  userId: string,
  config: RateLimitConfig = DEFAULT_EXPLAIN_RATE_LIMIT,
  nowMs: number = Date.now()
): Promise<{ remainingMinute: number; remainingDay: number }> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const dayKey = new Date(nowMs).toISOString().slice(0, 10);

  if (upstashUrl && upstashToken) {
    try {
      const minuteBucket = Math.floor(nowMs / 60_000);
      const minKey = `bendline:ai:min:${userId}:${minuteBucket}`;
      const dayRedisKey = `bendline:ai:day:${userId}:${dayKey}`;

      const res = await fetch(`${upstashUrl}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", minKey],
          ["EXPIRE", minKey, 120],
          ["INCR", dayRedisKey],
          ["EXPIRE", dayRedisKey, 90_000],
        ]),
      });

      if (res.ok) {
        const data = (await res.json()) as Array<{ result?: number }>;
        const minCount = Number(data[0]?.result ?? 1);
        const dayCount = Number(data[2]?.result ?? 1);

        if (minCount > config.maxPerMinute) {
          throw new AiRateLimitError(
            `Rate limit exceeded: max ${config.maxPerMinute} AI explanations per minute.`,
            60
          );
        }
        if (dayCount > config.maxPerDay) {
          throw new AiRateLimitError(
            `Daily AI explanation limit reached (${config.maxPerDay}/day).`,
            3600
          );
        }

        return {
          remainingMinute: Math.max(0, config.maxPerMinute - minCount),
          remainingDay: Math.max(0, config.maxPerDay - dayCount),
        };
      }
    } catch (err) {
      if (err instanceof AiRateLimitError) throw err;
      // Fall back to in-memory limiter if Upstash is temporarily unreachable
    }
  }

  const map = getRateMap();
  const bucket = map.get(userId) ?? {
    minuteTimestamps: [],
    dayKey,
    dayCount: 0,
  };

  if (bucket.dayKey !== dayKey) {
    bucket.dayKey = dayKey;
    bucket.dayCount = 0;
  }

  const oneMinuteAgo = nowMs - 60_000;
  bucket.minuteTimestamps = bucket.minuteTimestamps.filter(
    (ts) => ts > oneMinuteAgo
  );

  if (bucket.minuteTimestamps.length >= config.maxPerMinute) {
    throw new AiRateLimitError(
      `Rate limit exceeded: max ${config.maxPerMinute} AI explanations per minute.`,
      60
    );
  }

  if (bucket.dayCount >= config.maxPerDay) {
    throw new AiRateLimitError(
      `Daily AI explanation limit reached (${config.maxPerDay}/day).`,
      3600
    );
  }

  bucket.minuteTimestamps.push(nowMs);
  bucket.dayCount += 1;
  map.set(userId, bucket);

  return {
    remainingMinute: config.maxPerMinute - bucket.minuteTimestamps.length,
    remainingDay: config.maxPerDay - bucket.dayCount,
  };
}
