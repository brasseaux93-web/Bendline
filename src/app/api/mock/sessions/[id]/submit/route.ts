import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MockSessionNotFoundError,
  submitMockSessionOnServer,
} from "@/lib/mock/server-store";

const uuidParamSchema = z.string().uuid();

const submitMockSchema = z.object({
  finalAnswers: z
    .record(
      z.string().uuid(),
      z.object({
        selected_index: z.number().int().min(0),
        time_ms: z.number().int().min(0).default(0),
      })
    )
    .optional(),
  flaggedQuestionIds: z.array(z.string().uuid()).optional(),
  timeSpentMs: z.number().int().min(0).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!uuidParamSchema.safeParse(id).success) {
    return NextResponse.json({ error: "INVALID_SESSION_ID" }, { status: 400 });
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = submitMockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const res = await submitMockSessionOnServer({
      sessionId: id,
      finalAnswers: parsed.data.finalAnswers,
      flaggedQuestionIds: parsed.data.flaggedQuestionIds,
      timeSpentMs: parsed.data.timeSpentMs,
    });
    return NextResponse.json(res);
  } catch (err) {
    if (err instanceof MockSessionNotFoundError) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
