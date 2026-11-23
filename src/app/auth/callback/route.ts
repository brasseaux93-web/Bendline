import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function sanitizeNextPath(nextParam: string | null): string {
  if (!nextParam || !nextParam.startsWith("/") || nextParam.startsWith("//")) {
    return "/";
  }
  return nextParam;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = sanitizeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(
          new URL("/auth?error=auth_callback_failed", requestUrl.origin)
        );
      }
    }
  }

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
