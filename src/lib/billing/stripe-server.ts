import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanTier } from "@/lib/domain/types";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import {
  computeGraceEndIso,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
} from "./entitlements";
import type { CheckoutPlanId } from "./plans";

export const LOCAL_PREVIEW_USER_ID = "local-journeyman-profile";

export interface BillingPersistenceAdapter {
  claimEventId(eventId: string, eventType: string): Promise<{ claimed: boolean }>;
  getSubscriptionByUserId(userId: string): Promise<SubscriptionSnapshot | null>;
  findSubscription(lookup: {
    userId?: string | null;
    customerId?: string | null;
    subscriptionId?: string | null;
  }): Promise<SubscriptionSnapshot | null>;
  upsertSubscription(
    sub: SubscriptionSnapshot & { user_id: string }
  ): Promise<SubscriptionSnapshot>;
}

export interface WebhookProcessResult {
  received: boolean;
  duplicate: boolean;
  applied: boolean;
  eventId: string;
  eventType: string;
  subscription: SubscriptionSnapshot | null;
}

export class StripeWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeWebhookVerificationError";
  }
}

export function getStripePriceEnvConfig() {
  const pass3mPriceId = process.env.STRIPE_PRICE_ID_PASS_3M?.trim() || null;
  const monthlyPriceId = process.env.STRIPE_PRICE_ID_MONTHLY?.trim() || null;
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() || null;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://127.0.0.1:3000";

  return {
    pass3mPriceId,
    monthlyPriceId,
    secretKey,
    webhookSecret,
    appUrl,
    stripeConfigured: Boolean(secretKey),
    pass3mConfigured: Boolean(pass3mPriceId),
    monthlyConfigured: Boolean(monthlyPriceId),
    webhookConfigured: Boolean(webhookSecret),
  };
}

export function getPriceIdForPlan(plan: CheckoutPlanId): string | null {
  const cfg = getStripePriceEnvConfig();
  return plan === "pro_exam_pass" ? cfg.pass3mPriceId : cfg.monthlyPriceId;
}

export function resolvePlanFromPriceId(
  priceId: string | null | undefined,
  fallbackTier: PlanTier = "pro_monthly"
): PlanTier {
  const cfg = getStripePriceEnvConfig();
  if (priceId && cfg.pass3mPriceId && priceId === cfg.pass3mPriceId) {
    return "pro_exam_pass";
  }
  if (priceId && cfg.monthlyPriceId && priceId === cfg.monthlyPriceId) {
    return "pro_monthly";
  }
  return fallbackTier;
}

export function getStripeClient(): Stripe | null {
  const { secretKey } = getStripePriceEnvConfig();
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

export function createInMemoryBillingStore(): BillingPersistenceAdapter & {
  processedEventIds: Set<string>;
  subscriptionsByUserId: Map<string, SubscriptionSnapshot>;
} {
  const processedEventIds = new Set<string>();
  const subscriptionsByUserId = new Map<string, SubscriptionSnapshot>();

  return {
    processedEventIds,
    subscriptionsByUserId,
    async claimEventId(eventId: string) {
      if (processedEventIds.has(eventId)) {
        return { claimed: false };
      }
      processedEventIds.add(eventId);
      return { claimed: true };
    },
    async getSubscriptionByUserId(userId: string) {
      return subscriptionsByUserId.get(userId) ?? null;
    },
    async findSubscription({ userId, customerId, subscriptionId }) {
      if (userId && subscriptionsByUserId.has(userId)) {
        return subscriptionsByUserId.get(userId) ?? null;
      }
      for (const sub of subscriptionsByUserId.values()) {
        if (subscriptionId && sub.stripe_subscription_id === subscriptionId) {
          return sub;
        }
        if (customerId && sub.stripe_customer_id === customerId) {
          return sub;
        }
      }
      return null;
    },
    async upsertSubscription(sub) {
      const normalized: SubscriptionSnapshot = {
        user_id: sub.user_id,
        stripe_customer_id: sub.stripe_customer_id ?? null,
        stripe_subscription_id: sub.stripe_subscription_id ?? null,
        stripe_price_id: sub.stripe_price_id ?? null,
        plan_tier: sub.plan_tier,
        status: sub.status,
        current_period_start: sub.current_period_start ?? null,
        current_period_end: sub.current_period_end ?? null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        last_payment_failed_at: sub.last_payment_failed_at ?? null,
        grace_period_ends_at: sub.grace_period_ends_at ?? null,
      };
      subscriptionsByUserId.set(sub.user_id, normalized);
      return normalized;
    },
  };
}

const globalForBilling = globalThis as unknown as {
  __bendlineBillingStore?: ReturnType<typeof createInMemoryBillingStore>;
};

export function getDefaultBillingStore() {
  if (!globalForBilling.__bendlineBillingStore) {
    globalForBilling.__bendlineBillingStore = createInMemoryBillingStore();
  }
  return globalForBilling.__bendlineBillingStore;
}

export function createSupabaseBillingStore(
  supabase: SupabaseClient
): BillingPersistenceAdapter {
  return {
    async claimEventId(eventId: string, eventType: string) {
      const { error } = await supabase.from("stripe_webhook_events").insert({
        event_id: eventId,
        event_type: eventType,
        status: "processed",
      });
      if (error) {
        if (error.code === "23505") {
          return { claimed: false };
        }
        throw new Error(`STRIPE_EVENT_CLAIM_FAILED: ${error.message}`);
      }
      return { claimed: true };
    },

    async getSubscriptionByUserId(userId: string) {
      const { data } = await supabase
        .from("subscriptions")
        .select(
          "user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan_tier, status, current_period_start, current_period_end, cancel_at_period_end, last_payment_failed_at, grace_period_ends_at"
        )
        .eq("user_id", userId)
        .maybeSingle();
      return (data as SubscriptionSnapshot | null) ?? null;
    },

    async findSubscription({ userId, customerId, subscriptionId }) {
      if (userId) {
        const byUser = await this.getSubscriptionByUserId(userId);
        if (byUser) return byUser;
      }
      if (subscriptionId) {
        const { data } = await supabase
          .from("subscriptions")
          .select(
            "user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan_tier, status, current_period_start, current_period_end, cancel_at_period_end, last_payment_failed_at, grace_period_ends_at"
          )
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();
        if (data) return data as SubscriptionSnapshot;
      }
      if (customerId) {
        const { data } = await supabase
          .from("subscriptions")
          .select(
            "user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan_tier, status, current_period_start, current_period_end, cancel_at_period_end, last_payment_failed_at, grace_period_ends_at"
          )
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (data) return data as SubscriptionSnapshot;
      }
      return null;
    },

    async upsertSubscription(sub) {
      const payload = {
        user_id: sub.user_id,
        stripe_customer_id: sub.stripe_customer_id ?? null,
        stripe_subscription_id: sub.stripe_subscription_id ?? null,
        stripe_price_id: sub.stripe_price_id ?? null,
        plan_tier: sub.plan_tier,
        status: sub.status,
        current_period_start: sub.current_period_start ?? null,
        current_period_end: sub.current_period_end ?? null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        last_payment_failed_at: sub.last_payment_failed_at ?? null,
        grace_period_ends_at: sub.grace_period_ends_at ?? null,
      };
      const { data, error } = await supabase
        .from("subscriptions")
        .upsert(payload, { onConflict: "user_id" })
        .select(
          "user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan_tier, status, current_period_start, current_period_end, cancel_at_period_end, last_payment_failed_at, grace_period_ends_at"
        )
        .single();
      if (error || !data) {
        throw new Error(
          `SUBSCRIPTION_UPSERT_FAILED: ${error?.message ?? "unknown error"}`
        );
      }
      return data as SubscriptionSnapshot;
    },
  };
}

export function getActiveBillingStore(): BillingPersistenceAdapter {
  const serviceClient = createServiceRoleSupabaseClient();
  if (serviceClient) {
    return createSupabaseBillingStore(serviceClient);
  }
  return getDefaultBillingStore();
}

function unixToIso(sec: number | null | undefined): string | null {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) {
    return null;
  }
  return new Date(sec * 1000).toISOString();
}

function extractCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = invoice.parent?.subscription_details?.subscription;
  if (typeof fromParent === "string") return fromParent;
  if (fromParent && typeof fromParent === "object") return fromParent.id;

  const legacy = (
    invoice as unknown as {
      subscription?: string | { id: string } | null;
    }
  ).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;
  return null;
}

function extractSubscriptionPeriod(sub: Stripe.Subscription): {
  periodStart: string | null;
  periodEnd: string | null;
} {
  const firstItem = sub.items?.data?.[0];
  const topLevel = sub as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  return {
    periodStart:
      unixToIso(firstItem?.current_period_start) ??
      unixToIso(topLevel.current_period_start),
    periodEnd:
      unixToIso(firstItem?.current_period_end) ??
      unixToIso(topLevel.current_period_end),
  };
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status as string) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    case "paused":
      return "paused";
    default:
      return "incomplete";
  }
}

export function verifyAndConstructStripeEvent(
  rawBody: string,
  signature: string | null
): Stripe.Event {
  const { secretKey, webhookSecret } = getStripePriceEnvConfig();
  if (!webhookSecret) {
    throw new StripeWebhookVerificationError(
      "STRIPE_WEBHOOK_SECRET is not configured."
    );
  }
  if (!signature) {
    throw new StripeWebhookVerificationError("Missing stripe-signature header.");
  }

  const stripe = new Stripe(secretKey || "sk_test_webhook_verifier_only");
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    throw new StripeWebhookVerificationError(
      err instanceof Error ? err.message : "Invalid Stripe webhook signature."
    );
  }
}

export async function processStripeWebhookEvent(
  event: Stripe.Event,
  store: BillingPersistenceAdapter = getActiveBillingStore(),
  nowIso: string = new Date().toISOString()
): Promise<WebhookProcessResult> {
  const { claimed } = await store.claimEventId(event.id, event.type);
  if (!claimed) {
    return {
      received: true,
      duplicate: true,
      applied: false,
      eventId: event.id,
      eventType: event.type,
      subscription: null,
    };
  }

  const eventTimestampIso = unixToIso(event.created) ?? nowIso;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId =
        session.metadata?.user_id ||
        session.client_reference_id ||
        LOCAL_PREVIEW_USER_ID;
      const customerId = extractCustomerId(session.customer);
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;

      const metaPlan = session.metadata?.plan_tier as PlanTier | undefined;
      const priceId = session.metadata?.price_id ?? null;
      const inferredTier: PlanTier =
        metaPlan === "pro_exam_pass" || metaPlan === "pro_monthly"
          ? metaPlan
          : session.mode === "payment"
            ? "pro_exam_pass"
            : resolvePlanFromPriceId(priceId, "pro_monthly");

      const periodStart = eventTimestampIso;
      const periodEnd =
        inferredTier === "pro_exam_pass"
          ? new Date(Date.parse(periodStart) + 90 * 24 * 60 * 60 * 1000).toISOString()
          : null;

      const updated = await store.upsertSubscription({
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: priceId ?? getPriceIdForPlan(
          inferredTier === "pro_exam_pass" ? "pro_exam_pass" : "pro_monthly"
        ),
        plan_tier: inferredTier,
        status: "active",
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: inferredTier === "pro_exam_pass",
        last_payment_failed_at: null,
        grace_period_ends_at: null,
      });

      return {
        received: true,
        duplicate: false,
        applied: true,
        eventId: event.id,
        eventType: event.type,
        subscription: updated,
      };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = extractCustomerId(sub.customer);
      const priceId = sub.items?.data?.[0]?.price?.id ?? null;
      const existing = await store.findSubscription({
        userId: sub.metadata?.user_id ?? null,
        customerId,
        subscriptionId: sub.id,
      });
      const userId =
        sub.metadata?.user_id ?? existing?.user_id ?? LOCAL_PREVIEW_USER_ID;
      const nextStatus = mapStripeStatus(sub.status);
      const { periodStart, periodEnd } = extractSubscriptionPeriod(sub);
      const isCleanActive = nextStatus === "active" || nextStatus === "trialing";
      const planTier = resolvePlanFromPriceId(
        priceId,
        existing?.plan_tier && existing.plan_tier !== "free"
          ? existing.plan_tier
          : "pro_monthly"
      );

      let lastFailed = existing?.last_payment_failed_at ?? null;
      let graceEnds = existing?.grace_period_ends_at ?? null;
      if (isCleanActive) {
        lastFailed = null;
        graceEnds = null;
      } else if (nextStatus === "past_due" && !graceEnds) {
        lastFailed = eventTimestampIso;
        graceEnds = computeGraceEndIso(eventTimestampIso);
      }

      const updated = await store.upsertSubscription({
        user_id: userId,
        stripe_customer_id: customerId ?? existing?.stripe_customer_id ?? null,
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId ?? existing?.stripe_price_id ?? null,
        plan_tier: nextStatus === "canceled" ? "free" : planTier,
        status: nextStatus,
        current_period_start: periodStart ?? existing?.current_period_start ?? null,
        current_period_end: periodEnd ?? existing?.current_period_end ?? null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        last_payment_failed_at: lastFailed,
        grace_period_ends_at: graceEnds,
      });

      return {
        received: true,
        duplicate: false,
        applied: true,
        eventId: event.id,
        eventType: event.type,
        subscription: updated,
      };
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = extractCustomerId(sub.customer);
      const existing = await store.findSubscription({
        userId: sub.metadata?.user_id ?? null,
        customerId,
        subscriptionId: sub.id,
      });
      const userId =
        sub.metadata?.user_id ?? existing?.user_id ?? LOCAL_PREVIEW_USER_ID;

      const updated = await store.upsertSubscription({
        user_id: userId,
        stripe_customer_id: customerId ?? existing?.stripe_customer_id ?? null,
        stripe_subscription_id: sub.id,
        stripe_price_id: existing?.stripe_price_id ?? null,
        plan_tier: "free",
        status: "canceled",
        current_period_start: existing?.current_period_start ?? null,
        current_period_end: eventTimestampIso,
        cancel_at_period_end: false,
        last_payment_failed_at: null,
        grace_period_ends_at: null,
      });

      return {
        received: true,
        duplicate: false,
        applied: true,
        eventId: event.id,
        eventType: event.type,
        subscription: updated,
      };
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = extractCustomerId(invoice.customer);
      const subscriptionId = extractInvoiceSubscriptionId(invoice);
      const existing = await store.findSubscription({
        customerId,
        subscriptionId,
      });
      if (!existing?.user_id) {
        return {
          received: true,
          duplicate: false,
          applied: false,
          eventId: event.id,
          eventType: event.type,
          subscription: null,
        };
      }

      // Preserve original failure timestamp during dunning retries so grace stays capped at 3 days.
      const alreadyPastDue =
        existing.status === "past_due" &&
        Boolean(existing.last_payment_failed_at) &&
        Boolean(existing.grace_period_ends_at);
      const failedAtIso = alreadyPastDue
        ? existing.last_payment_failed_at!
        : eventTimestampIso;
      const graceEndsIso = alreadyPastDue
        ? existing.grace_period_ends_at!
        : computeGraceEndIso(failedAtIso);

      const updated = await store.upsertSubscription({
        ...existing,
        user_id: existing.user_id,
        status: "past_due",
        last_payment_failed_at: failedAtIso,
        grace_period_ends_at: graceEndsIso,
      });

      return {
        received: true,
        duplicate: false,
        applied: true,
        eventId: event.id,
        eventType: event.type,
        subscription: updated,
      };
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = extractCustomerId(invoice.customer);
      const subscriptionId = extractInvoiceSubscriptionId(invoice);
      const existing = await store.findSubscription({
        customerId,
        subscriptionId,
      });
      if (!existing?.user_id) {
        return {
          received: true,
          duplicate: false,
          applied: false,
          eventId: event.id,
          eventType: event.type,
          subscription: null,
        };
      }

      const periodEndFromInvoice = unixToIso(invoice.period_end);
      const updated = await store.upsertSubscription({
        ...existing,
        user_id: existing.user_id,
        status: "active",
        current_period_end:
          periodEndFromInvoice ?? existing.current_period_end ?? null,
        last_payment_failed_at: null,
        grace_period_ends_at: null,
      });

      return {
        received: true,
        duplicate: false,
        applied: true,
        eventId: event.id,
        eventType: event.type,
        subscription: updated,
      };
    }

    default:
      return {
        received: true,
        duplicate: false,
        applied: false,
        eventId: event.id,
        eventType: event.type,
        subscription: null,
      };
  }
}
