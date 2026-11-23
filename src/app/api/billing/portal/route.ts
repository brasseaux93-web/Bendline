import { NextResponse } from "next/server";
import {
  LOCAL_PREVIEW_USER_ID,
  getActiveBillingStore,
  getStripeClient,
  getStripePriceEnvConfig,
} from "@/lib/billing/stripe-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  const stripe = getStripeClient();
  const envCfg = getStripePriceEnvConfig();

  if (!stripe) {
    return NextResponse.json(
      {
        mode: "unconfigured",
        missingEnv: ["STRIPE_SECRET_KEY"],
        message:
          "Stripe Customer Portal requires STRIPE_SECRET_KEY on the server.",
      },
      { status: 503 }
    );
  }

  let userId = LOCAL_PREVIEW_USER_ID;
  let customerId: string | null = null;

  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      userId = data.user.id;
      const { data: subRow } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", userId)
        .maybeSingle();
      customerId = (subRow?.stripe_customer_id as string | null) ?? null;
    }
  }

  if (!customerId) {
    const storeSub = await getActiveBillingStore().getSubscriptionByUserId(userId);
    customerId = storeSub?.stripe_customer_id ?? null;
  }

  if (!customerId) {
    return NextResponse.json(
      {
        mode: "no_customer",
        message:
          "No active Stripe billing customer found for this account yet. Start a paid plan first to access invoices and payment methods in the Customer Portal.",
      },
      { status: 404 }
    );
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${envCfg.appUrl}/account`,
  });

  return NextResponse.json({
    mode: "portal",
    url: portalSession.url,
  });
}
