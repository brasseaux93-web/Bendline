"use client";

import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { AFFILIATION_DISCLAIMER } from "@/lib/legal/constants";
import type { GlobalModalId } from "./types";

export function PrivacyContent({
  onSwitchModal,
  standalone = false,
}: {
  onSwitchModal?: (id: GlobalModalId) => void;
  standalone?: boolean;
}) {
  return (
    <div className="space-y-6 text-ink-primary">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-accent-cyan">
            <LockKeyhole className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Privacy Policy
          </span>
          <span className="font-mono text-xs text-ink-muted">
            Last updated: November 2026
          </span>
        </div>
        <h2 className="text-h1 text-ink-primary">Bendline Privacy Policy</h2>
      </header>

      <section
        aria-label="Affiliation notice"
        className="rounded-xl border border-ink/[0.1] bg-canvas p-4 text-sm text-ink-secondary"
      >
        {AFFILIATION_DISCLAIMER}
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-ink-secondary">
        <h3 className="text-base font-semibold text-ink-primary">
          1. Data We Store &amp; Local Offline Caching
        </h3>
        <p>
          Bendline stores your target jurisdiction, exam date, study attempts, spaced-repetition intervals, isometric drawing drafts, and navigation drill timings in Supabase (protected by PostgreSQL Row-Level Security) and in your device&apos;s local offline storage so the app launches and operates without signal.
        </p>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-ink-secondary">
        <h3 className="text-base font-semibold text-ink-primary">
          2. Payment Data &amp; Billing Privacy
        </h3>
        <p>
          Card numbers and payment credentials are collected directly by Stripe during Checkout and Customer Portal sessions. Bendline stores only opaque Stripe customer, subscription, and price identifiers alongside webhook event IDs required for idempotent billing and 3-day grace enforcement.
        </p>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-ink-secondary">
        <h3 className="text-base font-semibold text-ink-primary">
          3. Export &amp; Account Deletion
        </h3>
        <p>
          You can download a complete JSON archive of your local and server study records or permanently delete your account at any time from{" "}
          {standalone || !onSwitchModal ? (
            <Link href="/account" className="font-medium text-accent-cyan underline underline-offset-4">
              Account &amp; Billing
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => onSwitchModal("account")}
              className="font-medium text-accent-cyan underline underline-offset-4"
            >
              Account &amp; Billing
            </button>
          )}
          . Account deletion clears local offline caches and deletes user-owned rows.
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.08] pt-4 text-xs text-ink-muted">
        <span>{AFFILIATION_DISCLAIMER}</span>
        <div className="flex items-center gap-4">
          {standalone || !onSwitchModal ? (
            <>
              <Link href="/legal/terms" className="text-accent-cyan hover:underline">
                Terms of Service
              </Link>
              <Link href="/account" className="font-medium text-accent-cyan underline underline-offset-4">
                Account &amp; Billing
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onSwitchModal("terms")}
                className="font-medium text-accent-cyan hover:underline"
              >
                Terms of Service
              </button>
              <button
                type="button"
                onClick={() => onSwitchModal("account")}
                className="font-medium text-accent-cyan underline underline-offset-4"
              >
                Account &amp; Billing
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
