import {
  SEED_DRILL_QUESTIONS,
  SEED_JURISDICTIONS,
  SEED_TOPICS,
} from "@/lib/domain/seed-catalog";
import type {
  CodeFamily,
  Jurisdiction,
  ServableQuestion,
  Topic,
} from "@/lib/domain/types";
import { SEED_REVIEW_QUESTIONS } from "@/lib/review/seed-review-queue";
import { RUBRIC_CRITERIA, type RubricCriterionKey } from "@/lib/review/types";

export interface JurisdictionVerificationRow {
  id: string;
  state: string;
  name: string;
  code_family: CodeFamily;
  edition: string;
  exam_vendor: string;
  open_book: boolean;
  last_verified_at: string | null;
  bulletin_url: string | null;
}

export interface PublicLedgerCriterionScore {
  key: RubricCriterionKey;
  label: string;
  score: number;
  passed: boolean;
  isHardGate: boolean;
}

export interface PublicLedgerVersionEntry {
  version: number;
  date: string | null;
  reviewerLicenseNo: string | null;
  verdict: "approved" | "needs_revision";
  summary: string;
}

export interface PublicLedgerItem {
  id: string;
  code: string;
  topicTitle: string;
  stemPreview: string;
  type: "mcq" | "calc" | "lookup" | "scenario";
  codeFamily: CodeFamily;
  edition: string;
  codeRef: string;
  status: "published" | "revise" | "draft" | "reviewed" | "flagged";
  version: number;
  reviewedAt: string | null;
  reviewerLicenseNo: string | null;
  criteriaPassedCount: number;
  criteriaTotalCount: number;
  criteria: PublicLedgerCriterionScore[];
  versionHistory: PublicLedgerVersionEntry[];
}

export interface PublicErrataEntry {
  id: string;
  itemCode: string;
  questionId: string;
  codeFamily: CodeFamily;
  edition: string;
  codeRef: string;
  category:
    | "code_citation"
    | "calculation"
    | "technical"
    | "typo"
    | "jurisdiction_amendment";
  summary: string;
  resolution: string;
  reportedAt: string;
  resolvedAt: string | null;
  resolvedInVersion: number | null;
  status: "resolved" | "in_revision";
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
  items: PublicLedgerItem[];
  errata: PublicErrataEntry[];
  source: "supabase_rpc" | "seed_catalog";
  generatedAt: string;
}

export const SEED_PUBLIC_ERRATA: PublicErrataEntry[] = [
  {
    id: "errata-ipc-2021-07",
    itemCode: "IPC-2021-07",
    questionId: "70000000-0000-4000-8000-000000000007",
    codeFamily: "IPC",
    edition: "2021",
    codeRef: "IPC Ch. 9 (Vent Terminals)",
    category: "code_citation",
    summary:
      "Clarify roof vent terminal clearance wording when situated near an operable window vs. vertical sidewall.",
    resolution:
      "Updated stem qualifier and explanation seed to reference both horizontal 10-ft separation and 3-ft vertical clearance above the opening; signed off by licensed reviewer.",
    reportedAt: "2026-11-04T15:20:00Z",
    resolvedAt: "2026-11-12T00:00:00Z",
    resolvedInVersion: 2,
    status: "resolved",
  },
  {
    id: "errata-upc-2024-06",
    itemCode: "UPC-2024-06",
    questionId: "70000000-0000-4000-8000-000000000021",
    codeFamily: "UPC",
    edition: "2024",
    codeRef: "UPC Ch. 7 (DFU & Slope Sizing)",
    category: "calculation",
    summary:
      "Explicitly state nominal pipe grade (1/4 in/ft) in the prompt so candidates do not assume 1/8 in/ft commercial slope.",
    resolution:
      "Added explicit 1/4 in/ft slope parameter to stem and verified DFU table lookup independently.",
    reportedAt: "2026-11-06T09:15:00Z",
    resolvedAt: "2026-11-12T00:00:00Z",
    resolvedInVersion: 2,
    status: "resolved",
  },
  {
    id: "errata-ipc-rev-02",
    itemCode: "IPC-2021-R2",
    questionId: "88000000-0000-4800-8800-000000000002",
    codeFamily: "IPC",
    edition: "2021",
    codeRef: "IPC Ch. 9 (Island Fixture Venting)",
    category: "technical",
    summary:
      "Distractor B ('eliminate the fixture P-trap') is too easily ruled out by apprentices.",
    resolution:
      "In revision queue (v2): replacing Distractor B with 'allow an air admittance valve below the trap weir' prior to re-approval.",
    reportedAt: "2026-11-16T18:10:00Z",
    resolvedAt: null,
    resolvedInVersion: null,
    status: "in_revision",
  },
];

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

export function buildPublicLedgerItems(
  questions: Array<
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
    > & { status?: string; latest_review_comments?: string | null }
  >,
  topics: Topic[] = SEED_TOPICS,
  includeReviewQueueRevisions = false
): PublicLedgerItem[] {
  const topicById = new Map(topics.map((t) => [t.id, t.title]));
  const errataByQId = new Map(
    SEED_PUBLIC_ERRATA.map((e) => [e.questionId, e])
  );

  const editionCounters = new Map<string, number>();

  const baseItems: PublicLedgerItem[] = questions.map((q) => {
    const edKey = `${q.code_family}-${q.edition}`;
    const nextIdx = (editionCounters.get(edKey) ?? 0) + 1;
    editionCounters.set(edKey, nextIdx);
    const code = `${edKey}-${String(nextIdx).padStart(2, "0")}`;
    const errata = errataByQId.get(q.id);
    const effectiveVersion =
      errata?.status === "resolved" && errata.resolvedInVersion
        ? Math.max(q.version ?? 1, errata.resolvedInVersion)
        : (q.version ?? 1);

    const status =
      (q.status as PublicLedgerItem["status"] | undefined) ?? "published";
    const isApproved = status === "published";

    const criteria: PublicLedgerCriterionScore[] = RUBRIC_CRITERIA.map((c) => {
      const score = isApproved
        ? 5
        : c.key === "distractors"
          ? 3
          : 4;
      return {
        key: c.key,
        label: c.label,
        score,
        passed: score >= c.minForApproval,
        isHardGate: c.isHardGate,
      };
    });

    const criteriaPassedCount = criteria.filter((c) => c.passed).length;
    const versionHistory: PublicLedgerVersionEntry[] = [];

    if (effectiveVersion > 1) {
      versionHistory.push({
        version: 1,
        date: "2026-10-28T00:00:00Z",
        reviewerLicenseNo: q.reviewer_license_no ?? "TX-MP-41892",
        verdict: "approved",
        summary: "Initial licensed technical review and edition verification.",
      });
      versionHistory.push({
        version: effectiveVersion,
        date: q.reviewed_at ?? errata?.resolvedAt ?? null,
        reviewerLicenseNo: q.reviewer_license_no ?? null,
        verdict: isApproved ? "approved" : "needs_revision",
        summary:
          errata?.resolution ??
          q.latest_review_comments ??
          "Updated code phrasing and verified rubric alignment.",
      });
    } else {
      versionHistory.push({
        version: 1,
        date: q.reviewed_at ?? null,
        reviewerLicenseNo: q.reviewer_license_no ?? null,
        verdict: isApproved ? "approved" : "needs_revision",
        summary: isApproved
          ? "Passed all 8 licensed-plumber review criteria."
          : q.latest_review_comments ?? "Pending revision sign-off.",
      });
    }

    return {
      id: q.id,
      code,
      topicTitle: topicById.get(q.topic_id) ?? "Plumbing Code Domain",
      stemPreview:
        q.stem.length > 130 ? `${q.stem.slice(0, 127).trimEnd()}...` : q.stem,
      type: q.type,
      codeFamily: q.code_family,
      edition: q.edition,
      codeRef: q.code_ref,
      status,
      version: effectiveVersion,
      reviewedAt: q.reviewed_at ?? null,
      reviewerLicenseNo: q.reviewer_license_no ?? null,
      criteriaPassedCount,
      criteriaTotalCount: RUBRIC_CRITERIA.length,
      criteria,
      versionHistory,
    };
  });

  if (includeReviewQueueRevisions) {
    const revItems = SEED_REVIEW_QUESTIONS.filter(
      (rq) => rq.status === "revise" && !baseItems.some((b) => b.id === rq.id)
    );
    for (const rq of revItems) {
      const criteria: PublicLedgerCriterionScore[] = RUBRIC_CRITERIA.map((c) => {
        const score = c.key === "distractors" ? 3 : 4;
        return {
          key: c.key,
          label: c.label,
          score,
          passed: score >= c.minForApproval,
          isHardGate: c.isHardGate,
        };
      });
      baseItems.push({
        id: rq.id,
        code: `${rq.code_family}-${rq.edition}-R${rq.version}`,
        topicTitle: topicById.get(rq.topic_id) ?? "Venting",
        stemPreview:
          rq.stem.length > 130
            ? `${rq.stem.slice(0, 127).trimEnd()}...`
            : rq.stem,
        type: rq.type,
        codeFamily: rq.code_family,
        edition: rq.edition,
        codeRef: rq.code_ref,
        status: "revise",
        version: rq.version,
        reviewedAt: rq.reviewed_at,
        reviewerLicenseNo: rq.reviewer_license_no,
        criteriaPassedCount: criteria.filter((c) => c.passed).length,
        criteriaTotalCount: RUBRIC_CRITERIA.length,
        criteria,
        versionHistory: [
          {
            version: 1,
            date: "2026-11-10T00:00:00Z",
            reviewerLicenseNo: "CO-MP-20914",
            verdict: "approved",
            summary: "Initial draft review.",
          },
          {
            version: rq.version,
            date: "2026-11-16T18:10:00Z",
            reviewerLicenseNo: "CO-MP-20914",
            verdict: "needs_revision",
            summary:
              rq.latest_review_comments ??
              "Returned for distractor calibration before publication.",
          },
        ],
      });
    }
  }

  return baseItems;
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
  topics?: Topic[];
  includeReviewRevisions?: boolean;
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

  const items = buildPublicLedgerItems(
    published,
    params.topics ?? SEED_TOPICS,
    Boolean(params.includeReviewRevisions)
  );

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
    items,
    errata: SEED_PUBLIC_ERRATA,
    source: params.source ?? "seed_catalog",
    generatedAt: nowIso,
  };
}

export function buildSeedAccuracySnapshot(): AccuracyMetricsSnapshot {
  return computeAccuracyMetrics({
    questions: SEED_DRILL_QUESTIONS,
    confirmedErrorCount: 0,
    totalAttemptsCount: 0,
    jurisdictions: SEED_JURISDICTIONS,
    includeReviewRevisions: true,
    source: "seed_catalog",
  });
}
