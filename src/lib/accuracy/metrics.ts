import { SEED_DRILL_QUESTIONS, SEED_JURISDICTIONS } from "@/lib/domain/seed-catalog";
import type { Jurisdiction, ServableQuestion } from "@/lib/domain/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface JurisdictionVerificationRow {
  id: string;
  state: string;
  name: string;
  code_family: "IPC" | "UPC";
  edition: string;
  exam_vendor: string;
  open_book: boolean;
  last_verified_at: string | null;
  bulletin_url: string | null;
}

export interface AccuracyMetricsSnapshot {
  publishedQuestionsCount: number;
  licensedReviewedCount: number;
  pctReviewedByLicensed: number;
  medianReviewAgeDays: number;
  confirmedErrorCount: number;
  totalAttemptsCount: number;
  confirmedErrorRatePer1000: number;
  jurisdictionVerifications: JurisdictionVerificationRow[];
  source: "supabase_rpc" | "seed_catalog";
  generatedAt: string;
}

export function computeMedianNumber(values: number[]): number {
  const valid = values
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);

  if (valid.length === 0) return 0;

  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) {
    return Math.round(valid[mid]);
  }
  return Math.round((valid[mid - 1] + valid[mid]) / 2);
}

/**
 * Computes aggregate accuracy and editorial review transparency metrics
 * across published questions, confirmed error reports, and jurisdiction bulletins.
 */
export function computeAccuracyMetrics(params: {
  questions: ServableQuestion[];
  confirmedErrorCount: number;
  totalAttemptsCount: number;
  jurisdictions: Jurisdiction[];
  nowIso?: string;
  source?: "supabase_rpc" | "seed_catalog";
}): AccuracyMetricsSnapshot {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);

  const published = params.questions.filter(
    (q) =>
      (q.status ?? "published") === "published" &&
      (q.review_verdict ?? "approved") === "approved"
  );

  const licensedReviewedCount = published.filter(
    (q) =>
      typeof q.reviewer_license_no === "string" &&
      q.reviewer_license_no.trim().length > 0
  ).length;

  const publishedQuestionsCount = published.length;
  const pctReviewedByLicensed =
    publishedQuestionsCount > 0
      ? Math.round((licensedReviewedCount / publishedQuestionsCount) * 100)
      : 0;

  const reviewAgesDays: number[] = [];
  for (const q of published) {
    if (!q.reviewed_at) continue;
    const revMs = Date.parse(q.reviewed_at);
    if (!Number.isFinite(revMs)) continue;
    const ageDays = Math.max(0, Math.round((nowMs - revMs) / 86_400_000));
    reviewAgesDays.push(ageDays);
  }

  const medianReviewAgeDays = computeMedianNumber(reviewAgesDays);

  const safeAttempts = Math.max(0, Math.floor(params.totalAttemptsCount));
  const safeErrors = Math.max(0, Math.floor(params.confirmedErrorCount));
  const confirmedErrorRatePer1000 =
    safeAttempts > 0
      ? Number(((safeErrors / safeAttempts) * 1000).toFixed(2))
      : 0;

  return {
    publishedQuestionsCount,
    licensedReviewedCount,
    pctReviewedByLicensed,
    medianReviewAgeDays,
    confirmedErrorCount: safeErrors,
    totalAttemptsCount: safeAttempts,
    confirmedErrorRatePer1000,
    jurisdictionVerifications: [...params.jurisdictions]
      .sort((a, b) => a.state.localeCompare(b.state))
      .map((j) => ({
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
    source: params.source ?? "seed_catalog",
    generatedAt: nowIso,
  };
}

/**
 * Loads aggregate-only public accuracy metrics on the server (or seed fallback when offline).
 */
export async function loadPublicAccuracyMetrics(): Promise<AccuracyMetricsSnapshot> {
  const supabase = await createServerSupabaseClient();
  const nowIso = new Date().toISOString();

  if (supabase) {
    try {
      const [{ data: rpcData, error: rpcErr }, { data: jurRows }] =
        await Promise.all([
          supabase.rpc("public_accuracy_metrics"),
          supabase
            .from("jurisdictions")
            .select(
              "id, state, name, code_family, edition, exam_vendor, open_book, last_verified_at, bulletin_url"
            )
            .order("state", { ascending: true }),
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
    nowIso,
    source: "seed_catalog",
  });
}
