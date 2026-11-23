import { NextResponse } from "next/server";
import {
  resolveEntitlement,
  type SubscriptionSnapshot,
} from "@/lib/billing/entitlements";
import {
  LOCAL_PREVIEW_USER_ID,
  getDefaultBillingStore,
  getStripePriceEnvConfig,
} from "@/lib/billing/stripe-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const envCfg = getStripePriceEnvConfig();
  let subscription: SubscriptionSnapshot | null = null;

  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      const { data: subRow } = await supabase
        .from("subscriptions")
        .select(
          "user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan_tier, status, current_period_start, current_period_end, cancel_at_period_end, last_payment_failed_at, grace_period_ends_at"
        )
        .eq("user_id", userData.user.id)
        .maybeSingle();
      subscription = (subRow as SubscriptionSnapshot | null) ?? null;
    }
  }

  if (!subscription) {
    subscription = await getDefaultBillingStore().getSubscriptionByUserId(
      LOCAL_PREVIEW_USER_ID
    );
  }

  const entitlement = resolveEntitlement(subscription);

  return NextResponse.json({
    entitlement,
    configuredPlans: {
      stripeConfigured: envCfg.stripeConfigured,
      webhookConfigured: envCfg.webhookConfigured,
      pass3mConfigured: envCfg.pass3mConfigured,
      monthlyConfigured: envCfg.monthlyConfigured,
    },
  });
}
