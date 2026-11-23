import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  LOCAL_PREVIEW_USER_ID,
  getDefaultBillingStore,
} from "@/lib/billing/stripe-server";
import { resolveEntitlement } from "@/lib/billing/entitlements";

export async function GET() {
  const exportedAt = new Date().toISOString();
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (user) {
      const [
        { data: profile },
        { data: subscription },
        { data: attempts },
        { data: srsState },
        { data: mockSessions },
        { data: practiceSessions },
        { data: drawingSubmissions },
        { data: drawingDrafts },
        { data: navigationAttempts },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("attempts").select("*").eq("user_id", user.id),
        supabase.from("srs_state").select("*").eq("user_id", user.id),
        supabase.from("mock_sessions").select("*").eq("user_id", user.id),
        supabase.from("practice_sessions").select("*").eq("user_id", user.id),
        supabase.from("drawing_submissions").select("*").eq("user_id", user.id),
        supabase.from("drawing_drafts").select("*").eq("user_id", user.id),
        supabase.from("navigation_attempts").select("*").eq("user_id", user.id),
      ]);

      return NextResponse.json({
        schemaVersion: "bendline.export.v1",
        exportedAt,
        source: "supabase",
        user: { id: user.id, email: user.email ?? null },
        profile,
        subscription,
        attempts: attempts ?? [],
        srsState: srsState ?? [],
        mockSessions: mockSessions ?? [],
        practiceSessions: practiceSessions ?? [],
        drawingSubmissions: drawingSubmissions ?? [],
        drawingDrafts: drawingDrafts ?? [],
        navigationAttempts: navigationAttempts ?? [],
      });
    }
  }

  const localSub = await getDefaultBillingStore().getSubscriptionByUserId(
    LOCAL_PREVIEW_USER_ID
  );

  return NextResponse.json({
    schemaVersion: "bendline.export.v1",
    exportedAt,
    source: "local_preview",
    user: { id: LOCAL_PREVIEW_USER_ID, email: null },
    entitlement: resolveEntitlement(localSub, exportedAt),
  });
}
