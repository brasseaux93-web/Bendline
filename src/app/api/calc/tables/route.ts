import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const querySchema = z.object({
  codeFamily: z.enum(["IPC", "UPC"]).optional(),
  edition: z.string().trim().min(1).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    codeFamily: url.searchParams.get("codeFamily") ?? undefined,
    edition: url.searchParams.get("edition") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_QUERY", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({
      tables: [],
      source: "unconfigured",
    });
  }

  let query = supabase
    .from("code_tables")
    .select(
      "id, code_family, edition, table_key, schema_version, title, code_ref, data, verified_at"
    );

  if (parsed.data.codeFamily) {
    query = query.eq("code_family", parsed.data.codeFamily);
  }
  if (parsed.data.edition) {
    query = query.eq("edition", parsed.data.edition);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "CODE_TABLES_QUERY_FAILED", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    tables: data ?? [],
    source: "supabase",
  });
}
