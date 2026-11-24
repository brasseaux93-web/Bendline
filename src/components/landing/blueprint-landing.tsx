"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import {
  Activity,
  ArrowRight,
  Calculator,
  Compass,
  Plus,
  WifiOff,
} from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { useGlobalModal } from "@/components/modals/global-modal-provider";
import { useAppState } from "@/components/providers/app-state-provider";
import { ThemeToggleButton } from "@/components/shell/theme-toggle";
import { AFFILIATION_DISCLAIMER } from "@/lib/legal/constants";

const FAQ_ITEMS = [
  {
    question: "Is this affiliated with my state board?",
    answer: `No. ${AFFILIATION_DISCLAIMER} Bendline is an independent exam-prep workspace using originally authored questions, calculators, and paraphrases. Always verify rules against your adopted code book and state bulletin.`,
  },
  {
    question: "Why doesn't Bendline advertise a pass-rate guarantee?",
    answer:
      "Passing depends on knowing your state's adopted code and timing under pressure — not marketing slogans. Bendline locks your readiness score until you log at least 15 verified correct answers in each of the 10 exam domains.",
  },
  {
    question: "Can I start a diagnostic offline on the job site?",
    answer:
      "Yes. Your authenticated session, active jurisdiction pack, calculators, and drawing drafts save locally on your device and sync automatically the moment you have signal.",
  },
] as const;

export function BlueprintLanding() {
  const heroRef = useRef<HTMLDivElement | null>(null);
  const authRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const { jurisdictions, reduceMotion, toggleReduceMotion } = useAppState();
  const { openModal } = useGlobalModal();
  const disableParallax = Boolean(prefersReducedMotion || reduceMotion);

  const [selectedJurisdictionId, setSelectedJurisdictionId] = useState<string>(
    () => jurisdictions[0]?.id ?? ""
  );
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const activeSelectionId = jurisdictions.some(
    (j) => j.id === selectedJurisdictionId
  )
    ? selectedJurisdictionId
    : (jurisdictions[0]?.id ?? "");

  const activeSelectionState =
    jurisdictions.find((j) => j.id === activeSelectionId)?.state ?? "TX";

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const schematicY = useTransform(
    scrollYProgress,
    [0, 1],
    disableParallax ? [0, 0] : [0, -24]
  );
  const schematicScale = useTransform(
    scrollYProgress,
    [0, 1],
    disableParallax ? [1, 1] : [1, 0.97]
  );
  const schematicOpacity = useTransform(
    scrollYProgress,
    [0, 1],
    disableParallax ? [1, 1] : [1, 0.72]
  );

  function scrollToAuth() {
    authRef.current?.scrollIntoView({
      behavior: disableParallax ? "auto" : "smooth",
    });
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink-primary">
      <header className="sticky top-0 z-30 border-b border-ink/[0.08] bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="inline-flex min-h-[44px] min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent-cyan/40 bg-card font-mono text-sm font-bold text-accent-cyan">
              B
            </span>
            <span className="truncate text-base font-semibold tracking-tight text-ink-primary">
              Bendline
            </span>
          </Link>

          <nav
            aria-label="Primary utilities"
            className="flex shrink-0 items-center gap-1 sm:gap-2"
          >
            <button
              type="button"
              onClick={() => openModal("accuracy")}
              className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-ink-secondary transition-colors hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              Accuracy
            </button>
            <button
              type="button"
              onClick={scrollToAuth}
              className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-ink-secondary transition-colors hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              Sign in
            </button>
            <ThemeToggleButton variant="icon" />
            <button
              type="button"
              onClick={toggleReduceMotion}
              aria-label="Toggle reduced motion"
              title={
                reduceMotion
                  ? "Reduced motion active — click to restore motion"
                  : "Reduce motion"
              }
              aria-pressed={reduceMotion}
              className={`inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan ${
                reduceMotion
                  ? "bg-accent-cyan/10 text-accent-cyan"
                  : "text-ink-secondary hover:text-ink-primary"
              }`}
            >
              <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </nav>
        </div>
      </header>

      <main>
        <section
          ref={heroRef}
          className="relative overflow-hidden border-b border-ink/[0.08] bg-canvas"
        >
          <div
            aria-hidden="true"
            className="blueprint-grid-masked pointer-events-none absolute inset-0"
          />

          <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:py-24">
            <div className="min-w-0 space-y-7 lg:col-span-7">
              <div className="space-y-4">
                <h1 className="max-w-[24ch] text-[clamp(2.25rem,4.1vw,3.35rem)] font-bold leading-[1.06] tracking-[-0.03em] text-ink-primary">
                  Journeyman plumber exam prep, built to code.
                </h1>

                <p className="max-w-xl text-base leading-relaxed text-ink-secondary sm:text-lg">
                  Edition-aware drills, deterministic pipe-sizing math, and an interactive isometric lab—built to run offline.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-5">
                <Link
                  href={`/diagnostic?state=${activeSelectionState}`}
                  className="btn-primary"
                >
                  Start Free Diagnostic
                  <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => openModal("accuracy")}
                  className="inline-flex min-h-[44px] items-center text-sm font-medium text-ink-secondary transition-colors hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
                >
                  Public licensed-review ledger &rarr;
                </button>
              </div>

              <div
                role="group"
                aria-label="Supported exam jurisdictions"
                className="grid grid-cols-1 divide-y divide-ink/[0.08] overflow-hidden rounded-xl border border-ink/[0.08] bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0"
              >
                {jurisdictions.map((jur) => {
                  const isActive = jur.id === activeSelectionId;
                  return (
                    <button
                      key={jur.id}
                      type="button"
                      onClick={() => setSelectedJurisdictionId(jur.id)}
                      aria-pressed={isActive}
                      className={`relative min-w-0 w-full px-4 py-4 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-cyan ${
                        isActive ? "bg-elevated/70" : ""
                      }`}
                    >
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 top-0 h-[2px] bg-accent-cyan"
                        />
                      )}
                      <div className="flex min-w-0 items-baseline justify-between gap-2">
                        <span
                          className={`font-mono text-sm font-bold tracking-tight ${
                            isActive ? "text-accent-cyan" : "text-ink-primary"
                          }`}
                        >
                          {jur.state}
                        </span>
                        <span className="truncate font-mono text-xs tabular-nums text-ink-secondary">
                          {jur.code_family} {jur.edition}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-nowrap font-mono text-xs font-medium tabular-nums text-ink-primary">
                        {jur.question_count} Qs · {jur.time_limit_min}m · {jur.pass_pct}%
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {jur.open_book ? "Open book" : "Closed book"} · {jur.exam_vendor}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <motion.div
              style={{
                y: schematicY,
                scale: schematicScale,
                opacity: schematicOpacity,
              }}
              className="min-w-0 lg:col-span-5"
            >
              <div className="relative overflow-hidden rounded-2xl border border-ink/[0.08] bg-card/90 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <div className="flex min-w-0 items-center justify-between gap-3 border-b border-ink/[0.08] pb-3">
                  <span className="truncate font-mono text-xs tracking-wider text-accent-cyan">
                    ISOMETRIC RISER · DWV-01
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums text-ink-secondary">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-accent-amber"
                      aria-hidden="true"
                    />
                    1/4 in/ft grade
                  </span>
                </div>

                <svg
                  viewBox="0 0 460 320"
                  className="mt-4 block h-auto w-full"
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
                        r="0.9"
                        fill="rgb(var(--accent) / 0.16)"
                      />
                    </pattern>
                    <radialGradient id="vent-glow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.16" />
                      <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id="drain-glow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="rgb(var(--primary))" stopOpacity="0.16" />
                      <stop offset="100%" stopColor="rgb(var(--primary))" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  <rect width="460" height="320" fill="url(#iso-dots)" rx="12" />

                  {/* Subtle radial highlights behind key pipe intersections */}
                  <circle cx="195" cy="152" r="70" fill="url(#vent-glow)" />
                  <circle cx="258" cy="196" r="78" fill="url(#drain-glow)" />

                  {/* Dry Vent Stack (Cyan) */}
                  <path
                    d="M 195 50 V 144"
                    stroke="rgb(var(--accent))"
                    strokeWidth="4.5"
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                    fill="none"
                  />

                  {/* Upper Vent Header Tie-in (Cyan) */}
                  <path
                    d="M 265 92 L 195 132"
                    stroke="rgb(var(--accent))"
                    strokeWidth="3.5"
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    fill="none"
                  />

                  {/* Wet Vent Stack (Cyan) */}
                  <path
                    d="M 195 144 V 245"
                    stroke="rgb(var(--accent))"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    fill="none"
                  />

                  {/* Lavatory Trap Arm (Cyan) */}
                  <path
                    d="M 195 148 L 152 123"
                    stroke="rgb(var(--accent))"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />

                  {/* Main Soil Stack + Long-Sweep Sanitary Elbow + 3" Building Drain (Amber) */}
                  <path
                    d="M 265 92 V 188 Q 265 204 251 212 L 145 273"
                    stroke="rgb(var(--primary))"
                    strokeWidth="5.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />

                  {/* WC 3" Branch with Closet Sweep (Amber) */}
                  <path
                    d="M 325 140 V 150 Q 325 158 318 162 L 265 192"
                    stroke="rgb(var(--primary))"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />

                  {/* Geometric Fitting Hubs & Ports */}
                  <circle
                    cx="195"
                    cy="50"
                    r="5.5"
                    fill="rgb(var(--card))"
                    stroke="rgb(var(--accent))"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="152"
                    cy="123"
                    r="5"
                    fill="rgb(var(--card))"
                    stroke="rgb(var(--accent))"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="195"
                    cy="148"
                    r="4.5"
                    fill="rgb(var(--accent))"
                  />
                  <circle
                    cx="195"
                    cy="245"
                    r="4.5"
                    fill="rgb(var(--primary))"
                    stroke="rgb(var(--card))"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="265"
                    cy="192"
                    r="5"
                    fill="rgb(var(--primary))"
                    stroke="rgb(var(--card))"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="325"
                    cy="140"
                    r="5.5"
                    fill="rgb(var(--card))"
                    stroke="rgb(var(--primary))"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="145"
                    cy="273"
                    r="4.5"
                    fill="rgb(var(--primary))"
                  />

                  {/* CAD 45-degree Leader Lines & Anchor Dots */}
                  <g>
                    <path
                      d="M 195 60 L 165 30 L 108 30"
                      stroke="rgb(var(--ink) / 0.35)"
                      strokeWidth="1"
                      fill="none"
                    />
                    <circle cx="195" cy="60" r="2.5" fill="rgb(var(--accent))" />
                    <text
                      x="102"
                      y="34"
                      textAnchor="end"
                      fill="rgb(var(--accent))"
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      letterSpacing="0.04em"
                    >
                      VTR 2&quot;
                    </text>

                    <path
                      d="M 195 186 L 169 160 L 122 160"
                      stroke="rgb(var(--ink) / 0.35)"
                      strokeWidth="1"
                      fill="none"
                    />
                    <circle cx="195" cy="186" r="2.5" fill="rgb(var(--accent))" />
                    <text
                      x="116"
                      y="164"
                      textAnchor="end"
                      fill="rgb(var(--ink))"
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      letterSpacing="0.04em"
                    >
                      LAV WET VENT
                    </text>

                    <path
                      d="M 312 165 L 348 129 L 386 129"
                      stroke="rgb(var(--ink) / 0.35)"
                      strokeWidth="1"
                      fill="none"
                    />
                    <circle cx="312" cy="165" r="2.5" fill="rgb(var(--primary))" />
                    <text
                      x="392"
                      y="133"
                      textAnchor="start"
                      fill="rgb(var(--ink))"
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      letterSpacing="0.04em"
                    >
                      WC 3&quot;
                    </text>

                    <path
                      d="M 225 227 L 265 267 L 316 267"
                      stroke="rgb(var(--ink) / 0.35)"
                      strokeWidth="1"
                      fill="none"
                    />
                    <circle cx="225" cy="227" r="2.5" fill="rgb(var(--primary))" />
                    <text
                      x="322"
                      y="271"
                      textAnchor="start"
                      fill="rgb(var(--primary))"
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      letterSpacing="0.04em"
                    >
                      BLDG DRAIN 3&quot;
                    </text>
                  </g>
                </svg>

                <div className="mt-4 grid grid-cols-3 divide-x divide-ink/[0.08] border-t border-ink/[0.08] pt-3.5 text-xs">
                  <div className="min-w-0 pr-2">
                    <span className="block truncate text-ink-muted">Readiness gate</span>
                    <span className="font-mono font-semibold tabular-nums text-ink-primary">
                      15 / topic
                    </span>
                  </div>
                  <div className="min-w-0 px-3">
                    <span className="block truncate text-ink-muted">Topics</span>
                    <span className="font-mono font-semibold tabular-nums text-ink-primary">
                      10 domains
                    </span>
                  </div>
                  <div className="min-w-0 pl-3">
                    <span className="block truncate text-ink-muted">Offline</span>
                    <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-accent-cyan">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-accent-cyan"
                        aria-hidden="true"
                      />
                      Ready
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
          className="mx-auto max-w-6xl space-y-6 px-4 py-14 sm:px-6 sm:py-16"
        >
          <div className="space-y-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-accent-cyan">
              Trade-Tested Workflow
            </span>
            <h2 id="benefits-heading" className="text-h1 text-ink-primary">
              Built like a field gauge, not a flashcard gimmick
            </h2>
          </div>

          <div className="grid grid-cols-1 divide-y divide-ink/[0.08] overflow-hidden rounded-2xl border border-ink/[0.08] bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
            <article className="min-w-0 space-y-3 p-6">
              <Calculator
                className="h-5 w-5 text-accent-cyan"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <h3 className="text-h3 text-ink-primary">
                Deterministic Math &amp; Plain-Language Diagnosis
              </h3>
              <p className="text-sm leading-relaxed text-ink-secondary">
                Every DFU, WSFU, drain, vent, and gas-line drill is computed deterministically from verified tables for your state&apos;s edition — and every miss is tagged clearly as concept, lookup, arithmetic, misread, edition confusion, or unit error.
              </p>
            </article>

            <article className="min-w-0 space-y-3 p-6">
              <Compass
                className="h-5 w-5 text-accent-amber"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <h3 className="text-h3 text-ink-primary">
                Isometric Pipe Lab with Explainable Scoring
              </h3>
              <p className="text-sm leading-relaxed text-ink-secondary">
                Lay out traps, wet vents, fittings, slope arrows, and cleanouts by touch, keyboard, or structured list view. Rule-based scoring flags exact offending nodes against verified code rules.
              </p>
            </article>

            <article className="min-w-0 space-y-3 p-6">
              <WifiOff
                className="h-5 w-5 text-accent-cyan"
                strokeWidth={1.75}
                aria-hidden="true"
              />
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
          className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-10 border-t border-ink/[0.08] px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-12"
        >
          <div className="min-w-0 space-y-6 lg:col-span-6">
            <div className="space-y-1.5">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-accent-cyan">
                Straight Answers
              </span>
              <h2 className="text-h1 text-ink-primary">
                Before you open the book
              </h2>
            </div>

            <div className="divide-y divide-ink/[0.08] border-y border-ink/[0.08]">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaqIndex === idx;
                const triggerId = `faq-trigger-${idx}`;
                const panelId = `faq-panel-${idx}`;

                return (
                  <div key={item.question} className="py-1">
                    <h3 className="text-base font-medium text-ink-primary">
                      <button
                        id={triggerId}
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() =>
                          setOpenFaqIndex((prev) => (prev === idx ? null : idx))
                        }
                        className="flex min-h-[48px] w-full items-center justify-between gap-4 py-3 text-left transition-colors hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
                      >
                        <span className="min-w-0 font-semibold text-ink-primary">
                          {item.question}
                        </span>
                        <Plus
                          className={`h-4 w-4 shrink-0 text-ink-secondary transition-transform duration-200 ${
                            isOpen ? "rotate-45 text-accent-cyan" : ""
                          }`}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                      </button>
                    </h3>
                    {isOpen && (
                      <div
                        id={panelId}
                        role="region"
                        aria-labelledby={triggerId}
                        className="pb-4 pr-8 text-sm leading-relaxed text-ink-secondary"
                      >
                        {item.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 lg:col-span-6">
            <AuthCard primarySubmit={false} />
          </div>
        </section>
      </main>

      <footer className="border-t border-ink/[0.08] bg-canvas px-4 py-8 text-xs text-ink-secondary sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <span className="min-w-0">{AFFILIATION_DISCLAIMER}</span>
          <nav
            aria-label="Footer legal links"
            className="flex flex-wrap items-center gap-5"
          >
            <button
              type="button"
              onClick={() => openModal("accuracy")}
              className="inline-flex min-h-[44px] items-center text-ink-secondary transition-colors hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              Public Accuracy Ledger
            </button>
            <button
              type="button"
              onClick={() => openModal("account")}
              className="inline-flex min-h-[44px] items-center text-ink-secondary transition-colors hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              Account &amp; Billing
            </button>
            <button
              type="button"
              onClick={() => openModal("terms")}
              className="inline-flex min-h-[44px] items-center text-ink-secondary transition-colors hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => openModal("privacy")}
              className="inline-flex min-h-[44px] items-center text-ink-secondary transition-colors hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              Privacy Policy
            </button>
          </nav>
        </div>
      </footer>
    </div>
  );
}
