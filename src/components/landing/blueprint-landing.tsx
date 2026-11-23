"use client";

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowDown, Calculator, Compass, ShieldCheck, Sparkles, WifiOff, type LucideIcon } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { BrandMark, Wordmark } from "@/components/brand/brand-mark";
import { IsoRiser } from "@/components/diagrams/iso-riser";
import { useAppState } from "@/components/providers/app-state-provider";
import { ThemeToggleButton } from "@/components/shell/theme-toggle";
import { AFFILIATION_DISCLAIMER } from "@/lib/legal/constants";

const BENEFITS: { n: string; icon: LucideIcon; tone: string; title: string; body: string }[] = [
  {
    n: "01",
    icon: Calculator,
    tone: "border-accent-cyan/40 text-accent-cyan",
    title: "Deterministic Math & Plain-Language Diagnosis",
    body: "Every DFU, WSFU, drain, vent, and gas-line drill is computed deterministically from verified tables for your state's edition — and every miss is tagged clearly as concept, lookup, arithmetic, misread, edition confusion, or unit error.",
  },
  {
    n: "02",
    icon: Compass,
    tone: "border-accent-amber/40 text-accent-amber",
    title: "Isometric Pipe Lab with Explainable Scoring",
    body: "Lay out traps, wet vents, fittings, slope arrows, and cleanouts by touch, keyboard, or structured list view. Rule-based scoring flags exact offending nodes against verified code rules.",
  },
  {
    n: "03",
    icon: WifiOff,
    tone: "border-accent-emerald/40 text-accent-emerald",
    title: "Licensed-Reviewed Content That Runs Offline",
    body: "Items publish only after passing an 8-point review by a licensed plumber. Your jurisdiction's question pack, calculators, and drawing drafts work without cell reception and sync cleanly when you reconnect.",
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Is this affiliated with my state board?",
    a: <>No. {AFFILIATION_DISCLAIMER} Bendline is an independent exam-prep workspace using originally authored questions, calculators, and paraphrases. Always verify rules against your adopted code book and state bulletin.</>,
  },
  {
    q: "Why doesn't Bendline advertise a pass-rate guarantee?",
    a: "Passing depends on knowing your state's adopted code and timing under pressure — not marketing slogans. Bendline locks your readiness score until you complete at least 15 questions across all 10 exam domains.",
  },
  {
    q: "Can I start a diagnostic offline on the job site?",
    a: "Yes. Your authenticated session, active jurisdiction pack, calculators, and drawing drafts cache locally in IndexedDB and replay cleanly with idempotency keys once signal returns.",
  },
];

const TOOLBAR =
  "inline-flex items-center gap-0.5 rounded-2xl border border-line-subtle bg-elevated/50 p-0.5 [&_button]:border-transparent [&_button]:bg-transparent [&_button:hover]:bg-elevated";
const FOOTER_LINK = "inline-flex min-h-12 items-center text-ink-secondary transition-colors hover:text-ink-primary";

export function BlueprintLanding() {
  const heroRef = useRef<HTMLDivElement | null>(null);
  const authRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const { jurisdictions, reduceMotion, toggleReduceMotion } = useAppState();
  const still = Boolean(prefersReducedMotion || reduceMotion);

  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const schematicY = useTransform(scrollYProgress, [0, 1], still ? [0, 0] : [0, -28]);
  const schematicScale = useTransform(scrollYProgress, [0, 1], still ? [1, 1] : [1, 0.96]);
  const schematicOpacity = useTransform(scrollYProgress, [0, 1], still ? [1, 1] : [1, 0.65]);

  function scrollToAuth() {
    authRef.current?.scrollIntoView({ behavior: still ? "auto" : "smooth" });
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink-primary">
      <header className="sticky top-0 z-30 border-b border-line-subtle bg-glass/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark size={34} />
            <Wordmark />
            <span className="eyebrow hidden rounded-full border border-line-subtle px-2.5 py-1 !text-ink-secondary md:inline">
              TX · CA · CO
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/accuracy" className="hidden min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-medium text-ink-secondary transition-colors hover:text-ink-primary sm:inline-flex">
              <ShieldCheck className="h-4 w-4 text-accent-emerald" strokeWidth={1.75} aria-hidden="true" />
              Accuracy ledger
            </Link>
            <div className={TOOLBAR}>
              <ThemeToggleButton />
              <button
                type="button"
                onClick={toggleReduceMotion}
                aria-label="Toggle reduced motion"
                aria-pressed={reduceMotion}
                className="inline-flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border px-3 text-caption font-medium text-ink-secondary transition-colors hover:text-ink-primary"
              >
                <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span className="hidden lg:inline">{reduceMotion ? "Motion: Reduced" : "Motion: Auto"}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section ref={heroRef} className="blueprint-grid-bg hero-vignette grain relative overflow-hidden border-b border-line-subtle">
          <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:py-24">
            <div className="space-y-7 lg:col-span-7">
              <div className="eyebrow inline-flex items-center gap-2 rounded-full border border-accent-cyan/40 bg-surface/80 px-3.5 py-1.5 backdrop-blur">
                <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                TX (IPC 2021) · CA (UPC 2024) · CO (IPC 2021)
              </div>

              <h1 className="text-hero text-ink-primary">
                Straight-code prep for Texas, California, and Colorado{" "}
                <span className="font-display text-[1.12em] font-normal italic tracking-[-0.01em] text-accent-amber">Journeyman Plumbers.</span>
              </h1>

              <p className="max-w-xl text-body text-ink-secondary">
                Edition-aware questions reviewed by licensed plumbers, deterministic pipe-sizing drills, an isometric drawing lab with explainable scoring, and plain-language mistake diagnosis — built to work offline.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={scrollToAuth} className="btn-primary w-full sm:w-auto">
                  Start Free Diagnostic
                  <ArrowDown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
                <Link href="/accuracy" className="btn-secondary w-full sm:w-auto">
                  <ShieldCheck className="h-4 w-4 text-accent-emerald" strokeWidth={1.75} aria-hidden="true" />
                  Public licensed-review ledger
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
                {jurisdictions.map((jur) => (
                  <div key={jur.id} className="rounded-xl border border-line-subtle bg-surface/80 p-3.5 shadow-1 backdrop-blur">
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-lg font-semibold text-accent-cyan">{jur.state}</span>
                      <span className="font-mono text-caption text-ink-secondary">{jur.code_family} {jur.edition}</span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold tabular-nums text-ink-primary">
                      {jur.question_count} Qs · {jur.time_limit_min}m · {jur.pass_pct}%
                    </p>
                    <p className="text-caption text-ink-secondary">{jur.open_book ? "Open book" : "Closed book"} · {jur.exam_vendor}</p>
                  </div>
                ))}
              </div>
            </div>

            <motion.div style={{ y: schematicY, scale: schematicScale, opacity: schematicOpacity }} className="lg:col-span-5">
              <div className="glass-surface relative overflow-hidden p-5">
                <div className="flex items-center justify-between border-b border-line-subtle pb-3">
                  <span className="eyebrow">Isometric riser · DWV-01</span>
                  <span className="rounded-full bg-accent-emerald/15 px-2.5 py-0.5 font-mono text-caption text-accent-emerald">¼ in/ft grade</span>
                </div>
                <div className="mt-3">
                  <IsoRiser still={still} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line-subtle pt-3 text-caption">
                  <div>
                    <span className="block text-ink-secondary">Readiness gate</span>
                    <span className="font-mono font-semibold tabular-nums text-ink-primary">15 / topic</span>
                  </div>
                  <div>
                    <span className="block text-ink-secondary">Topics</span>
                    <span className="font-mono font-semibold tabular-nums text-ink-primary">10 domains</span>
                  </div>
                  <div>
                    <span className="block text-ink-secondary">Offline</span>
                    <span className="font-mono font-semibold text-accent-emerald">Dexie + SW</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section aria-labelledby="benefits-heading" className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-6">
          <div className="space-y-2">
            <span className="eyebrow">Trade-Tested Workflow</span>
            <h2 id="benefits-heading" className="text-h1 text-ink-primary">
              Built like a field gauge, not a <span className="font-display text-[1.1em] font-normal italic">flashcard gimmick.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {BENEFITS.map(({ n, icon: Icon, tone, title, body }) => (
              <article key={n} className="bento-card space-y-3">
                <div className="flex items-center justify-between">
                  <div className={`icon-tile ${tone}`}>
                    <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <span className="font-mono text-caption text-ink-secondary">{n}</span>
                </div>
                <h3 className="text-h3 text-ink-primary">{title}</h3>
                <p className="text-sm leading-relaxed text-ink-secondary">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section ref={authRef} id="sign-in" className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-10 border-t border-line-subtle px-4 py-16 sm:px-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-6">
            <div className="space-y-2">
              <span className="eyebrow">Straight Answers (FAQ)</span>
              <h2 className="text-h1 text-ink-primary">Before you open the book</h2>
            </div>
            <div className="space-y-3">
              {FAQ.map(({ q, a }) => (
                <article key={q} className="rounded-xl border border-line-subtle bg-surface p-4 shadow-1">
                  <h3 className="text-base font-semibold text-ink-primary">{q}</h3>
                  <p className="mt-1 text-sm text-ink-secondary">{a}</p>
                </article>
              ))}
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
          <nav aria-label="Footer legal links" className="flex flex-wrap items-center gap-5">
            <Link href="/accuracy" className={FOOTER_LINK}>Public Accuracy Ledger</Link>
            <Link href="/account" className={FOOTER_LINK}>Account &amp; Billing</Link>
            <Link href="/legal/terms" className={FOOTER_LINK}>Terms of Service</Link>
            <Link href="/legal/privacy" className={FOOTER_LINK}>Privacy Policy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
