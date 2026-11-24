"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AFFILIATION_DISCLAIMER } from "@/lib/legal/constants";
import type { GlobalModalId } from "./types";

export function TermsContent({
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
          <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-accent-emerald">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Terms of Service
          </span>
          <span className="font-mono text-xs text-ink-muted">
            Last updated: November 2026
          </span>
        </div>
        <h2 className="text-h1 text-ink-primary">Bendline Terms of Service</h2>
      </header>

      <section
        aria-label="Affiliation notice"
        className="rounded-xl border border-accent-amber/40 bg-accent-amber/10 p-4 text-sm text-ink-primary"
      >
        <p className="font-semibold text-accent-amber">Independent Study Platform</p>
        <p className="mt-1 text-ink-secondary">{AFFILIATION_DISCLAIMER}</p>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-ink-secondary">
        <h3 className="text-base font-semibold text-ink-primary">
          1. Educational Purpose Only
        </h3>
        <p>
          Bendline provides original practice scenarios, plumbing sizing calculators, isometric drawing drills, and code navigation exercises to prepare for journeyman plumber licensing exams. Always verify every rule, amendment, and citation directly against your jurisdiction&apos;s legally adopted plumbing code and official exam bulletin. Bendline does not provide legal, engineering, or licensing board advice.
        </p>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-ink-secondary">
        <h3 className="text-base font-semibold text-ink-primary">
          2. Subscriptions, Exam Passes &amp; 3-Day Grace Period
        </h3>
        <p>
          Paid plans include a one-time 3-Month Exam Pass and a recurring Monthly Pro subscription billed through Stripe. Pricing is configured per deployment environment via Stripe Price IDs. If a recurring renewal payment fails, Bendline preserves full Pro access for a 3-day grace window so you can update your payment method in the Stripe Customer Portal without losing study continuity. After the 3-day grace window expires without payment recovery, the account reverts to the Free tier (12 scored practice questions per day).
        </p>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-ink-secondary">
        <h3 className="text-base font-semibold text-ink-primary">
          3. Acceptable Use &amp; Content Integrity
        </h3>
        <p>
          You may not scrape, redistribute, or attempt to circumvent free-tier limits or automated exam timing controls. All practice items and explanations in Bendline are independently authored educational material and do not reproduce copyrighted model code text or confidential examination banks.
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.08] pt-4 text-xs text-ink-muted">
        <span>{AFFILIATION_DISCLAIMER}</span>
        <div className="flex items-center gap-4">
          {standalone || !onSwitchModal ? (
            <>
              <Link href="/legal/privacy" className="text-accent-cyan hover:underline">
                Privacy Policy
              </Link>
              <Link href="/account" className="text-accent-cyan hover:underline">
                Account &amp; Billing
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onSwitchModal("privacy")}
                className="font-medium text-accent-cyan hover:underline"
              >
                Privacy Policy
              </button>
              <button
                type="button"
                onClick={() => onSwitchModal("account")}
                className="font-medium text-accent-cyan hover:underline"
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
