import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AFFILIATION_DISCLAIMER } from "@/lib/legal/constants";

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-canvas px-4 py-10 text-ink-primary sm:px-6">
      <article className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-line-subtle bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle pb-4">
          <Link
            href="/"
            className="inline-flex min-h-12 items-center gap-2 text-sm font-medium text-accent-cyan hover:underline"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Back to Bendline
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-subtle bg-elevated px-3 py-1 text-caption text-ink-secondary">
            <ShieldCheck className="h-4 w-4 text-accent-emerald" strokeWidth={1.75} aria-hidden="true" />
            Terms of Service
          </span>
        </div>

        <header className="space-y-2">
          <h1 className="text-h1 text-ink-primary">Bendline Terms of Service</h1>
          <p className="text-sm text-ink-muted">Last updated: November 2026</p>
        </header>

        <section
          aria-label="Affiliation notice"
          className="rounded-xl border border-accent-amber/40 bg-accent-amber/10 p-4 text-sm text-ink-primary"
        >
          <p className="font-semibold text-accent-amber">Independent Study Platform</p>
          <p className="mt-1">{AFFILIATION_DISCLAIMER}</p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-ink-secondary">
          <h2 className="text-base font-semibold text-ink-primary">
            1. Educational Purpose Only
          </h2>
          <p>
            Bendline provides original practice scenarios, plumbing sizing calculators, isometric drawing drills, and code navigation exercises to prepare for journeyman plumber licensing exams. Always verify every rule, amendment, and citation directly against your jurisdiction&apos;s legally adopted plumbing code and official exam bulletin. Bendline does not provide legal, engineering, or licensing board advice.
          </p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-ink-secondary">
          <h2 className="text-base font-semibold text-ink-primary">
            2. Subscriptions, Exam Passes &amp; 3-Day Grace Period
          </h2>
          <p>
            Paid plans include a one-time 3-Month Exam Pass and a recurring Monthly Pro subscription billed through Stripe. Pricing is configured per deployment environment via Stripe Price IDs. If a recurring renewal payment fails, Bendline preserves full Pro access for a 3-day grace window so you can update your payment method in the Stripe Customer Portal without losing study continuity. After the 3-day grace window expires without payment recovery, the account reverts to the Free tier (12 scored practice questions per day).
          </p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-ink-secondary">
          <h2 className="text-base font-semibold text-ink-primary">
            3. Acceptable Use &amp; Content Integrity
          </h2>
          <p>
            You may not scrape, redistribute, or attempt to circumvent free-tier limits or automated exam timing controls. All practice items and explanations in Bendline are independently authored educational material and do not reproduce copyrighted model code text or confidential examination banks.
          </p>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-4 text-caption text-ink-muted">
          <span>{AFFILIATION_DISCLAIMER}</span>
          <div className="flex items-center gap-4">
            <Link href="/legal/privacy" className="text-accent-cyan hover:underline">
              Privacy Policy
            </Link>
            <Link href="/account" className="text-accent-cyan hover:underline">
              Account &amp; Billing
            </Link>
          </div>
        </footer>
      </article>
    </main>
  );
}
