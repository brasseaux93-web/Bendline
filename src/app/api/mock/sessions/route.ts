import { NextResponse } from "next/server";
import { z } from "zod";
import { InsufficientServableQuestionsError } from "@/lib/mock/engine";
import {
  createMockSessionOnServer,
  listMockSessionsOnServer,
} from "@/lib/mock/server-store";

const createMockSchema = z.object({
  jurisdictionId: z.string().uuid(),
  resumeIfActive: z.boolean().optional().default(true),
  strictBankSize: z.boolean().optional().default(false),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jurisdictionId = url.searchParams.get("jurisdictionId") ?? undefined;
  const data = await listMockSessionsOnServer({ jurisdictionId });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = createMockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await createMockSessionOnServer({
      jurisdictionId: parsed.data.jurisdictionId,
      resumeIfActive: parsed.data.resumeIfActive,
      strictBankSize: parsed.data.strictBankSize,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InsufficientServableQuestionsError) {
      return NextResponse.json(
        { error: "INSUFFICIENT_SERVABLE_QUESTIONS", message: err.message },
        { status: 422 }
      );
    }
    return NextResponse.json(
      {
        error: "MOCK_SESSION_CREATE_FAILED",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
