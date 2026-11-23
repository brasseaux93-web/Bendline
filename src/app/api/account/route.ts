import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProcessedAttemptIdSet,
  getProcessedDraftKeySet,
} from "@/lib/offline/server-idempotency";
import {
  LOCAL_PREVIEW_USER_ID,
  getDefaultBillingStore,
} from "@/lib/billing/stripe-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE"),
});

export async function DELETE(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = deleteAccountSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "CONFIRMATION_REQUIRED",
        message: 'Type "DELETE" to confirm permanent account deletion.',
      },
      { status: 400 }
    );
  }

  const deletedAt = new Date().toISOString();
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (user) {
      const adminClient = createServiceRoleSupabaseClient();
      if (adminClient) {
        const { error: deleteErr } = await adminClient.auth.admin.deleteUser(
          user.id
        );
        if (deleteErr) {
          return NextResponse.json(
            { error: "ACCOUNT_DELETE_FAILED", message: deleteErr.message },
            { status: 500 }
          );
        }
      } else {
        // Fallback when service-role key is unavailable: remove user profile & owned cascades
        await supabase.from("profiles").delete().eq("id", user.id);
      }
      await supabase.auth.signOut();
    }
  }

  getProcessedAttemptIdSet().clear();
  getProcessedDraftKeySet().clear();
  getDefaultBillingStore().subscriptionsByUserId.delete(LOCAL_PREVIEW_USER_ID);

  const response = NextResponse.json({
    ok: true,
    deletedAt,
  });
  response.cookies.delete("bendline_free_daily");
  return response;
}
