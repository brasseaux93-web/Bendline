"use client";

import Link from "next/link";
import { Compass, RefreshCw, WifiOff } from "lucide-react";

export default function OfflineFallbackPage() {
  return (
    <main className="blueprint-grid-bg flex min-h-dvh items-center justify-center bg-canvas px-4 py-12 text-ink-primary">
      <section className="bento-card w-full max-w-lg space-y-5 border-line-strong/80 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent-amber/40 bg-accent-amber/10 text-accent-amber">
            <WifiOff className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div>
            <p className="text-caption uppercase tracking-wider text-accent-amber">
              Offline Mode
            </p>
            <h1 className="text-h2 text-ink-primary">
              This route is not cached offline yet
            </h1>
          </div>
        </div>

        <p className="text-sm text-ink-secondary">
          Your cached session, jurisdiction question pack, and transactional outbox remain intact. Continue studying any pre-cached module below and changes will replay automatically when you reconnect.
        </p>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Link
            href="/practice"
            className="flex min-h-12 items-center justify-between rounded-xl border border-line-strong bg-elevated px-4 text-sm font-medium text-ink-primary hover:border-accent-cyan"
          >
            <span>Adaptive Practice</span>
            <Compass className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <Link
            href="/draw"
            className="flex min-h-12 items-center justify-between rounded-xl border border-line-strong bg-elevated px-4 text-sm font-medium text-ink-primary hover:border-accent-cyan"
          >
            <span>Pipe Drawing Lab</span>
            <Compass className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <Link
            href="/tools"
            className="flex min-h-12 items-center justify-between rounded-xl border border-line-strong bg-elevated px-4 text-sm font-medium text-ink-primary hover:border-accent-cyan"
          >
            <span>Code Calculators</span>
            <Compass className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <Link
            href="/progress"
            className="flex min-h-12 items-center justify-between rounded-xl border border-line-strong bg-elevated px-4 text-sm font-medium text-ink-primary hover:border-accent-cyan"
          >
            <span>Readiness &amp; Progress</span>
            <Compass className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-primary w-full"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Retry Connection
        </button>
      </section>
    </main>
  );
}
