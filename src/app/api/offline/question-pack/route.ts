import { NextResponse } from "next/server";
import {
  SEED_DRILL_QUESTIONS,
  SEED_JURISDICTIONS,
} from "@/lib/domain/seed-catalog";
import type { ServableQuestion } from "@/lib/domain/types";
import { filterServableQuestionsForJurisdiction } from "@/lib/srs";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jurisdictionId = searchParams.get("jurisdictionId");

  let jurisdiction =
    SEED_JURISDICTIONS.find((j) => j.id === jurisdictionId) ??
    SEED_JURISDICTIONS[0];
  let allQuestions: ServableQuestion[] = SEED_DRILL_QUESTIONS;

  const supabase = await createServerSupabaseClient();
  if (supabase) {
    try {
      if (jurisdictionId) {
        const { data: jur } = await supabase
          .from("jurisdictions")
          .select("*")
          .eq("id", jurisdictionId)
          .maybeSingle();
        if (jur) {
          jurisdiction = jur as typeof jurisdiction;
        }
      }

      const { data: remoteQuestions } = await supabase
        .from("servable_questions")
        .select(
          "id, stem, type, options, correct_index, topic_id, jurisdiction_id, difficulty, code_family, edition, code_ref, explanation_seed, status, review_verdict, approval_reviewed_at, reviewed_at, reviewer_license_no, version"
        );

      if (remoteQuestions && remoteQuestions.length > 0) {
        allQuestions = (
          remoteQuestions as Array<
            ServableQuestion & { approval_reviewed_at?: string | null }
          >
        ).map((row) => ({
          ...row,
          reviewed_at: row.approval_reviewed_at ?? row.reviewed_at ?? null,
        }));
      }
    } catch {
      // Fallback cleanly to seeded servable pack
    }
  }

  const packQuestions = filterServableQuestionsForJurisdiction(
    allQuestions,
    jurisdiction
  );

  return NextResponse.json({
    jurisdictionId: jurisdiction.id,
    codeFamily: jurisdiction.code_family,
    edition: jurisdiction.edition,
    questions: packQuestions,
    syncedAt: new Date().toISOString(),
  });
}
