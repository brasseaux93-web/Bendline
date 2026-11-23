import { NextResponse } from "next/server";
import { z } from "zod";
import {
  LOCAL_PREVIEW_USER_ID,
  getPriceIdForPlan,
  getStripeClient,
  getStripePriceEnvConfig,
} from "@/lib/billing/stripe-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const checkoutBodySchema = z.object({
  plan: z.enum(["pro_exam_pass", "pro_monthly"]),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = checkoutBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { plan } = parsed.data;
  const priceId = getPriceIdForPlan(plan);
  const envCfg = getStripePriceEnvConfig();
  const stripe = getStripeClient();

  if (!stripe || !priceId) {
    const missingEnv: string[] = [];
    if (!stripe) missingEnv.push("STRIPE_SECRET_KEY");
    if (!priceId) {
      missingEnv.push(
        plan === "pro_exam_pass"
          ? "STRIPE_PRICE_ID_PASS_3M"
          : "STRIPE_PRICE_ID_MONTHLY"
      );
    }

    return NextResponse.json(
      {
        mode: "unconfigured",
        plan,
        missingEnv,
        message: `Stripe Checkout requires ${missingEnv.join(" and ")} in server environment variables. Prices are configured strictly via environment variables for testing.`,
      },
      { status: 503 }
    );
  }

  let userId = LOCAL_PREVIEW_USER_ID;
  let customerEmail: string | undefined;

  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      userId = data.user.id;
      customerEmail = data.user.email ?? undefined;
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: plan === "pro_exam_pass" ? "payment" : "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${envCfg.appUrl}/account?checkout=success&plan=${plan}`,
    cancel_url: `${envCfg.appUrl}/account?checkout=canceled`,
    client_reference_id: userId,
    customer_email: customerEmail,
    metadata: {
      user_id: userId,
      plan_tier: plan,
      price_id: priceId,
    },
    ...(plan === "pro_monthly"
      ? {
          subscription_data: {
            metadata: {
              user_id: userId,
              plan_tier: plan,
            },
          },
        }
      : {}),
  });

  return NextResponse.json({
    mode: "checkout",
    url: session.url,
    sessionId: session.id,
  });
}
