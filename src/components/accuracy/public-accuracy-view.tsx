"use client";

import Link from "next/link";
import {
  AlertCircle,
  BookOpenCheck,
  Clock,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import type { AccuracyMetricsSnapshot } from "@/lib/accuracy/metrics";

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

export function PublicAccuracyView({
  snapshot,
}: {
  snapshot: AccuracyMetricsSnapshot;
}) {
  return (
    <div className="min-h-dvh bg-canvas text-ink-primary">
      <header className="sticky top-0 z-30 border-b border-line-subtle/80 bg-glass/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex min-h-12 items-center gap-2 font-semibold tracking-tight text-ink-primary"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent-cyan/50 bg-elevated font-mono text-sm font-bold text-accent-cyan">
              B
            </span>
            <span>Bendline</span>
            <span className="hidden rounded-full border border-line-subtle px-2.5 py-0.5 text-caption text-ink-secondary sm:inline">
              Public Accuracy Ledger
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link href="/progress" className="btn-secondary min-h-12 px-3 text-caption">
              Progress Bento
            </Link>
            <Link href="/" className="btn-primary min-h-12 px-3.5 text-caption">
              Open Study App
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 text-caption uppercase tracking-wider text-accent-cyan">
            <ShieldCheck className="h-4 w-4 text-accent-emerald" strokeWidth={1.75} aria-hidden="true" />
            Verified Technical Accuracy Ledger
          </span>
          <h1 className="text-h1 text-ink-primary">
            Public Content Review &amp; Jurisdiction Verification
          </h1>
          <p className="max-w-2xl text-body text-ink-secondary">
            Every Bendline item is published only after passing an 8-criteria
            review by a licensed master or journeyman plumber and binding to
            explicitly verified code editions and state vendor bulletins.
          </p>
        </div>

        {/* Core 4 Aggregate Trust Bento Cards */}
        <section
          aria-label="Published question accuracy metrics"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <article className="bento-card space-y-2">
            <div className="flex items-center justify-between text-caption uppercase tracking-wider text-ink-secondary">
              <span>Published Questions</span>
              <BookOpenCheck className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <p
              data-testid="accuracy-published-count"
              className="font-mono text-hero tabular-nums text-ink-primary"
            >
              {snapshot.publishedQuestionsCount}
            </p>
            <p className="text-caption text-ink-secondary">
              Published items passing current-version approval checks
            </p>
          </article>

          <article className="bento-card space-y-2">
            <div className="flex items-center justify-between text-caption uppercase tracking-wider text-ink-secondary">
              <span>Licensed Reviewer Rate</span>
              <ShieldCheck className="h-4 w-4 text-accent-emerald" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <p
              data-testid="accuracy-licensed-pct"
              className="font-mono text-hero tabular-nums text-accent-emerald"
            >
              {snapshot.pctReviewedByLicensed}%
            </p>
            <p className="text-caption tabular-nums text-ink-secondary">
              {snapshot.licensedReviewedCount} of {snapshot.publishedQuestionsCount}{" "}
              signed with a verified trade license
            </p>
          </article>

          <article className="bento-card space-y-2">
            <div className="flex items-center justify-between text-caption uppercase tracking-wider text-ink-secondary">
              <span>Median Review Age</span>
              <Clock className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <p
              data-testid="accuracy-median-age"
              className="font-mono text-hero tabular-nums text-ink-primary"
            >
              {snapshot.medianReviewAgeDays}d
            </p>
            <p className="text-caption text-ink-secondary">
              Median days since latest licensed technical sign-off
            </p>
          </article>

          <article className="bento-card space-y-2">
            <div className="flex items-center justify-between text-caption uppercase tracking-wider text-ink-secondary">
              <span>Confirmed Error Rate</span>
              <AlertCircle className="h-4 w-4 text-accent-amber" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <p
              data-testid="accuracy-error-rate"
              className="font-mono text-hero tabular-nums text-ink-primary"
            >
              {snapshot.confirmedErrorRatePer1000}
            </p>
            <p className="text-caption tabular-nums text-ink-secondary">
              Confirmed errors per 1,000 attempts ({snapshot.confirmedErrorCount}{" "}
              resolved / {snapshot.totalAttemptsCount} attempts)
            </p>
          </article>
        </section>

        {/* Per-Jurisdiction Verification Ledger */}
        <section
          aria-labelledby="jurisdiction-verification-heading"
          className="bento-card space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-caption uppercase tracking-wider text-accent-cyan">
                State Licensing Board Sync
              </span>
              <h2
                id="jurisdiction-verification-heading"
                className="text-h2 text-ink-primary"
              >
                Last-Verified Dates per Jurisdiction
              </h2>
            </div>
            <span className="font-mono text-caption text-ink-muted">
              Source: {snapshot.source === "supabase_rpc" ? "Live Supabase" : "Seed Ledger"} ·{" "}
              {formatShortDate(snapshot.generatedAt)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {snapshot.jurisdictionVerifications.map((jur) => (
              <article
                key={jur.id}
                data-testid={`accuracy-jur-${jur.state}`}
                className="flex flex-col justify-between gap-3 rounded-xl border border-line-subtle bg-canvas/70 p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-accent-cyan">
                      {jur.state}
                    </span>
                    <span className="rounded-full border border-line-strong bg-elevated px-2.5 py-0.5 font-mono text-caption text-ink-primary">
                      {jur.code_family} {jur.edition}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-ink-primary">
                    {jur.name}
                  </h3>
                  <p className="text-caption text-ink-secondary">
                    Vendor: {jur.exam_vendor} ·{" "}
                    {jur.open_book ? "Open-book rules" : "Closed-book rules"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle pt-2.5 text-caption">
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

        <p className="text-caption text-ink-muted">
          All study material is original and reviewed against adopted state codes.
          Verify against your adopted code. Not legal advice.
        </p>
      </main>
    </div>
  );
}
