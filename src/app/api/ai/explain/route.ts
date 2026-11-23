import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { explainAnswer } from "@/lib/ai/explain";
import { AiRateLimitError } from "@/lib/ai/model-router";
import { explainInputSchema } from "@/lib/ai/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  let resolvedUserId = "local-preview-user";

  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) {
      resolvedUserId = data.user.id;
    }
  }

  // Never trust client-supplied userId when an authenticated user exists
  const normalizedBody =
    typeof body === "object" && body !== null
      ? { ...body, userId: resolvedUserId }
      : body;

  const parsed = explainInputSchema.safeParse(normalizedBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await explainAnswer(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      return NextResponse.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: err.message,
          retryAfterSec: err.retryAfterSec,
        },
        {
          status: 429,
          headers: { "Retry-After": String(err.retryAfterSec) },
        }
      );
    }
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "EXPLAIN_FAILED" },
      { status: 500 }
    );
  }
}
