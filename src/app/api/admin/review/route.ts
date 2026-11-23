import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ReviewPermissionError,
  ReviewValidationError,
  getReviewStudioSnapshot,
  publishNewVersionForItem,
  submitReviewVerdict,
  updateReviewerRoleByAdmin,
} from "@/lib/review/server-store";

export const dynamic = "force-dynamic";

const patchActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("new_version"),
    itemKind: z.enum(["question", "drawing_exercise"]),
    itemId: z.string().min(1),
    titleOrStem: z.string().optional(),
    explanationOrPrompt: z.string().optional(),
  }),
  z.object({
    action: z.literal("update_role"),
    targetUserId: z.string().min(1),
    role: z.enum(["user", "reviewer", "admin"]),
    licenseNo: z.string().nullable().optional(),
  }),
]);

export async function GET() {
  try {
    const snapshot = await getReviewStudioSnapshot();
    return NextResponse.json(snapshot);
  } catch (err) {
    if (err instanceof ReviewPermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: "FAILED_TO_LOAD_REVIEW_QUEUE" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const result = await submitReviewVerdict(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ReviewPermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof ReviewValidationError) {
      return NextResponse.json(
        { error: "HARD_GATE_OR_VALIDATION_FAILED", errors: err.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "REVIEW_SUBMISSION_FAILED" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = patchActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.action === "new_version") {
      const updatedItem = await publishNewVersionForItem({
        itemKind: parsed.data.itemKind,
        itemId: parsed.data.itemId,
        titleOrStem: parsed.data.titleOrStem,
        explanationOrPrompt: parsed.data.explanationOrPrompt,
      });
      return NextResponse.json({ ok: true, updatedItem });
    }

    const reviewer = await updateReviewerRoleByAdmin({
      targetUserId: parsed.data.targetUserId,
      role: parsed.data.role,
      licenseNo: parsed.data.licenseNo,
    });
    return NextResponse.json({ ok: true, reviewer });
  } catch (err) {
    if (err instanceof ReviewPermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof ReviewValidationError) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", errors: err.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "PATCH_FAILED" }, { status: 500 });
  }
}
