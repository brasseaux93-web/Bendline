"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpenCheck,
  Clock,
  ExternalLink,
  Search,
  ShieldCheck,
} from "lucide-react";
import { AccuracyLedgerRow } from "@/components/modals/accuracy-ledger-row";
import {
  buildSeedAccuracySnapshot,
  type AccuracyMetricsSnapshot,
} from "@/lib/accuracy/compute";
import { RUBRIC_CRITERIA } from "@/lib/review/types";

function formatShortDate(iso: string | null): string {
  if (!iso) return "Pending verification";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "Pending verification";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(parsed));
}

export function AccuracyLedgerContent({
  initialSnapshot,
  inModal = false,
}: {
  initialSnapshot?: AccuracyMetricsSnapshot;
  inModal?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<AccuracyMetricsSnapshot>(
    () => initialSnapshot ?? buildSeedAccuracySnapshot()
  );
  const [editionFilter, setEditionFilter] = useState<
    "ALL" | "IPC-2021" | "UPC-2024"
  >("ALL");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "published" | "revise"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(
    () => (initialSnapshot ?? buildSeedAccuracySnapshot()).items[0]?.id ?? null
  );

  // Refresh live snapshot silently in the background when opened inside modal
  useEffect(() => {
    if (!inModal || initialSnapshot) return;
    let active = true;
    fetch("/api/accuracy", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AccuracyMetricsSnapshot | null) => {
        if (active && data && Array.isArray(data.items)) {
          setSnapshot(data);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [inModal, initialSnapshot]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return snapshot.items.filter((item) => {
      if (editionFilter !== "ALL") {
        const edKey = `${item.codeFamily}-${item.edition}`;
        if (edKey !== editionFilter) return false;
      }
      if (statusFilter !== "ALL" && item.status !== statusFilter) {
        return false;
      }
      if (q.length > 0) {
        const haystack =
          `${item.code} ${item.topicTitle} ${item.codeRef} ${item.stemPreview} ${item.reviewerLicenseNo ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [editionFilter, searchQuery, snapshot.items, statusFilter]);

  const HeadingTag = inModal ? "h2" : "h1";

  return (
    <div className="space-y-6 text-ink-primary">
      <div className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-accent-cyan">
          <ShieldCheck
            className="h-4 w-4 text-accent-emerald"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          Verified Technical Accuracy Ledger
        </span>
        <HeadingTag className="text-h1 text-ink-primary">
          Public Content Review &amp; Jurisdiction Verification
        </HeadingTag>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-secondary sm:text-base">
          Every Bendline item is published only after passing an 8-criteria
          review by a licensed master or journeyman plumber and binding to
          explicitly verified code editions and state vendor bulletins.
        </p>
      </div>

      {/* Core 4 Aggregate Trust Cards */}
      <section
        aria-label="Published question accuracy metrics"
        className="grid grid-cols-1 divide-y divide-ink/[0.08] overflow-hidden rounded-2xl border border-ink/[0.08] bg-canvas sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0"
      >
        <article className="min-w-0 space-y-2 p-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-ink-secondary">
            <span>Published Questions</span>
            <BookOpenCheck
              className="h-4 w-4 text-accent-cyan"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
          <p
            data-testid="accuracy-published-count"
            className="font-mono text-hero tabular-nums text-ink-primary"
          >
            {snapshot.publishedQuestionsCount}
          </p>
          <p className="text-xs text-ink-secondary">
            Published items passing current-version approval checks
          </p>
        </article>

        <article className="min-w-0 space-y-2 p-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-ink-secondary">
            <span>Licensed Reviewer Rate</span>
            <ShieldCheck
              className="h-4 w-4 text-accent-emerald"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
          <p
            data-testid="accuracy-licensed-pct"
            className="font-mono text-hero tabular-nums text-accent-emerald"
          >
            {snapshot.pctReviewedByLicensed}%
          </p>
          <p className="text-xs tabular-nums text-ink-secondary">
            {snapshot.licensedReviewedCount} of {snapshot.publishedQuestionsCount}{" "}
            signed with a verified trade license
          </p>
        </article>

        <article className="min-w-0 space-y-2 p-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-ink-secondary">
            <span>Median Review Age</span>
            <Clock
              className="h-4 w-4 text-accent-cyan"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
          <p
            data-testid="accuracy-median-age"
            className="font-mono text-hero tabular-nums text-ink-primary"
          >
            {snapshot.medianReviewAgeDays}d
          </p>
          <p className="text-xs text-ink-secondary">
            Median days since latest licensed technical sign-off
          </p>
        </article>

        <article className="min-w-0 space-y-2 p-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-ink-secondary">
            <span>Confirmed Error Rate</span>
            <AlertCircle
              className="h-4 w-4 text-accent-amber"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
          <p
            data-testid="accuracy-error-rate"
            className="font-mono text-hero tabular-nums text-ink-primary"
          >
            {snapshot.confirmedErrorRatePer1000}
          </p>
          <p className="text-xs tabular-nums text-ink-secondary">
            Confirmed errors per 1,000 attempts ({snapshot.confirmedErrorCount}{" "}
            resolved / {snapshot.totalAttemptsCount} attempts)
          </p>
        </article>
      </section>

      {/* Per-Jurisdiction Verification Ledger */}
      <section
        aria-labelledby="jurisdiction-verification-heading"
        className="space-y-4 rounded-2xl border border-ink/[0.08] bg-canvas p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-accent-cyan">
              State Licensing Board Sync
            </span>
            <h3
              id="jurisdiction-verification-heading"
              className="text-h2 text-ink-primary"
            >
              Last-Verified Dates per Jurisdiction
            </h3>
          </div>
          <span className="font-mono text-xs text-ink-muted">
            Source: {snapshot.source === "supabase_rpc" ? "Live Database" : "Verified Ledger"} ·{" "}
            {formatShortDate(snapshot.generatedAt)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {snapshot.jurisdictionVerifications.map((jur) => (
            <article
              key={jur.id}
              data-testid={`accuracy-jur-${jur.state}`}
              className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-ink/[0.08] bg-card p-4"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-bold text-accent-cyan">
                    {jur.state}
                  </span>
                  <span className="rounded-full border border-ink/[0.12] bg-canvas px-2.5 py-0.5 font-mono text-xs text-ink-primary">
                    {jur.code_family} {jur.edition}
                  </span>
                </div>
                <h4 className="text-base font-semibold text-ink-primary">
                  {jur.name}
                </h4>
                <p className="text-xs text-ink-secondary">
                  Vendor: {jur.exam_vendor} ·{" "}
                  {jur.open_book ? "Open-book rules" : "Closed-book rules"}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/[0.08] pt-2.5 text-xs">
                <span className="tabular-nums text-ink-secondary">
                  Last verified:{" "}
                  <strong className="text-ink-primary">
                    {formatShortDate(jur.last_verified_at)}
                  </strong>
                </span>
                {jur.bulletin_url && (
                  <a
                    href={jur.bulletin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-accent-cyan hover:underline"
                  >
                    Bulletin
                    <ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 8-Point Licensed Plumber Standard */}
      <section
        aria-labelledby="rubric-standard-heading"
        className="space-y-4 rounded-2xl border border-ink/[0.08] bg-canvas p-5"
      >
        <div className="space-y-1">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-accent-cyan">
            Publication Gate
          </span>
          <h3 id="rubric-standard-heading" className="text-h2 text-ink-primary">
            8-Point Licensed Plumber Review Standard
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {RUBRIC_CRITERIA.map((criterion, idx) => (
            <div
              key={criterion.key}
              className="min-w-0 space-y-1.5 rounded-xl border border-ink/[0.08] bg-card p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-ink-muted">
                  0{idx + 1}
                </span>
                {criterion.isHardGate && (
                  <span className="rounded-full border border-accent-amber/40 bg-accent-amber/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-amber">
                    Hard gate ≥ {criterion.minForApproval}
                  </span>
                )}
              </div>
              <h4 className="text-sm font-semibold text-ink-primary">
                {criterion.label}
              </h4>
              <p className="text-xs leading-relaxed text-ink-secondary">
                {criterion.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Item-by-Item Review Ledger */}
      <section
        aria-labelledby="item-ledger-heading"
        className="space-y-4 rounded-2xl border border-ink/[0.08] bg-canvas p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-accent-cyan">
              Item-by-Item Audit Trail
            </span>
            <h3 id="item-ledger-heading" className="text-h2 text-ink-primary">
              Question Review Status &amp; Version History
            </h3>
          </div>
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            Showing {filteredItems.length} of {snapshot.items.length} items
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label
              htmlFor="ledger-search-input"
              className="mb-1 block text-xs font-medium text-ink-secondary"
            >
              Filter by item ID, domain, code ref, or license #
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <input
                id="ledger-search-input"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. IPC Ch. 9, TX-MP-41892..."
                className="min-h-[44px] w-full rounded-xl border border-ink/[0.12] bg-card pl-9 pr-3 text-sm text-ink-primary placeholder:text-ink-muted focus:border-accent-cyan focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <span className="block text-xs font-medium text-ink-secondary">
              Code edition
            </span>
            <div
              role="group"
              aria-label="Filter ledger by code edition"
              className="inline-flex divide-x divide-ink/[0.08] overflow-hidden rounded-xl border border-ink/[0.12] bg-card"
            >
              {(
                [
                  { id: "ALL", label: "All" },
                  { id: "IPC-2021", label: "IPC 2021" },
                  { id: "UPC-2024", label: "UPC 2024" },
                ] as const
              ).map((ed) => (
                <button
                  key={ed.id}
                  type="button"
                  onClick={() => setEditionFilter(ed.id)}
                  aria-pressed={editionFilter === ed.id}
                  className={`min-h-[44px] px-3 font-mono text-xs transition-colors ${
                    editionFilter === ed.id
                      ? "bg-elevated font-semibold text-accent-cyan"
                      : "text-ink-secondary hover:text-ink-primary"
                  }`}
                >
                  {ed.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span className="block text-xs font-medium text-ink-secondary">
              Status
            </span>
            <div
              role="group"
              aria-label="Filter ledger by review status"
              className="inline-flex divide-x divide-ink/[0.08] overflow-hidden rounded-xl border border-ink/[0.12] bg-card"
            >
              {(
                [
                  { id: "ALL", label: "All" },
                  { id: "published", label: "Published" },
                  { id: "revise", label: "In Revision" },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  aria-pressed={statusFilter === st.id}
                  className={`min-h-[44px] px-3 font-mono text-xs transition-colors ${
                    statusFilter === st.id
                      ? "bg-elevated font-semibold text-accent-cyan"
                      : "text-ink-secondary hover:text-ink-primary"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="divide-y divide-ink/[0.08] overflow-hidden rounded-xl border border-ink/[0.08] bg-card">
          {filteredItems.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-secondary">
              No ledger items match your current filter.
            </p>
          ) : (
            filteredItems.map((item) => (
              <AccuracyLedgerRow
                key={item.id}
                item={item}
                isExpanded={expandedItemId === item.id}
                onToggle={() =>
                  setExpandedItemId((prev) =>
                    prev === item.id ? null : item.id
                  )
                }
              />
            ))
          )}
        </div>
      </section>

      {/* Reported Errata & Resolutions */}
      <section
        aria-labelledby="errata-log-heading"
        className="space-y-4 rounded-2xl border border-ink/[0.08] bg-canvas p-5"
      >
        <div className="space-y-1">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-accent-amber">
            Errata &amp; Transparency
          </span>
          <h3 id="errata-log-heading" className="text-h2 text-ink-primary">
            Reported Errata &amp; Resolutions
          </h3>
        </div>

        <div className="divide-y divide-ink/[0.08] overflow-hidden rounded-xl border border-ink/[0.08] bg-card">
          {snapshot.errata.map((entry) => (
            <article
              key={entry.id}
              data-testid="errata-entry"
              className="space-y-2 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-accent-cyan">
                    {entry.itemCode}
                  </span>
                  <span className="font-mono text-xs text-ink-secondary">
                    {entry.codeRef}
                  </span>
                  <span className="rounded-md border border-ink/[0.1] bg-canvas px-2 py-0.5 font-mono text-[11px] text-ink-muted">
                    {entry.category}
                  </span>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
                    entry.status === "resolved"
                      ? "border-accent-emerald/40 bg-accent-emerald/10 text-accent-emerald"
                      : "border-accent-amber/40 bg-accent-amber/10 text-accent-amber"
                  }`}
                >
                  {entry.status === "resolved"
                    ? `Resolved in v${entry.resolvedInVersion ?? 2}`
                    : "In Revision"}
                </span>
              </div>
              <p className="text-sm font-medium text-ink-primary">
                {entry.summary}
              </p>
              <p className="text-xs leading-relaxed text-ink-secondary">
                <strong className="text-ink-primary">Resolution:</strong>{" "}
                {entry.resolution}
              </p>
              <p className="font-mono text-[11px] text-ink-muted">
                Reported {formatShortDate(entry.reportedAt)}
                {entry.resolvedAt
                  ? ` · Resolved ${formatShortDate(entry.resolvedAt)}`
                  : " · Pending re-approval"}
              </p>
            </article>
          ))}
        </div>
      </section>

      <p className="text-xs text-ink-muted">
        All study material is original and reviewed against adopted state codes.
        Verify against your adopted code. Not legal advice.
      </p>
    </div>
  );
}
