import {
  SEED_DRILL_QUESTIONS,
  SEED_JURISDICTIONS,
  SEED_TOPICS,
} from "@/lib/domain/seed-catalog";
import type { ServableQuestion } from "@/lib/domain/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  SEED_PUBLIC_ERRATA,
  buildPublicLedgerItems,
  computeAccuracyMetrics,
  type AccuracyMetricsSnapshot,
  type JurisdictionVerificationRow,
} from "./compute";

export * from "./compute";

/**
 * Loads aggregate-only public accuracy metrics + item-by-item ledger on the server.
 */
export async function loadPublicAccuracyMetrics(): Promise<AccuracyMetricsSnapshot> {
  const supabase = await createServerSupabaseClient();
  const nowIso = new Date().toISOString();

  if (supabase) {
    try {
      const [{ data: rpcData, error: rpcErr }, { data: jurRows }, { data: ledgerRows }] =
        await Promise.all([
          supabase.rpc("public_accuracy_metrics"),
          supabase
            .from("jurisdictions")
            .select(
              "id, state, name, code_family, edition, exam_vendor, open_book, last_verified_at, bulletin_url"
            )
            .order("state", { ascending: true }),
          supabase.rpc("public_accuracy_ledger_items"),
        ]);

      if (!rpcErr && rpcData && typeof rpcData === "object") {
        const m = rpcData as {
          published_questions_count?: number;
          licensed_reviewed_count?: number;
          pct_reviewed_by_licensed?: number;
          median_review_age_days?: number;
          confirmed_error_count?: number;
          total_attempts_count?: number;
          confirmed_error_rate_per_1000?: number;
          generated_at?: string;
        };

        const publishedQuestionsCount = Number(m.published_questions_count ?? 0);
        if (publishedQuestionsCount > 0) {
          const parsedLedgerRows = Array.isArray(ledgerRows)
            ? (ledgerRows as Array<
                Pick<
                  ServableQuestion,
                  | "id"
                  | "stem"
                  | "type"
                  | "topic_id"
                  | "code_family"
                  | "edition"
                  | "code_ref"
                  | "version"
                  | "reviewed_at"
                  | "reviewer_license_no"
                > & { status?: string }
              >)
            : [];

          return {
            publishedQuestionsCount,
            licensedReviewedCount: Number(m.licensed_reviewed_count ?? 0),
            pctReviewedByLicensed: Number(m.pct_reviewed_by_licensed ?? 0),
            medianReviewAgeDays: Number(m.median_review_age_days ?? 0),
            confirmedErrorCount: Number(m.confirmed_error_count ?? 0),
            totalAttemptsCount: Number(m.total_attempts_count ?? 0),
            confirmedErrorRatePer1000: Number(
              m.confirmed_error_rate_per_1000 ?? 0
            ),
            jurisdictionVerifications:
              jurRows && jurRows.length > 0
                ? (jurRows as JurisdictionVerificationRow[])
                : SEED_JURISDICTIONS.map((j) => ({
                    id: j.id,
                    state: j.state,
                    name: j.name,
                    code_family: j.code_family,
                    edition: j.edition,
                    exam_vendor: j.exam_vendor,
                    open_book: j.open_book,
                    last_verified_at: j.last_verified_at,
                    bulletin_url: j.bulletin_url,
                  })),
            items:
              parsedLedgerRows.length > 0
                ? buildPublicLedgerItems(parsedLedgerRows, SEED_TOPICS, true)
                : buildPublicLedgerItems(SEED_DRILL_QUESTIONS, SEED_TOPICS, true),
            errata: SEED_PUBLIC_ERRATA,
            source: "supabase_rpc",
            generatedAt: m.generated_at ?? nowIso,
          };
        }
      }
    } catch {
      // Fall back cleanly to curated seed catalog when DB unavailable
    }
  }

  return computeAccuracyMetrics({
    questions: SEED_DRILL_QUESTIONS,
    confirmedErrorCount: 0,
    totalAttemptsCount: 0,
    jurisdictions: SEED_JURISDICTIONS,
    includeReviewRevisions: true,
    nowIso,
    source: "seed_catalog",
  });
}
