import { NextResponse } from "next/server";
import {
  StripeWebhookVerificationError,
  processStripeWebhookEvent,
  verifyAndConstructStripeEvent,
} from "@/lib/billing/stripe-server";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const event = verifyAndConstructStripeEvent(rawBody, signature);
    const result = await processStripeWebhookEvent(event);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof StripeWebhookVerificationError) {
      return NextResponse.json(
        { error: "INVALID_STRIPE_SIGNATURE", message: err.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: "WEBHOOK_PROCESSING_ERROR",
        message: err instanceof Error ? err.message : "Webhook failed.",
      },
      { status: 500 }
    );
  }
}
