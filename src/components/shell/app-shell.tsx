"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  CloudUpload,
  LogOut,
  SlidersHorizontal,
  Sparkles,
  User,
  WifiOff,
} from "lucide-react";
import { useAppState } from "@/components/providers/app-state-provider";
import { AFFILIATION_DISCLAIMER } from "@/lib/legal/constants";
import { BottomNav } from "./bottom-nav";
import { ThemeToggleButton } from "./theme-toggle";

export function AppShell({ children }: { children: ReactNode }) {
  const {
    activeJurisdiction,
    isOnline,
    pendingOutboxCount,
    reduceMotion,
    toggleReduceMotion,
    signOut,
  } = useAppState();

  return (
    <div className="min-h-dvh bg-canvas text-ink-primary">
      <header className="sticky top-0 z-30 border-b border-line-subtle/80 bg-glass/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="flex min-h-12 items-center gap-2 font-semibold tracking-tight text-ink-primary"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent-cyan/50 bg-elevated font-mono text-sm font-bold text-accent-cyan">
                B
              </span>
              <span className="text-base sm:text-lg">Bendline</span>
            </Link>

            <Link
              href="/onboarding"
              className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-line-strong bg-elevated/80 px-3 py-1 text-caption text-ink-primary transition-colors hover:border-accent-cyan"
            >
              <span className="font-mono font-semibold text-accent-cyan">
                {activeJurisdiction.state}
              </span>
              <span className="text-ink-secondary">
                {activeJurisdiction.code_family} {activeJurisdiction.edition}
              </span>
              <SlidersHorizontal
                className="h-3.5 w-3.5 text-ink-muted"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </Link>

            {activeJurisdiction.open_book && (
              <Link
                href="/navigate"
                className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-accent-emerald/50 bg-accent-emerald/10 px-3 py-1 text-caption font-semibold text-accent-emerald transition-colors hover:border-accent-emerald"
              >
                <BookOpen
                  className="h-3.5 w-3.5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">Code Nav</span>
                <span className="sm:hidden">Nav</span>
              </Link>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/account"
              data-testid="sync-status-badge"
              aria-label={`Sync status: ${
                !isOnline
                  ? `Offline, ${pendingOutboxCount} pending`
                  : pendingOutboxCount > 0
                    ? `Syncing, ${pendingOutboxCount} pending`
                    : "Synced"
              }`}
              className={`inline-flex min-h-12 items-center gap-1.5 rounded-xl border px-3 text-caption font-medium tabular-nums transition-colors ${
                !isOnline
                  ? "border-accent-amber/60 bg-accent-amber/15 text-ink-primary"
                  : pendingOutboxCount > 0
                    ? "border-accent-cyan/60 bg-accent-cyan/15 text-ink-primary"
                    : "border-line-subtle bg-elevated/70 text-ink-secondary hover:border-accent-cyan/70 hover:text-ink-primary"
              }`}
            >
              {!isOnline ? (
                <WifiOff
                  className="h-4 w-4 text-accent-amber"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : pendingOutboxCount > 0 ? (
                <CloudUpload
                  className="h-4 w-4 text-accent-cyan"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : (
                <CheckCircle2
                  className="h-4 w-4 text-accent-emerald"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              )}
              <span>
                {!isOnline
                  ? pendingOutboxCount > 0
                    ? `Offline · ${pendingOutboxCount} pending`
                    : "Offline"
                  : pendingOutboxCount > 0
                    ? `Syncing · ${pendingOutboxCount}`
                    : "Synced"}
              </span>
            </Link>

            <Link
              href="/account"
              aria-label="Account and billing"
              className="inline-flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-elevated/70 px-3 text-caption font-medium text-ink-secondary transition-colors hover:border-accent-cyan/70 hover:text-ink-primary"
            >
              <User className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="hidden sm:inline">Account</span>
            </Link>

            <ThemeToggleButton />

            <button
              type="button"
              onClick={toggleReduceMotion}
              aria-label="Toggle reduced motion"
              aria-pressed={reduceMotion}
              className={`inline-flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border px-3 text-caption transition-colors ${
                reduceMotion
                  ? "border-accent-emerald/70 bg-accent-emerald/15 text-ink-primary"
                  : "border-line-strong bg-elevated/70 text-ink-secondary hover:text-ink-primary"
              }`}
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="hidden lg:inline">
                {reduceMotion ? "Motion: Reduced" : "Motion: Auto"}
              </span>
            </button>

            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="inline-flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-elevated/70 px-3 text-caption text-ink-secondary transition-colors hover:border-accent-crimson/60 hover:text-ink-primary"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="hidden lg:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-5 sm:px-6 sm:pt-6">
        {children}
      </main>

      <footer className="mx-auto max-w-5xl border-t border-line-subtle/60 px-4 pb-28 pt-4 text-caption text-ink-secondary sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{AFFILIATION_DISCLAIMER}</span>
          <nav aria-label="Legal and trust links" className="flex flex-wrap items-center gap-4">
            <Link href="/accuracy" className="inline-flex min-h-12 items-center text-accent-cyan hover:underline">
              Accuracy Ledger
            </Link>
            <Link href="/account" className="inline-flex min-h-12 items-center text-accent-cyan hover:underline">
              Account &amp; Billing
            </Link>
            <Link href="/legal/terms" className="inline-flex min-h-12 items-center text-accent-cyan hover:underline">
              Terms
            </Link>
            <Link href="/legal/privacy" className="inline-flex min-h-12 items-center text-accent-cyan hover:underline">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>

      <BottomNav />
    </div>
  );
}
