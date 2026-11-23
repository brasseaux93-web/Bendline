"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import {
  ArrowDown,
  Calculator,
  Compass,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { useAppState } from "@/components/providers/app-state-provider";
import { ThemeToggleButton } from "@/components/shell/theme-toggle";
import { AFFILIATION_DISCLAIMER } from "@/lib/legal/constants";

export function BlueprintLanding() {
  const heroRef = useRef<HTMLDivElement | null>(null);
  const authRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const { jurisdictions, reduceMotion, toggleReduceMotion } = useAppState();
  const disableParallax = Boolean(prefersReducedMotion || reduceMotion);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const schematicY = useTransform(
    scrollYProgress,
    [0, 1],
    disableParallax ? [0, 0] : [0, -28]
  );
  const schematicScale = useTransform(
    scrollYProgress,
    [0, 1],
    disableParallax ? [1, 1] : [1, 0.96]
  );
  const schematicOpacity = useTransform(
    scrollYProgress,
    [0, 1],
    disableParallax ? [1, 1] : [1, 0.65]
  );

  function scrollToAuth() {
    authRef.current?.scrollIntoView({
      behavior: disableParallax ? "auto" : "smooth",
    });
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink-primary">
      <header className="sticky top-0 z-30 border-b border-line-subtle/70 bg-glass/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent-cyan/50 bg-elevated font-mono text-base font-bold text-accent-cyan">
              B
            </span>
            <div>
              <span className="text-base font-semibold tracking-tight text-ink-primary">
                Bendline
              </span>
              <span className="ml-2 hidden rounded-full border border-line-subtle px-2 py-0.5 text-caption text-ink-secondary sm:inline">
                TX · CA · CO Journeyman Prep
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/accuracy"
              className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-line-subtle bg-surface/80 px-3.5 text-caption font-semibold text-ink-primary hover:border-accent-cyan"
            >
              <ShieldCheck
                className="h-4 w-4 text-accent-emerald"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Accuracy
            </Link>
            <ThemeToggleButton />
            <button
              type="button"
              onClick={toggleReduceMotion}
              aria-label="Toggle reduced motion"
              aria-pressed={reduceMotion}
              className="inline-flex min-h-12 items-center rounded-xl border border-line-strong bg-elevated/80 px-3.5 text-caption text-ink-secondary hover:text-ink-primary"
            >
              {reduceMotion ? "Motion: Reduced" : "Reduce motion"}
            </button>
          </div>
        </div>
      </header>

      <main>
        <section
          ref={heroRef}
          className="blueprint-grid-bg relative overflow-hidden border-b border-line-subtle"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:py-20">
            <div className="space-y-6 lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent-cyan/40 bg-surface/90 px-3.5 py-1.5 text-caption uppercase tracking-wider text-accent-cyan">
                <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                TX (IPC 2021) · CA (UPC 2024) · CO (IPC 2021)
              </div>

              <h1 className="text-hero text-ink-primary">
                Straight-code prep for Texas, California, and Colorado Journeyman Plumbers.
              </h1>

              <p className="max-w-xl text-body text-ink-secondary">
                Edition-aware questions reviewed by licensed plumbers, deterministic pipe-sizing drills, an isometric drawing lab with explainable scoring, and plain-language mistake diagnosis — built to work offline.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={scrollToAuth}
                  className="btn-primary"
                >
                  Start Free Diagnostic
                  <ArrowDown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
                <Link
                  href="/accuracy"
                  className="inline-flex min-h-12 items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary"
                >
                  <ShieldCheck
                    className="h-4 w-4 text-accent-emerald"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  Public licensed-review ledger &rarr;
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
                {jurisdictions.map((jur) => (
                  <div
                    key={jur.id}
                    className="rounded-xl border border-line-subtle bg-surface/90 p-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold text-accent-cyan">
                        {jur.state}
                      </span>
                      <span className="text-caption text-ink-secondary">
                        {jur.code_family} {jur.edition}
                      </span>
                    </div>
                    <p className="mt-1 tabular-nums text-sm font-semibold text-ink-primary">
                      {jur.question_count} Qs · {jur.time_limit_min}m · {jur.pass_pct}%
                    </p>
                    <p className="text-caption text-ink-muted">
                      {jur.open_book ? "Open book" : "Closed book"} · {jur.exam_vendor}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <motion.div
              style={{
                y: schematicY,
                scale: schematicScale,
                opacity: schematicOpacity,
              }}
              className="lg:col-span-5"
            >
              <div className="glass-surface relative overflow-hidden p-5">
                <div className="flex items-center justify-between border-b border-line-subtle pb-3">
                  <span className="font-mono text-caption text-accent-cyan">
                    ISOMETRIC RISER · DWV-01
                  </span>
                  <span className="rounded-full bg-accent-emerald/15 px-2.5 py-0.5 text-caption text-accent-emerald">
                    1/4 in/ft grade
                  </span>
                </div>

                <svg
                  viewBox="0 0 360 260"
                  className="mt-4 h-auto w-full"
                  role="img"
                  aria-label="Isometric plumbing drainage and vent riser diagram"
                >
                  <defs>
                    <pattern
                      id="iso-dots"
                      width="24"
                      height="24"
                      patternUnits="userSpaceOnUse"
                    >
                      <circle
                        cx="2"
                        cy="2"
                        r="1"
                        fill="rgb(var(--accent) / 0.25)"
                      />
                    </pattern>
                  </defs>
                  <rect width="360" height="260" fill="url(#iso-dots)" rx="12" />

                  <path
                    d="M120 35 V175"
                    stroke="rgb(var(--accent))"
                    strokeWidth="3"
                    strokeDasharray="6 4"
                    fill="none"
                  />
                  <path
                    d="M230 45 V165 L120 220 L55 185"
                    stroke="rgb(var(--primary))"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <path
                    d="M120 115 L175 142 V192"
                    stroke="rgb(var(--success))"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <path
                    d="M285 138 L230 165"
                    stroke="rgb(var(--primary))"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    fill="none"
                  />

                  <circle cx="120" cy="35" r="5" fill="rgb(var(--accent))" />
                  <circle cx="175" cy="142" r="5" fill="rgb(var(--success))" />
                  <circle cx="285" cy="138" r="5" fill="rgb(var(--primary))" />
                  <circle cx="55" cy="185" r="5" fill="rgb(var(--primary))" />

                  <text
                    x="130"
                    y="39"
                    fill="rgb(var(--muted))"
                    fontSize="11"
                    fontFamily="monospace"
                  >
                    VTR 2&quot;
                  </text>
                  <text
                    x="184"
                    y="138"
                    fill="rgb(var(--muted))"
                    fontSize="11"
                    fontFamily="monospace"
                  >
                    LAV WET VENT
                  </text>
                  <text
                    x="242"
                    y="128"
                    fill="rgb(var(--ink))"
                    fontSize="11"
                    fontFamily="monospace"
                  >
                    WC 3&quot;
                  </text>
                  <text
                    x="64"
                    y="212"
                    fill="rgb(var(--primary))"
                    fontSize="11"
                    fontFamily="monospace"
                  >
                    BLDG DRAIN 3&quot;
                  </text>
                </svg>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line-subtle pt-3 text-caption">
                  <div>
                    <span className="block text-ink-muted">Readiness gate</span>
                    <span className="tabular-nums font-semibold text-ink-primary">
                      15 / topic
                    </span>
                  </div>
                  <div>
                    <span className="block text-ink-muted">Topics</span>
                    <span className="tabular-nums font-semibold text-ink-primary">
                      10 domains
                    </span>
                  </div>
                  <div>
                    <span className="block text-ink-muted">Offline</span>
                    <span className="font-semibold text-accent-emerald">
                      Dexie + SW
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Three Concrete Benefit Blocks */}
        <section
          aria-labelledby="benefits-heading"
          className="mx-auto max-w-6xl space-y-6 px-4 py-12 sm:px-6"
        >
          <div className="space-y-1">
            <span className="text-caption uppercase tracking-wider text-accent-cyan">
              Trade-Tested Workflow
            </span>
            <h2 id="benefits-heading" className="text-h1 text-ink-primary">
              Built like a field gauge, not a flashcard gimmick
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <article className="bento-card space-y-2.5">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-accent-cyan/40 bg-elevated text-accent-cyan">
                <Calculator className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <h3 className="text-h3 text-ink-primary">
                Deterministic Math &amp; Plain-Language Diagnosis
              </h3>
              <p className="text-sm leading-relaxed text-ink-secondary">
                Every DFU, WSFU, drain, vent, and gas-line drill is computed deterministically from verified tables for your state&apos;s edition — and every miss is tagged clearly as concept, lookup, arithmetic, misread, edition confusion, or unit error.
              </p>
            </article>

            <article className="bento-card space-y-2.5">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-accent-amber/40 bg-elevated text-accent-amber">
                <Compass className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <h3 className="text-h3 text-ink-primary">
                Isometric Pipe Lab with Explainable Scoring
              </h3>
              <p className="text-sm leading-relaxed text-ink-secondary">
                Lay out traps, wet vents, fittings, slope arrows, and cleanouts by touch, keyboard, or structured list view. Rule-based scoring flags exact offending nodes against verified code rules.
              </p>
            </article>

            <article className="bento-card space-y-2.5">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-accent-emerald/40 bg-elevated text-accent-emerald">
                <WifiOff className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <h3 className="text-h3 text-ink-primary">
                Licensed-Reviewed Content That Runs Offline
              </h3>
              <p className="text-sm leading-relaxed text-ink-secondary">
                Items publish only after passing an 8-point review by a licensed plumber. Your jurisdiction&apos;s question pack, calculators, and drawing drafts work without cell reception and sync cleanly when you reconnect.
              </p>
            </article>
          </div>
        </section>

        {/* Sign-in / Diagnostic Entry & FAQ */}
        <section
          ref={authRef}
          id="sign-in"
          className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 border-t border-line-subtle px-4 py-12 sm:px-6 lg:grid-cols-12"
        >
          <div className="space-y-5 lg:col-span-6">
            <div>
              <span className="text-caption uppercase tracking-wider text-accent-cyan">
                Straight Answers (FAQ)
              </span>
              <h2 className="text-h1 text-ink-primary">
                Before you open the book
              </h2>
            </div>

            <div className="space-y-3">
              <article className="rounded-xl border border-line-subtle bg-surface p-4">
                <h3 className="text-base font-semibold text-ink-primary">
                  Is this affiliated with my state board?
                </h3>
                <p className="mt-1 text-sm text-ink-secondary">
                  No. {AFFILIATION_DISCLAIMER} Bendline is an independent exam-prep workspace using originally authored questions, calculators, and paraphrases. Always verify rules against your adopted code book and state bulletin.
                </p>
              </article>

              <article className="rounded-xl border border-line-subtle bg-surface p-4">
                <h3 className="text-base font-semibold text-ink-primary">
                  Why doesn&apos;t Bendline advertise a pass-rate guarantee?
                </h3>
                <p className="mt-1 text-sm text-ink-secondary">
                  Passing depends on knowing your state&apos;s adopted code and timing under pressure — not marketing slogans. Bendline locks your readiness score until you complete at least 15 questions across all 10 exam domains.
                </p>
              </article>

              <article className="rounded-xl border border-line-subtle bg-surface p-4">
                <h3 className="text-base font-semibold text-ink-primary">
                  Can I start a diagnostic offline on the job site?
                </h3>
                <p className="mt-1 text-sm text-ink-secondary">
                  Yes. Your authenticated session, active jurisdiction pack, calculators, and drawing drafts cache locally in IndexedDB and replay cleanly with idempotency keys once signal returns.
                </p>
              </article>
            </div>
          </div>

          <div className="lg:col-span-6">
            <AuthCard primarySubmit={false} />
          </div>
        </section>
      </main>

      <footer className="border-t border-line-subtle bg-surface/60 px-4 py-6 text-caption text-ink-secondary sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <span>{AFFILIATION_DISCLAIMER}</span>
          <nav aria-label="Footer legal links" className="flex flex-wrap items-center gap-4">
            <Link href="/accuracy" className="inline-flex min-h-12 items-center text-accent-cyan hover:underline">
              Public Accuracy Ledger
            </Link>
            <Link href="/account" className="inline-flex min-h-12 items-center text-accent-cyan hover:underline">
              Account &amp; Billing
            </Link>
            <Link href="/legal/terms" className="inline-flex min-h-12 items-center text-accent-cyan hover:underline">
              Terms of Service
            </Link>
            <Link href="/legal/privacy" className="inline-flex min-h-12 items-center text-accent-cyan hover:underline">
              Privacy Policy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
