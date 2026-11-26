"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, CloudUpload, LogOut, SlidersHorizontal, Sparkles, User, WifiOff } from "lucide-react";
import { BrandMark, Wordmark } from "@/components/brand/brand-mark";
import { useAppState } from "@/components/providers/app-state-provider";
import { AFFILIATION_DISCLAIMER } from "@/lib/legal/constants";
import { BottomNav } from "./bottom-nav";
import { ThemeToggleButton } from "./theme-toggle";

const TOOLBAR =
  "inline-flex items-center gap-0.5 rounded-2xl border border-line-subtle bg-elevated/50 p-0.5 [&_a]:border-transparent [&_a]:bg-transparent [&_button]:border-transparent [&_button]:bg-transparent [&_a:hover]:bg-elevated [&_button:hover]:bg-elevated";
const ICON_BTN =
  "inline-flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border px-3 text-caption font-medium text-ink-secondary transition-colors hover:text-ink-primary";
const FOOTER_LINK = "inline-flex min-h-12 items-center text-ink-secondary transition-colors hover:text-ink-primary";

export function AppShell({ children }: { children: ReactNode }) {
  const { activeJurisdiction, isOnline, pendingOutboxCount, reduceMotion, toggleReduceMotion, signOut } = useAppState();

  const syncLabel = !isOnline
    ? pendingOutboxCount > 0 ? `Offline · ${pendingOutboxCount} pending` : "Offline"
    : pendingOutboxCount > 0 ? `Syncing · ${pendingOutboxCount}` : "Synced";
  const syncAria = !isOnline
    ? `Offline, ${pendingOutboxCount} pending`
    : pendingOutboxCount > 0 ? `Syncing, ${pendingOutboxCount} pending` : "Synced";
  const syncTone = !isOnline
    ? "border-accent-amber/60 bg-accent-amber/15 text-ink-primary"
    : pendingOutboxCount > 0
      ? "border-accent-cyan/60 bg-accent-cyan/15 text-ink-primary"
      : "border-line-subtle bg-elevated/70 text-ink-secondary hover:border-accent-cyan/70 hover:text-ink-primary";

  return (
    <div className="min-h-dvh bg-canvas text-ink-primary">
      <header className="sticky top-0 z-30 border-b border-line-subtle bg-glass/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
          <Link href="/" className="order-1 flex min-h-12 items-center gap-2.5" aria-label="Bendline home">
            <BrandMark size={32} />
            <Wordmark />
          </Link>

          <div className="order-3 flex w-full items-center gap-2 pb-1 lg:order-2 lg:w-auto lg:pb-0">
            <Link
              href="/onboarding"
              className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-line-strong bg-elevated/80 px-3.5 text-caption text-ink-primary transition-colors hover:border-accent-cyan"
            >
              <span className="font-mono font-semibold text-accent-cyan">{activeJurisdiction.state}</span>
              <span className="text-ink-secondary">{activeJurisdiction.code_family} {activeJurisdiction.edition}</span>
              <SlidersHorizontal className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} aria-hidden="true" />
            </Link>

            {activeJurisdiction.open_book && (
              <Link
                href="/navigate"
                className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-accent-emerald/50 bg-accent-emerald/10 px-3.5 text-caption font-semibold text-accent-emerald transition-colors hover:border-accent-emerald"
              >
                <BookOpen className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                Code Nav
              </Link>
            )}
          </div>

          <div className="order-2 ml-auto flex items-center gap-2 lg:order-3">
            <Link
              href="/account"
              data-testid="sync-status-badge"
              aria-label={`Sync status: ${syncAria}`}
              className={`inline-flex min-h-12 items-center gap-1.5 rounded-xl border px-3 text-caption font-medium tabular-nums transition-colors ${syncTone}`}
            >
              {!isOnline ? (
                <WifiOff className="h-4 w-4 text-accent-amber" strokeWidth={1.75} aria-hidden="true" />
              ) : pendingOutboxCount > 0 ? (
                <CloudUpload className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-accent-emerald" strokeWidth={1.75} aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{syncLabel}</span>
            </Link>

            <div className={TOOLBAR}>
              <Link href="/account" aria-label="Account and billing" className={ICON_BTN}>
                <User className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span className="hidden xl:inline">Account</span>
              </Link>
              <ThemeToggleButton />
              <button
                type="button"
                onClick={toggleReduceMotion}
                aria-label="Toggle reduced motion"
                aria-pressed={reduceMotion}
                className={`${ICON_BTN} ${reduceMotion ? "!text-accent-emerald" : ""}`}
              >
                <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span className="hidden xl:inline">{reduceMotion ? "Motion: Reduced" : "Motion: Auto"}</span>
              </button>
              <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-line-subtle" />
              <button type="button" onClick={signOut} aria-label="Sign out" className={`${ICON_BTN} hover:!text-accent-crimson`}>
                <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span className="hidden xl:inline">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-6 sm:px-6 sm:pt-8">{children}</main>

      <footer className="mx-auto max-w-5xl border-t border-line-subtle px-4 pb-28 pt-4 text-caption text-ink-secondary sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{AFFILIATION_DISCLAIMER}</span>
          <nav aria-label="Legal and trust links" className="flex flex-wrap items-center gap-5">
            <Link href="/accuracy" className={FOOTER_LINK}>Accuracy Ledger</Link>
            <Link href="/account" className={FOOTER_LINK}>Account &amp; Billing</Link>
            <Link href="/legal/terms" className={FOOTER_LINK}>Terms</Link>
            <Link href="/legal/privacy" className={FOOTER_LINK}>Privacy</Link>
          </nav>
        </div>
      </footer>

      <BottomNav />
    </div>
  );
}
