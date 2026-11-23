import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { POST as checkoutPost } from "@/app/api/billing/checkout/route";
import { POST as stripeWebhookPost } from "@/app/api/stripe/webhook/route";
import { POST as draftSyncPost } from "@/app/api/draw/drafts/route";
import { getProcessedDraftKeySet } from "@/lib/offline/server-idempotency";
import {
  DELETE as attemptDelete,
  POST as attemptPost,
} from "@/app/api/practice/attempt/route";
import {
  createDraftDrawingExerciseSchema,
  draftQuestionOutputSchema,
  skepticalReviewOutputSchema,
} from "@/lib/ai/content-prompts";
import {
  GRACE_PERIOD_MS,
  computeGraceEndIso,
  resolveEntitlement,
} from "@/lib/billing/entitlements";
import {
  LOCAL_PREVIEW_USER_ID,
  createInMemoryBillingStore,
  getDefaultBillingStore,
  getPriceIdForPlan,
  processStripeWebhookEvent,
  resolvePlanFromPriceId,
} from "@/lib/billing/stripe-server";
import { SEED_DRILL_QUESTIONS } from "@/lib/domain/seed-catalog";
import type { AttemptRecord, SrsStateRecord } from "@/lib/domain/types";
import { BendlineOfflineDB } from "@/lib/offline/db";
import {
  replayPendingOutbox,
  writeAttemptAndEnqueueOutbox,
  writeDrawingDraftAndEnqueueOutbox,
} from "@/lib/offline/outbox";

const TEST_WEBHOOK_SECRET = "whsec_bendline_test_secret_12345";
const ORIGINAL_ENV = { ...process.env };

function buildSignedWebhookRequest(eventPayload: Record<string, unknown>, secret = TEST_WEBHOOK_SECRET) {
  const stripe = new Stripe("sk_test_signing_helper");
  const payloadString = JSON.stringify(eventPayload);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: payloadString,
    secret,
  });
  return new Request("http://127.0.0.1:3000/api/stripe/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body: payloadString,
  });
}

describe("Stripe billing, 3-day grace, webhooks, and offline transactional outbox", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_route_validation";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    getDefaultBillingStore().processedEventIds.clear();
    getDefaultBillingStore().subscriptionsByUserId.clear();
    getProcessedDraftKeySet().clear();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reads Stripe price IDs strictly from env vars and rejects checkout if missing", async () => {
    delete process.env.STRIPE_PRICE_ID_PASS_3M;
    delete process.env.STRIPE_PRICE_ID_MONTHLY;

    expect(getPriceIdForPlan("pro_exam_pass")).toBeNull();
    expect(getPriceIdForPlan("pro_monthly")).toBeNull();

    const res = await checkoutPost(
      new Request("http://127.0.0.1:3000/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro_exam_pass" }),
      })
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { mode: string; missingEnv: string[] };
    expect(body.mode).toBe("unconfigured");
    expect(body.missingEnv).toContain("STRIPE_PRICE_ID_PASS_3M");

    process.env.STRIPE_PRICE_ID_PASS_3M = "price_env_3m_test";
    process.env.STRIPE_PRICE_ID_MONTHLY = "price_env_monthly_test";
    expect(getPriceIdForPlan("pro_exam_pass")).toBe("price_env_3m_test");
    expect(getPriceIdForPlan("pro_monthly")).toBe("price_env_monthly_test");
    expect(resolvePlanFromPriceId("price_env_3m_test")).toBe("pro_exam_pass");
    expect(resolvePlanFromPriceId("price_env_monthly_test")).toBe("pro_monthly");
  });

  it("verifies webhook signatures and treats duplicate Stripe event deliveries as idempotent no-ops", async () => {
    const unsignedRes = await stripeWebhookPost(
      new Request("http://127.0.0.1:3000/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ id: "evt_unsigned" }),
      })
    );
    expect(unsignedRes.status).toBe(400);

    const createdSec = Math.floor(Date.UTC(2026, 10, 20, 12, 0, 0) / 1000);
    const checkoutEventPayload = {
      id: "evt_dup_checkout_001",
      object: "event",
      api_version: "2025-02-24.acacia",
      created: createdSec,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          object: "checkout.session",
          mode: "payment",
          customer: "cus_test_001",
          subscription: null,
          client_reference_id: LOCAL_PREVIEW_USER_ID,
          metadata: {
            user_id: LOCAL_PREVIEW_USER_ID,
            plan_tier: "pro_exam_pass",
            price_id: "price_env_3m_test",
          },
        },
      },
    };

    const firstRes = await stripeWebhookPost(
      buildSignedWebhookRequest(checkoutEventPayload)
    );
    expect(firstRes.status).toBe(200);
    const firstJson = (await firstRes.json()) as {
      duplicate: boolean;
      applied: boolean;
      subscription: { plan_tier: string; status: string };
    };
    expect(firstJson.duplicate).toBe(false);
    expect(firstJson.applied).toBe(true);
    expect(firstJson.subscription.plan_tier).toBe("pro_exam_pass");

    // Mutate stored state artificially to verify duplicate event NEVER re-runs handler logic
    const storedBefore = getDefaultBillingStore().subscriptionsByUserId.get(
      LOCAL_PREVIEW_USER_ID
    );
    expect(storedBefore).toBeDefined();

    const secondRes = await stripeWebhookPost(
      buildSignedWebhookRequest(checkoutEventPayload)
    );
    expect(secondRes.status).toBe(200);
    const secondJson = (await secondRes.json()) as {
      duplicate: boolean;
      applied: boolean;
      subscription: null;
    };
    expect(secondJson.duplicate).toBe(true);
    expect(secondJson.applied).toBe(false);
    expect(secondJson.subscription).toBeNull();
  });

  it("enforces exact 3-day failed-payment grace period without extending on retry invoices", async () => {
    const store = createInMemoryBillingStore();
    const userId = "user-grace-1";
    await store.upsertSubscription({
      user_id: userId,
      stripe_customer_id: "cus_grace_1",
      stripe_subscription_id: "sub_grace_1",
      stripe_price_id: "price_monthly",
      plan_tier: "pro_monthly",
      status: "active",
      current_period_start: "2026-11-01T00:00:00.000Z",
      current_period_end: "2026-12-01T00:00:00.000Z",
    });

    const failT0Sec = Math.floor(Date.UTC(2026, 10, 20, 10, 0, 0) / 1000);
    const failT0Iso = new Date(failT0Sec * 1000).toISOString();
    const expectedGraceEnd = computeGraceEndIso(failT0Iso);

    await processStripeWebhookEvent(
      {
        id: "evt_fail_1",
        object: "event",
        created: failT0Sec,
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_fail_1",
            customer: "cus_grace_1",
            parent: { subscription_details: { subscription: "sub_grace_1" } },
          },
        },
      } as unknown as Stripe.Event,
      store
    );

    const pastDueSub = await store.getSubscriptionByUserId(userId);
    expect(pastDueSub?.status).toBe("past_due");
    expect(pastDueSub?.grace_period_ends_at).toBe(expectedGraceEnd);

    // Inside 3-day grace (+71h59m): still Pro
    const insideGrace = resolveEntitlement(
      pastDueSub,
      new Date(failT0Sec * 1000 + GRACE_PERIOD_MS - 60_000).toISOString()
    );
    expect(insideGrace.hasProAccess).toBe(true);
    expect(insideGrace.inGracePeriod).toBe(true);
    expect(insideGrace.effectivePlan).toBe("pro_monthly");

    // Retry dunning event 24h later must NOT extend grace window
    await processStripeWebhookEvent(
      {
        id: "evt_fail_2",
        object: "event",
        created: failT0Sec + 24 * 3600,
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_fail_2",
            customer: "cus_grace_1",
            parent: { subscription_details: { subscription: "sub_grace_1" } },
          },
        },
      } as unknown as Stripe.Event,
      store
    );
    const afterRetry = await store.getSubscriptionByUserId(userId);
    expect(afterRetry?.grace_period_ends_at).toBe(expectedGraceEnd);

    // Past 3-day grace (+72h01m): downgraded cleanly to Free
    const expiredGrace = resolveEntitlement(
      afterRetry,
      new Date(failT0Sec * 1000 + GRACE_PERIOD_MS + 60_000).toISOString()
    );
    expect(expiredGrace.hasProAccess).toBe(false);
    expect(expiredGrace.effectivePlan).toBe("free");
    expect(expiredGrace.dailyPracticeLimit).toBe(12);

    // Recovery payment clears grace window and restores active status
    await processStripeWebhookEvent(
      {
        id: "evt_recover_1",
        object: "event",
        created: failT0Sec + 36 * 3600,
        type: "invoice.payment_succeeded",
        data: {
          object: {
            id: "in_paid_1",
            customer: "cus_grace_1",
            period_end: failT0Sec + 30 * 24 * 3600,
            parent: { subscription_details: { subscription: "sub_grace_1" } },
          },
        },
      } as unknown as Stripe.Event,
      store
    );
    const recoveredSub = await store.getSubscriptionByUserId(userId);
    const recoveredEnt = resolveEntitlement(recoveredSub);
    expect(recoveredEnt.hasProAccess).toBe(true);
    expect(recoveredEnt.inGracePeriod).toBe(false);
    expect(recoveredSub?.status).toBe("active");
    expect(recoveredSub?.grace_period_ends_at).toBeNull();
  });

  it("writes attempts and drawing drafts with UUID idempotency keys in atomic Dexie transactions and replays idempotently", async () => {
    await attemptDelete();

    const db = new BendlineOfflineDB(`test-outbox-${crypto.randomUUID()}`);
    const attemptUuid = crypto.randomUUID();
    const targetQ = SEED_DRILL_QUESTIONS[0];

    const attempt: AttemptRecord = {
      id: attemptUuid,
      question_id: targetQ.id,
      topic_id: targetQ.topic_id,
      is_correct: true,
      time_ms: 4200,
      mode: "practice",
      error_type: null,
      attempted_at: "2026-11-21T10:00:00.000Z",
    };

    const srsState: SrsStateRecord = {
      id: crypto.randomUUID(),
      question_id: targetQ.id,
      due_at: "2026-11-22T10:00:00.000Z",
      interval_days: 1,
      repetitions: 1,
      ease_factor: 2.5,
      lapses: 0,
      last_reviewed_at: "2026-11-21T10:00:00.000Z",
    };

    const attemptOutbox = await writeAttemptAndEnqueueOutbox(db, {
      attempt,
      srsState,
      requestPayload: {
        questionId: targetQ.id,
        selectedIndex: targetQ.correct_index,
        isCorrect: true,
        timeMs: 4200,
        mode: "practice",
        timeZone: "UTC",
      },
      idempotencyKey: attemptUuid,
    });

    const draftUuid = crypto.randomUUID();
    const exerciseUuid = crypto.randomUUID();
    const draftOutbox = await writeDrawingDraftAndEnqueueOutbox(
      db,
      {
        id: `${exerciseUuid}::practice`,
        exercise_id: exerciseUuid,
        mode: "practice",
        graph: { nodes: [], edges: [] },
        elapsed_ms: 0,
        updated_at: "2026-11-21T10:01:00.000Z",
      },
      draftUuid
    );

    expect(attemptOutbox.idempotency_key).toBe(attemptUuid);
    expect(draftOutbox.idempotency_key).toBe(draftUuid);
    expect(await db.attempts.count()).toBe(1);
    expect(await db.srsState.count()).toBe(1);
    expect(await db.drawingDrafts.count()).toBe(1);
    expect(await db.outbox.where("status").equals("pending").count()).toBe(2);

    // Offline replay failure leaves items pending
    const offlineReplay = await replayPendingOutbox(db, () =>
      Promise.reject(new TypeError("Network offline"))
    );
    expect(offlineReplay.attempted).toBe(2);
    expect(offlineReplay.synced).toBe(0);
    expect(offlineReplay.remainingPending).toBe(2);

    // Replay onto real route handlers twice with identical UUID keys -> deduplicates cleanly
    const seenHeaders: string[] = [];
    const routeBackedFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const hdrKey =
        (init?.headers as Record<string, string>)?.["Idempotency-Key"] ?? "";
      seenHeaders.push(hdrKey);
      const req = new Request(`http://127.0.0.1:3000${url}`, {
        method: init?.method ?? "POST",
        headers: init?.headers,
        body: init?.body,
      });
      if (url.endsWith("/api/practice/attempt")) {
        return attemptPost(req);
      }
      if (url.endsWith("/api/draw/drafts")) {
        return draftSyncPost(req);
      }
      throw new Error(`Unexpected replay URL ${url}`);
    };

    const onlineReplay = await replayPendingOutbox(db, routeBackedFetch);
    expect(onlineReplay.synced).toBe(2);
    expect(onlineReplay.remainingPending).toBe(0);
    expect(seenHeaders).toContain(attemptUuid);
    expect(seenHeaders).toContain(draftUuid);

    // Direct duplicate POST with exact same UUIDs must return deduplicated: true without incrementing cap
    const dupAttemptRes = await attemptPost(
      new Request("http://127.0.0.1:3000/api/practice/attempt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attemptUuid,
        },
        body: JSON.stringify({
          questionId: targetQ.id,
          selectedIndex: targetQ.correct_index,
          isCorrect: true,
          timeMs: 4200,
          mode: "practice",
          clientAttemptId: attemptUuid,
          timeZone: "UTC",
        }),
      })
    );
    const dupAttemptJson = (await dupAttemptRes.json()) as {
      deduplicated: boolean;
    };
    expect(dupAttemptJson.deduplicated).toBe(true);

    const dupDraftRes = await draftSyncPost(
      new Request("http://127.0.0.1:3000/api/draw/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": draftUuid,
        },
        body: JSON.stringify({
          idempotencyKey: draftUuid,
          draftId: `${exerciseUuid}::practice`,
          exerciseId: exerciseUuid,
          mode: "practice",
          graph: { nodes: [], edges: [] },
          elapsedMs: 0,
          updatedAt: "2026-11-21T10:01:00.000Z",
        }),
      })
    );
    const dupDraftJson = (await dupDraftRes.json()) as {
      deduplicated: boolean;
    };
    expect(dupDraftJson.deduplicated).toBe(true);

    await db.delete();
  });

  it("validates authoring, skeptical review, and drawing exercise schemas", () => {
    const badAllOfAbove = draftQuestionOutputSchema.safeParse({
      stem: "What connects a water closet branch cleanly?",
      options: ["Sanitary tee", "Wye", "All of the above", "Cross"],
      correct_index: 1,
      explanation_seed: "Horizontal drainage uses swept wye fittings.",
      code_ref: "Drainage fittings guidance",
      difficulty: 2,
      type: "mcq",
      error_tags: ["concept"],
    });
    expect(badAllOfAbove.success).toBe(false);

    const validCalc = draftQuestionOutputSchema.safeParse({
      stem: "Compute total pipe size for {{VALUE}} fixture units.",
      options: ["2 in", "3 in", "4 in", "6 in"],
      correct_index: 1,
      explanation_seed: "Resolved deterministically against {{VALUE}} DFU.",
      code_ref: "Drain sizing table topic",
      difficulty: 3,
      type: "calc",
      error_tags: ["arithmetic", "lookup"],
    });
    expect(validCalc.success).toBe(true);

    const reviewCheck = skepticalReviewOutputSchema.safeParse({
      id: "q-1",
      scores: {
        key_accuracy: 5,
        distractors: 4,
        edition_fit: 5,
        clarity: 4,
        source_support: 5,
        blueprint_difficulty: 4,
        explanation: 5,
        language_fairness: 5,
      },
      verdict: "pass",
      issues: [],
      suggested_fix: "",
    });
    expect(reviewCheck.success).toBe(true);

    const exerciseSchema = createDraftDrawingExerciseSchema([
      "trap_required",
      "vent_to_terminal",
    ]);
    expect(
      exerciseSchema.safeParse({
        title: "Lavatory wet vent layout",
        prompt_md: "Route lavatory and WC to stack with VTR termination.",
        fixtures: [{ type: "lav", grid_pos: [0, 0, 0] }],
        pipe_system: "dwv",
        constraints: ["Trap each fixture"],
        scoring_rubric: [
          {
            criterion: "Invented rule",
            points: 20,
            rule_key: "non_existent_rule",
          },
        ],
      }).success
    ).toBe(false);
  });
});
