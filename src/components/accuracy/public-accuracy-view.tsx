"use client";

import Link from "next/link";
import { AccuracyLedgerContent } from "@/components/modals/accuracy-ledger-content";
import { ThemeToggleButton } from "@/components/shell/theme-toggle";
import type { AccuracyMetricsSnapshot } from "@/lib/accuracy/metrics";

export function PublicAccuracyView({
  snapshot,
}: {
  snapshot: AccuracyMetricsSnapshot;
}) {
  return (
    <div className="min-h-dvh bg-canvas text-ink-primary">
      <header className="sticky top-0 z-30 border-b border-ink/[0.08] bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="inline-flex min-h-[44px] min-w-0 items-center gap-2.5 rounded-lg font-semibold tracking-tight text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent-cyan/40 bg-card font-mono text-sm font-bold text-accent-cyan">
              B
            </span>
            <span className="truncate">Bendline</span>
            <span className="hidden font-mono text-xs uppercase tracking-[0.14em] text-ink-muted sm:inline">
              · Accuracy Ledger
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggleButton variant="icon" />
            <Link
              href="/diagnostic"
              className="btn-secondary min-h-[44px] px-3.5 py-2 text-xs font-semibold"
            >
              Free Diagnostic
            </Link>
            <Link
              href="/"
              className="btn-primary min-h-[44px] px-3.5 py-2 text-xs"
            >
              Open Study App
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <AccuracyLedgerContent initialSnapshot={snapshot} />
      </main>
    </div>
  );
}
