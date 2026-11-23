import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveEntitlement,
  type SubscriptionSnapshot,
} from "@/lib/billing/entitlements";
import {
  LOCAL_PREVIEW_USER_ID,
  getDefaultBillingStore,
} from "@/lib/billing/stripe-server";
import { getProcessedAttemptIdSet } from "@/lib/offline/server-idempotency";
import {
  FREE_TIER_DAILY_LIMIT,
  computeSm2Update,
  getLocalDateKey,
} from "@/lib/srs";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const errorTypeEnum = z.enum([
  "concept",
  "lookup",
  "arithmetic",
  "misread",
  "edition_confusion",
  "unit",
]);

const attemptPayloadSchema = z.object({
  questionId: z.string().uuid(),
  selectedIndex: z.number().int().min(0),
  isCorrect: z.boolean(),
  timeMs: z.number().int().min(0).default(0),
  mode: z.enum(["learn", "practice", "exam", "srs"]).default("practice"),
  errorType: errorTypeEnum.nullable().optional(),
  clientAttemptId: z.string().uuid().optional(),
  timeZone: z.string().min(1).default("UTC"),
});

const patchAttemptErrorSchema = z.object({
  attemptId: z.string().min(1),
  errorType: errorTypeEnum,
});

const FREE_CAP_COOKIE = "bendline_free_daily";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = attemptPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const headerKey = request.headers.get("Idempotency-Key");
  const effectiveAttemptId =
    input.clientAttemptId ??
    (headerKey && z.string().uuid().safeParse(headerKey).success
      ? headerKey
      : undefined);

  const nowIso = new Date().toISOString();
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (user) {
      if (effectiveAttemptId) {
        const { data: duplicateAttempt } = await supabase
          .from("attempts")
          .select("id, is_correct")
          .eq("user_id", user.id)
          .eq("client_attempt_id", effectiveAttemptId)
          .maybeSingle();

        if (duplicateAttempt) {
          return NextResponse.json({
            ok: true,
            deduplicated: true,
            isCorrect: duplicateAttempt.is_correct,
            clientAttemptId: effectiveAttemptId,
          });
        }
      }

      // 1. Verify question is in servable_questions (published + approved current version)
      const { data: servableQ, error: qError } = await supabase
        .from("servable_questions")
        .select("id, version, correct_index")
        .eq("id", input.questionId)
        .maybeSingle();

      if (qError || !servableQ) {
        return NextResponse.json(
          { error: "QUESTION_NOT_SERVABLE" },
          { status: 404 }
        );
      }

      // 2. Check subscription entitlement server-side (honoring 3-day past_due grace)
      const { data: sub } = await supabase
        .from("subscriptions")
        .select(
          "plan_tier, status, current_period_end, last_payment_failed_at, grace_period_ends_at, stripe_customer_id, cancel_at_period_end"
        )
        .eq("user_id", user.id)
        .maybeSingle();

      const entitlement = resolveEntitlement(
        (sub as SubscriptionSnapshot | null) ?? null,
        nowIso
      );

      if (!entitlement.hasProAccess) {
        const utcDayStart = `${nowIso.slice(0, 10)}T00:00:00.000Z`;
        const { count } = await supabase
          .from("attempts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("attempted_at", utcDayStart);

        if ((count ?? 0) >= FREE_TIER_DAILY_LIMIT) {
          return NextResponse.json(
            {
              error: "FREE_TIER_DAILY_CAP_REACHED",
              limit: FREE_TIER_DAILY_LIMIT,
              usedToday: count ?? FREE_TIER_DAILY_LIMIT,
            },
            { status: 429 }
          );
        }
      }

      // 3. Insert attempt (DB trigger enforce_free_tier_attempt_cap also guards)
      const serverIsCorrect = input.selectedIndex === servableQ.correct_index;
      const { error: insertError } = await supabase.from("attempts").insert({
        user_id: user.id,
        question_id: servableQ.id,
        question_version: servableQ.version,
        selected_index: input.selectedIndex,
        is_correct: serverIsCorrect,
        time_ms: input.timeMs,
        mode: input.mode,
        error_type: serverIsCorrect ? null : (input.errorType ?? null),
        client_attempt_id: effectiveAttemptId ?? null,
        attempted_at: nowIso,
      });

      if (insertError) {
        if (insertError.code === "23505" && effectiveAttemptId) {
          return NextResponse.json({
            ok: true,
            deduplicated: true,
            isCorrect: serverIsCorrect,
            clientAttemptId: effectiveAttemptId,
          });
        }
        if (insertError.message.includes("FREE_TIER_DAILY_CAP_REACHED")) {
          return NextResponse.json(
            {
              error: "FREE_TIER_DAILY_CAP_REACHED",
              limit: FREE_TIER_DAILY_LIMIT,
            },
            { status: 429 }
          );
        }
        return NextResponse.json(
          { error: "ATTEMPT_PERSIST_FAILED" },
          { status: 500 }
        );
      }

      // 4. Upsert SM-2 state
      const { data: existingSrs } = await supabase
        .from("srs_state")
        .select("interval_days, repetitions, ease_factor, lapses")
        .eq("user_id", user.id)
        .eq("question_id", servableQ.id)
        .maybeSingle();

      const nextSm2 = computeSm2Update(existingSrs ?? null, {
        isCorrect: serverIsCorrect,
        timeMs: input.timeMs,
        reviewedAt: nowIso,
        timeZone: input.timeZone,
      });

      await supabase.from("srs_state").upsert(
        {
          user_id: user.id,
          question_id: servableQ.id,
          due_at: nextSm2.due_at,
          interval_days: nextSm2.interval_days,
          ease_factor: nextSm2.ease_factor,
          repetitions: nextSm2.repetitions,
          lapses: nextSm2.lapses,
          last_reviewed_at: nextSm2.last_reviewed_at,
        },
        { onConflict: "user_id,question_id" }
      );

      return NextResponse.json({
        ok: true,
        deduplicated: false,
        isCorrect: serverIsCorrect,
        srsState: nextSm2,
      });
    }
  }

  // Local / preview fallback when Supabase session is absent
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  try {
    cookieStore = await cookies();
  } catch {
    cookieStore = null;
  }
  const todayKey = getLocalDateKey(nowIso, input.timeZone);
  let usedToday = 0;

  const rawCookie = cookieStore?.get(FREE_CAP_COOKIE)?.value;
  if (rawCookie) {
    try {
      const decoded = JSON.parse(rawCookie) as { day?: string; count?: number };
      if (decoded.day === todayKey && typeof decoded.count === "number") {
        usedToday = decoded.count;
      }
    } catch {
      usedToday = 0;
    }
  }

  const processedIds = getProcessedAttemptIdSet();
  if (effectiveAttemptId && processedIds.has(effectiveAttemptId)) {
    return NextResponse.json({
      ok: true,
      deduplicated: true,
      clientAttemptId: effectiveAttemptId,
      usedToday,
      limit: FREE_TIER_DAILY_LIMIT,
    });
  }

  const localSub = await getDefaultBillingStore().getSubscriptionByUserId(
    LOCAL_PREVIEW_USER_ID
  );
  const localEntitlement = resolveEntitlement(localSub, nowIso);

  if (!localEntitlement.hasProAccess && usedToday >= FREE_TIER_DAILY_LIMIT) {
    return NextResponse.json(
      {
        error: "FREE_TIER_DAILY_CAP_REACHED",
        limit: FREE_TIER_DAILY_LIMIT,
        usedToday,
      },
      { status: 429 }
    );
  }

  if (effectiveAttemptId) {
    processedIds.add(effectiveAttemptId);
  }

  const nextCount = localEntitlement.hasProAccess ? usedToday : usedToday + 1;
  const response = NextResponse.json({
    ok: true,
    deduplicated: false,
    clientAttemptId: effectiveAttemptId ?? null,
    usedToday: nextCount,
    limit: localEntitlement.hasProAccess ? null : FREE_TIER_DAILY_LIMIT,
  });

  if (!localEntitlement.hasProAccess && cookieStore) {
    response.cookies.set(
      FREE_CAP_COOKIE,
      JSON.stringify({ day: todayKey, count: nextCount }),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      }
    );
  }

  return response;
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = patchAttemptErrorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      await supabase
        .from("attempts")
        .update({ error_type: parsed.data.errorType })
        .eq("user_id", userData.user.id)
        .or(
          `id.eq.${parsed.data.attemptId},client_attempt_id.eq.${parsed.data.attemptId}`
        );
    }
  }

  return NextResponse.json({
    ok: true,
    errorType: parsed.data.errorType,
  });
}

export async function DELETE() {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  getProcessedAttemptIdSet().clear();
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(FREE_CAP_COOKIE);
  return response;
}
