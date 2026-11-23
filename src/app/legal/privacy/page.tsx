import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { AFFILIATION_DISCLAIMER } from "@/lib/legal/constants";

export default function PrivacyPage() {
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
            <LockKeyhole className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
            Privacy Policy
          </span>
        </div>

        <header className="space-y-2">
          <h1 className="text-h1 text-ink-primary">Bendline Privacy Policy</h1>
          <p className="text-sm text-ink-muted">Last updated: November 2026</p>
        </header>

        <section
          aria-label="Affiliation notice"
          className="rounded-xl border border-line-strong bg-elevated/80 p-4 text-sm text-ink-secondary"
        >
          {AFFILIATION_DISCLAIMER}
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-ink-secondary">
          <h2 className="text-base font-semibold text-ink-primary">
            1. Data We Store &amp; Local Offline Caching
          </h2>
          <p>
            Bendline stores your target jurisdiction, exam date, study attempts, spaced-repetition intervals, isometric drawing drafts, and navigation drill timings in Supabase (protected by PostgreSQL Row-Level Security) and in your browser&apos;s IndexedDB (via Dexie) so the app launches and operates offline.
          </p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-ink-secondary">
          <h2 className="text-base font-semibold text-ink-primary">
            2. Payment Data &amp; Billing Privacy
          </h2>
          <p>
            Card numbers and payment credentials are collected directly by Stripe during Checkout and Customer Portal sessions. Bendline stores only opaque Stripe customer, subscription, and price identifiers alongside webhook event IDs required for idempotent billing and 3-day grace enforcement.
          </p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-ink-secondary">
          <h2 className="text-base font-semibold text-ink-primary">
            3. Export &amp; Account Deletion
          </h2>
          <p>
            You can download a complete JSON archive of your local and server study records or permanently delete your account at any time from the{" "}
            <Link href="/account" className="font-medium text-accent-cyan underline underline-offset-4">
              Account &amp; Billing
            </Link>{" "}
            page. Account deletion clears local IndexedDB caches and deletes user-owned rows.
          </p>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-4 text-caption text-ink-muted">
          <span>{AFFILIATION_DISCLAIMER}</span>
          <div className="flex items-center gap-4">
            <Link href="/legal/terms" className="text-accent-cyan hover:underline">
              Terms of Service
            </Link>
            <Link href="/account" className="font-medium text-accent-cyan underline underline-offset-4">
              Account &amp; Billing
            </Link>
          </div>
        </footer>
      </article>
    </main>
  );
}
