import { NextResponse } from "next/server";
import { z } from "zod";
import { drawGraphSchema } from "@/lib/draw/graph";
import { getProcessedDraftKeySet } from "@/lib/offline/server-idempotency";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const draftSyncSchema = z.object({
  idempotencyKey: z.string().uuid(),
  draftId: z.string().min(1),
  exerciseId: z.string().uuid(),
  mode: z.enum(["learn", "practice", "exam"]),
  graph: drawGraphSchema,
  elapsedMs: z.number().int().min(0).default(0),
  updatedAt: z.string().min(1),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = draftSyncSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const headerKey = request.headers.get("Idempotency-Key");
  const idempotencyKey =
    headerKey && z.string().uuid().safeParse(headerKey).success
      ? headerKey
      : parsed.data.idempotencyKey;

  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (user) {
      const { data: alreadySynced } = await supabase
        .from("drawing_drafts")
        .select("id")
        .eq("user_id", user.id)
        .eq("client_draft_id", idempotencyKey)
        .maybeSingle();

      if (alreadySynced) {
        return NextResponse.json({
          ok: true,
          deduplicated: true,
          idempotencyKey,
        });
      }

      const { error } = await supabase.from("drawing_drafts").upsert(
        {
          user_id: user.id,
          draft_key: parsed.data.draftId,
          exercise_id: parsed.data.exerciseId,
          mode: parsed.data.mode,
          graph: parsed.data.graph,
          elapsed_ms: parsed.data.elapsedMs,
          client_draft_id: idempotencyKey,
          updated_at: parsed.data.updatedAt,
        },
        { onConflict: "user_id,draft_key" }
      );

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({
            ok: true,
            deduplicated: true,
            idempotencyKey,
          });
        }
        return NextResponse.json(
          { error: "DRAW_DRAFT_SYNC_FAILED" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        deduplicated: false,
        idempotencyKey,
      });
    }
  }

  const seenKeys = getProcessedDraftKeySet();
  if (seenKeys.has(idempotencyKey)) {
    return NextResponse.json({
      ok: true,
      deduplicated: true,
      idempotencyKey,
    });
  }

  seenKeys.add(idempotencyKey);
  return NextResponse.json({
    ok: true,
    deduplicated: false,
    idempotencyKey,
  });
}
