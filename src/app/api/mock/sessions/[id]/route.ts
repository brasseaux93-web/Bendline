import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MockSessionExpiredError,
  MockSessionNotFoundError,
  getMockSessionOnServer,
  patchMockSessionOnServer,
} from "@/lib/mock/server-store";

const uuidParamSchema = z.string().uuid();

const patchMockSchema = z.object({
  answers: z
    .record(
      z.string().uuid(),
      z.object({
        selected_index: z.number().int().min(0),
        time_ms: z.number().int().min(0).default(0),
      })
    )
    .optional(),
  flaggedQuestionIds: z.array(z.string().uuid()).optional(),
  currentIndex: z.number().int().min(0).optional(),
  timeSpentMs: z.number().int().min(0).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!uuidParamSchema.safeParse(id).success) {
    return NextResponse.json({ error: "INVALID_SESSION_ID" }, { status: 400 });
  }

  try {
    const res = await getMockSessionOnServer({ sessionId: id });
    return NextResponse.json(res);
  } catch (err) {
    if (err instanceof MockSessionNotFoundError) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!uuidParamSchema.safeParse(id).success) {
    return NextResponse.json({ error: "INVALID_SESSION_ID" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = patchMockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const res = await patchMockSessionOnServer({
      sessionId: id,
      answers: parsed.data.answers,
      flaggedQuestionIds: parsed.data.flaggedQuestionIds,
      currentIndex: parsed.data.currentIndex,
      timeSpentMs: parsed.data.timeSpentMs,
    });
    return NextResponse.json(res);
  } catch (err) {
    if (err instanceof MockSessionNotFoundError) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (err instanceof MockSessionExpiredError) {
      return NextResponse.json({ error: "EXAM_EXPIRED" }, { status: 409 });
    }
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
