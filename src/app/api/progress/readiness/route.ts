import { NextResponse } from "next/server";
import { z } from "zod";
import { SEED_TOPICS } from "@/lib/domain/seed-catalog";
import type { AttemptRecord } from "@/lib/domain/types";
import { recomputeReadinessFromAttempts } from "@/lib/progress/analytics";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const recomputePayloadSchema = z.object({
  attempts: z
    .array(
      z.object({
        id: z.string().min(1),
        question_id: z.string().min(1),
        topic_id: z.string().min(1),
        is_correct: z.boolean(),
        time_ms: z.number().int().min(0).default(0),
        mode: z.enum(["learn", "practice", "exam", "srs"]).default("practice"),
        error_type: z
          .enum([
            "concept",
            "lookup",
            "arithmetic",
            "misread",
            "edition_confusion",
            "unit",
          ])
          .nullable()
          .optional(),
        attempted_at: z.string().min(1),
      })
    )
    .max(5000)
    .default([]),
});

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (user) {
      const { data: rpcData, error } = await supabase.rpc(
        "recompute_user_readiness",
        { p_user_id: user.id }
      );
      if (!error && rpcData && typeof rpcData === "object") {
        const r = rpcData as {
          score_pct?: number | null;
          is_unlocked?: boolean;
          qualified_topics_count?: number;
          total_topics?: number;
          min_answers_per_topic?: number;
          total_answers?: number;
          recomputed_at?: string;
        };
        return NextResponse.json({
          source: "supabase_rpc",
          readiness: {
            scorePct: r.score_pct ?? null,
            isUnlocked: Boolean(r.is_unlocked),
            qualifiedTopicsCount: Number(r.qualified_topics_count ?? 0),
            totalTopics: Number(r.total_topics ?? SEED_TOPICS.length),
            minAnswersPerTopic: Number(r.min_answers_per_topic ?? 15),
            totalAnswers: Number(r.total_answers ?? 0),
            recomputedAt: r.recomputed_at ?? new Date().toISOString(),
          },
        });
      }
    }
  }

  return NextResponse.json({
    source: "server_function",
    readiness: recomputeReadinessFromAttempts(SEED_TOPICS, []),
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = recomputePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (user) {
      const { data: rpcData, error } = await supabase.rpc(
        "recompute_user_readiness",
        { p_user_id: user.id }
      );
      if (!error && rpcData && typeof rpcData === "object") {
        const r = rpcData as {
          score_pct?: number | null;
          is_unlocked?: boolean;
          qualified_topics_count?: number;
          total_topics?: number;
          min_answers_per_topic?: number;
          total_answers?: number;
          recomputed_at?: string;
        };
        return NextResponse.json({
          source: "supabase_rpc",
          readiness: {
            scorePct: r.score_pct ?? null,
            isUnlocked: Boolean(r.is_unlocked),
            qualifiedTopicsCount: Number(r.qualified_topics_count ?? 0),
            totalTopics: Number(r.total_topics ?? SEED_TOPICS.length),
            minAnswersPerTopic: Number(r.min_answers_per_topic ?? 15),
            totalAnswers: Number(r.total_answers ?? 0),
            recomputedAt: r.recomputed_at ?? new Date().toISOString(),
          },
        });
      }
    }
  }

  const readiness = recomputeReadinessFromAttempts(
    SEED_TOPICS,
    parsed.data.attempts as AttemptRecord[]
  );

  return NextResponse.json({
    source: "server_function",
    readiness,
  });
}
