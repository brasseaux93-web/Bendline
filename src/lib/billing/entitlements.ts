import type { PlanTier } from "@/lib/domain/types";
import { FREE_TIER_DAILY_LIMIT } from "@/lib/srs";

export const GRACE_PERIOD_DAYS = 3;
export const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export interface SubscriptionSnapshot {
  user_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
  plan_tier: PlanTier;
  status: SubscriptionStatus;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  last_payment_failed_at?: string | null;
  grace_period_ends_at?: string | null;
}

export interface ServerEntitlement {
  hasProAccess: boolean;
  effectivePlan: PlanTier;
  rawPlanTier: PlanTier;
  status: SubscriptionStatus;
  inGracePeriod: boolean;
  graceEndsAt: string | null;
  graceHoursRemaining: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerLinked: boolean;
  dailyPracticeLimit: number | null;
}

export function isPaidPlanTier(tier: PlanTier): boolean {
  return tier === "pro_monthly" || tier === "pro_exam_pass" || tier === "lifetime";
}

export function computeGraceEndIso(failedAtIso: string): string {
  const parsed = Date.parse(failedAtIso);
  const baseMs = Number.isNaN(parsed) ? Date.now() : parsed;
  return new Date(baseMs + GRACE_PERIOD_MS).toISOString();
}

export function resolveEntitlement(
  sub: SubscriptionSnapshot | null | undefined,
  nowIso: string = new Date().toISOString()
): ServerEntitlement {
  if (!sub) {
    return {
      hasProAccess: false,
      effectivePlan: "free",
      rawPlanTier: "free",
      status: "active",
      inGracePeriod: false,
      graceEndsAt: null,
      graceHoursRemaining: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripeCustomerLinked: false,
      dailyPracticeLimit: FREE_TIER_DAILY_LIMIT,
    };
  }

  const nowMs = Date.parse(nowIso);
  const effectiveNowMs = Number.isNaN(nowMs) ? Date.now() : nowMs;
  const paidTier = isPaidPlanTier(sub.plan_tier);
  const periodEndMs = sub.current_period_end
    ? Date.parse(sub.current_period_end)
    : null;
  const withinPeriod =
    periodEndMs === null || Number.isNaN(periodEndMs) || periodEndMs > effectiveNowMs;

  if (paidTier && (sub.status === "active" || sub.status === "trialing") && withinPeriod) {
    return {
      hasProAccess: true,
      effectivePlan: sub.plan_tier,
      rawPlanTier: sub.plan_tier,
      status: sub.status,
      inGracePeriod: false,
      graceEndsAt: null,
      graceHoursRemaining: null,
      currentPeriodEnd: sub.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      stripeCustomerLinked: Boolean(sub.stripe_customer_id),
      dailyPracticeLimit: null,
    };
  }

  if (paidTier && sub.status === "past_due") {
    const computedGraceEnd =
      sub.grace_period_ends_at ??
      (sub.last_payment_failed_at ? computeGraceEndIso(sub.last_payment_failed_at) : null);

    if (computedGraceEnd) {
      const graceEndMs = Date.parse(computedGraceEnd);
      if (!Number.isNaN(graceEndMs) && graceEndMs > effectiveNowMs) {
        const hoursRemaining = Math.max(
          1,
          Math.ceil((graceEndMs - effectiveNowMs) / (60 * 60 * 1000))
        );
        return {
          hasProAccess: true,
          effectivePlan: sub.plan_tier,
          rawPlanTier: sub.plan_tier,
          status: sub.status,
          inGracePeriod: true,
          graceEndsAt: computedGraceEnd,
          graceHoursRemaining: hoursRemaining,
          currentPeriodEnd: sub.current_period_end ?? null,
          cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
          stripeCustomerLinked: Boolean(sub.stripe_customer_id),
          dailyPracticeLimit: null,
        };
      }
    }
  }

  return {
    hasProAccess: false,
    effectivePlan: "free",
    rawPlanTier: sub.plan_tier,
    status: sub.status,
    inGracePeriod: false,
    graceEndsAt: sub.grace_period_ends_at ?? null,
    graceHoursRemaining: 0,
    currentPeriodEnd: sub.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    stripeCustomerLinked: Boolean(sub.stripe_customer_id),
    dailyPracticeLimit: FREE_TIER_DAILY_LIMIT,
  };
}
