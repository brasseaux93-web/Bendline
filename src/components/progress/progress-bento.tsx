"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  Gauge,
  Layers,
  Lock,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { TopicPlumbingIcon } from "@/components/icons/plumbing-icons";
import { useGlobalModal } from "@/components/modals/global-modal-provider";
import { useAppState } from "@/components/providers/app-state-provider";
import { READINESS_MIN_ANSWERS_PER_TOPIC } from "@/lib/domain/metrics";
import type { ReadinessResult } from "@/lib/domain/types";
import { MOTION_VARIANTS } from "@/lib/motion";
import {
  computeChapterLookupMetrics,
  computeOverallNavMetrics,
  filterOutlineForJurisdiction,
  formatLookupMs,
  isNavigationTrainerEnabled,
} from "@/lib/nav";
import {
  computeDrawingLabProgress,
  computeMistakeProfile,
  computeMockTrend,
  computeTopicMasteryVsBlueprint,
  recomputeReadinessFromAttempts,
} from "@/lib/progress/analytics";

export function ProgressBento() {
  const {
    activeJurisdiction,
    topics,
    blueprints,
    attempts,
    mockSessions,
    outlineNodes,
    navAttempts,
    drawingExercises,
    drawingSubmissions,
  } = useAppState();
  const { openModal } = useGlobalModal();

  const localReadiness = recomputeReadinessFromAttempts(topics, attempts);
  const [serverReadiness, setServerReadiness] = useState<{
    readiness: ReadinessResult;
    source: string;
  } | null>(null);
  const [isRecomputing, setIsRecomputing] = useState<boolean>(false);

  const readiness = serverReadiness?.readiness ?? localReadiness;
  const topicVsBlueprint = computeTopicMasteryVsBlueprint(
    topics,
    blueprints,
    attempts,
    activeJurisdiction.id
  );
  const mockTrend = computeMockTrend(mockSessions, activeJurisdiction);
  const mistakeProfile = computeMistakeProfile(attempts, activeJurisdiction);

  const navEnabled = isNavigationTrainerEnabled(activeJurisdiction);
  const scopedOutline = filterOutlineForJurisdiction(
    outlineNodes,
    activeJurisdiction
  );
  const chapterLookupMetrics = computeChapterLookupMetrics(
    scopedOutline,
    navAttempts,
    activeJurisdiction.id
  );
  const overallNav = computeOverallNavMetrics(navAttempts, activeJurisdiction.id);
  const drawingProgress = computeDrawingLabProgress(
    drawingSubmissions,
    drawingExercises
  );

  async function handleRecomputeReadiness() {
    setIsRecomputing(true);
    try {
      const res = await fetch("/api/progress/readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempts }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          readiness: ReadinessResult;
          source: string;
        };
        setServerReadiness(data);
      }
    } catch {
      setServerReadiness({
        readiness: recomputeReadinessFromAttempts(topics, attempts),
        source: "offline_fallback",
      });
    } finally {
      setIsRecomputing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-caption uppercase tracking-wider text-accent-cyan">
            Performance Bento · {activeJurisdiction.state}{" "}
            {activeJurisdiction.code_family} {activeJurisdiction.edition}
          </span>
          <h1 className="text-h1 text-ink-primary">
            Readiness, Mistakes &amp; Diagnostic Progress
          </h1>
        </div>

        <button
          type="button"
          onClick={() => openModal("accuracy")}
          className="btn-secondary min-h-12 px-3.5 text-sm"
        >
          <ShieldCheck
            className="h-4 w-4 text-accent-emerald"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          Public Accuracy Ledger
        </button>
      </div>

      {/* Main 12-Col Bento Grid */}
      <motion.div
        variants={MOTION_VARIANTS.staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        {/* 1. Readiness Card (server-recomputable) */}
        <motion.article
          variants={MOTION_VARIANTS.bentoCard}
          aria-labelledby="progress-readiness-heading"
          className="bento-card flex flex-col justify-between gap-4 lg:col-span-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-caption uppercase tracking-wider text-ink-secondary">
                15 Verified Correct / Topic Gate
              </span>
              <h2
                id="progress-readiness-heading"
                className="text-h2 text-ink-primary"
              >
                Exam Readiness
              </h2>
            </div>
            <Gauge
              className="h-5 w-5 text-accent-cyan"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>

          <div className="flex items-baseline justify-between gap-3 rounded-xl border border-line-subtle bg-canvas/70 px-4 py-3 tabular-nums">
            {readiness.scorePct === null ? (
              <span className="inline-flex items-center gap-2 text-h1 text-ink-primary">
                <Lock
                  className="h-5 w-5 text-accent-amber"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Locked (<code className="font-mono text-base">null</code>)
              </span>
            ) : (
              <span className="text-hero text-accent-emerald">
                {readiness.scorePct}%
              </span>
            )}
            <span className="font-mono text-caption text-ink-secondary">
              {readiness.qualifiedTopicsCount}/{readiness.totalTopics} topics ready
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-caption text-ink-secondary">
              {serverReadiness
                ? `Verified via ${serverReadiness.source}`
                : `${readiness.totalAnswers} attempts evaluated`}
            </span>
            <button
              type="button"
              onClick={() => void handleRecomputeReadiness()}
              disabled={isRecomputing}
              className="btn-secondary min-h-10 px-3 text-caption"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRecomputing ? "animate-spin" : ""}`}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {isRecomputing ? "Recomputing..." : "Recompute Readiness"}
            </button>
          </div>
        </motion.article>

        {/* 2. Mock Exam Trend Card */}
        <motion.article
          variants={MOTION_VARIANTS.bentoCard}
          aria-labelledby="mock-trend-heading"
          className="bento-card flex flex-col justify-between gap-4 lg:col-span-7"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-caption uppercase tracking-wider text-ink-secondary">
                Jurisdiction Simulations · Pass {mockTrend.passPct}%
              </span>
              <h2 id="mock-trend-heading" className="text-h2 text-ink-primary">
                Mock Exam Trend
              </h2>
            </div>
            <TrendingUp
              className="h-5 w-5 text-accent-cyan"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>

          {mockTrend.points.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong bg-canvas/50 p-4">
              <p className="text-sm text-ink-secondary">
                No completed timed mocks yet for {activeJurisdiction.state}. Complete
                one simulation to plot score progression against the {mockTrend.passPct}% passing bar.
              </p>
              <Link href="/mock" className="btn-secondary min-h-12 px-3.5 text-sm">
                Launch Mock Exam
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-line-subtle bg-canvas/70 p-3 text-center tabular-nums">
                <div>
                  <span className="block text-caption text-ink-muted">Latest</span>
                  <strong className="font-mono text-h3 text-ink-primary">
                    {mockTrend.latestScorePct}%
                  </strong>
                </div>
                <div>
                  <span className="block text-caption text-ink-muted">Best</span>
                  <strong className="font-mono text-h3 text-accent-emerald">
                    {mockTrend.bestScorePct}%
                  </strong>
                </div>
                <div>
                  <span className="block text-caption text-ink-muted">Delta</span>
                  <strong className="font-mono text-h3 text-accent-cyan">
                    {mockTrend.latestDelta === null
                      ? "—"
                      : `${mockTrend.latestDelta >= 0 ? "+" : ""}${mockTrend.latestDelta}%`}
                  </strong>
                </div>
              </div>

              <div className="flex items-end gap-2 overflow-x-auto pt-1">
                {mockTrend.points.map((pt) => (
                  <div
                    key={pt.id}
                    className="flex min-w-14 flex-1 flex-col items-center gap-1"
                  >
                    <span className="font-mono text-caption tabular-nums text-ink-secondary">
                      {pt.scorePct}%
                    </span>
                    <div className="flex h-20 w-full items-end rounded-lg bg-canvas/80 p-1">
                      <div
                        className={`w-full rounded ${
                          pt.passed ? "bg-accent-emerald" : "bg-accent-amber"
                        }`}
                        style={{ height: `${Math.max(8, pt.scorePct)}%` }}
                      />
                    </div>
                    <span className="font-mono text-caption text-ink-muted">
                      #{pt.sessionNumber}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.article>

        {/* 3. Mistake Profile by error_type with "Fix this" CTAs */}
        <motion.section
          variants={MOTION_VARIANTS.bentoCard}
          aria-labelledby="mistake-profile-heading"
          className="bento-card space-y-4 lg:col-span-12"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <span className="text-caption uppercase tracking-wider text-accent-amber">
                Diagnostic Error Taxonomy
              </span>
              <h2
                id="mistake-profile-heading"
                className="text-h2 text-ink-primary"
              >
                Mistake Profile by <code className="font-mono text-lg">error_type</code>
              </h2>
            </div>
            <span className="font-mono tabular-nums text-caption text-ink-secondary">
              {mistakeProfile.totalTaggedMistakes} tagged misses across 6 failure modes
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mistakeProfile.items.map((item) => (
              <article
                key={item.errorType}
                data-testid={`mistake-card-${item.errorType}`}
                className={`flex flex-col justify-between gap-3 rounded-xl border p-3.5 ${
                  item.count > 0
                    ? "border-accent-amber/50 bg-elevated/70"
                    : "border-line-subtle bg-canvas/60"
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-caption font-semibold uppercase text-accent-cyan">
                      {item.errorType}
                    </span>
                    <span className="font-mono tabular-nums text-sm font-bold text-ink-primary">
                      {item.count} {item.count === 1 ? "miss" : "misses"}
                      {item.sharePct > 0 ? ` (${item.sharePct}%)` : ""}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-ink-primary">
                    {item.label}
                  </h3>
                  <p className="text-caption text-ink-secondary">
                    {item.shortDescription}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div
                      className="h-full rounded-full bg-accent-amber transition-[width] duration-300"
                      style={{ width: `${item.sharePct}%` }}
                    />
                  </div>
                  <Link
                    href={item.fixHref}
                    data-testid={`fix-error-${item.errorType}`}
                    className="btn-secondary min-h-11 w-full justify-between px-3 text-caption font-semibold"
                  >
                    <span>Fix this · {item.fixLabel}</span>
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </motion.section>

        {/* 4. Topic Mastery vs Jurisdiction Blueprint */}
        <motion.section
          variants={MOTION_VARIANTS.bentoCard}
          aria-labelledby="topic-blueprint-heading"
          className="bento-card space-y-4 lg:col-span-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
              <h2
                id="topic-blueprint-heading"
                className="text-h2 text-ink-primary"
              >
                Topic Mastery vs Blueprint
              </h2>
            </div>
            <span className="text-caption text-ink-secondary">
              Recency-weighted mastery vs {activeJurisdiction.state} exam weight
            </span>
          </div>

          <div className="space-y-2.5">
            {topicVsBlueprint.map((item) => {
              const gatePct = Math.min(
                100,
                Math.round((item.correct / READINESS_MIN_ANSWERS_PER_TOPIC) * 100)
              );
              return (
                <article
                  key={item.topic.id}
                  className="rounded-xl border border-line-subtle bg-canvas/60 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-elevated text-accent-cyan">
                        <TopicPlumbingIcon slug={item.topic.slug} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-ink-primary">
                          {item.topic.title}
                        </h3>
                        <p className="font-mono tabular-nums text-caption text-ink-secondary">
                          Mastery {item.masteryPct}% · Blueprint{" "}
                          {item.blueprintWeightPct}% · {item.correct}/
                          {READINESS_MIN_ANSWERS_PER_TOPIC} verified correct ({item.answered} answered)
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/practice?topic=${item.topic.slug}`}
                      className="btn-secondary min-h-10 shrink-0 px-3 text-caption"
                    >
                      Drill
                    </Link>
                  </div>

                  <div className="space-y-1">
                    <div className="h-2 overflow-hidden rounded-full bg-surface">
                      <div
                        className={`h-full rounded-full transition-[width] duration-300 ${
                          gatePct >= 100 ? "bg-accent-emerald" : "bg-accent-cyan"
                        }`}
                        style={{ width: `${item.masteryPct}%` }}
                      />
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-accent-amber/80 transition-[width] duration-300"
                        style={{ width: `${Math.min(100, item.blueprintWeightPct * 4)}%` }}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </motion.section>

        {/* Right Stack: 5. Isometric Drawing Lab Scores + 6. Nav-Lookup Speed */}
        <div className="space-y-4 lg:col-span-5">
          {/* 5. Drawing-Lab Scores */}
          <motion.section
            variants={MOTION_VARIANTS.bentoCard}
            aria-labelledby="drawing-scores-heading"
            className="bento-card space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-caption uppercase tracking-wider text-accent-cyan">
                  Isometric DWV &amp; Vent Lab
                </span>
                <h2
                  id="drawing-scores-heading"
                  className="text-h2 text-ink-primary"
                >
                  Drawing-Lab Scores
                </h2>
              </div>
              <Compass className="h-5 w-5 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
            </div>

            <dl className="grid grid-cols-3 gap-2 rounded-xl border border-line-subtle bg-canvas/70 p-3 text-center tabular-nums">
              <div>
                <dt className="text-caption text-ink-muted">Average</dt>
                <dd className="font-mono text-h3 text-ink-primary">
                  {drawingProgress.averageScorePct !== null
                    ? `${drawingProgress.averageScorePct}%`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Best</dt>
                <dd className="font-mono text-h3 text-accent-emerald">
                  {drawingProgress.bestScorePct !== null
                    ? `${drawingProgress.bestScorePct}%`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Runs</dt>
                <dd className="font-mono text-h3 text-ink-primary">
                  {drawingProgress.totalSubmissions}
                </dd>
              </div>
            </dl>

            {drawingProgress.recentSubmissions.length > 0 ? (
              <ul className="space-y-1.5">
                {drawingProgress.recentSubmissions.map((sub) => (
                  <li
                    key={sub.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-line-subtle bg-canvas/60 px-3 py-2 text-caption"
                  >
                    <span className="truncate font-medium text-ink-primary">
                      {sub.exerciseTitle}{" "}
                      <span className="font-mono uppercase text-ink-muted">
                        ({sub.mode})
                      </span>
                    </span>
                    <span className="shrink-0 font-mono font-semibold tabular-nums text-accent-emerald">
                      {sub.score}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-caption text-ink-secondary">
                Check or submit an isometric layout on{" "}
                <Link href="/draw" className="font-semibold text-accent-cyan hover:underline">
                  /draw
                </Link>{" "}
                to log deterministic rule scores here.
              </p>
            )}

            <Link href="/draw" className="btn-secondary w-full justify-between">
              <span className="inline-flex items-center gap-2">
                <Wrench className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
                Open Isometric Drawing Lab
              </span>
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </motion.section>

          {/* 6. Nav-Lookup Speed (Open-Book Only) */}
          <motion.section
            variants={MOTION_VARIANTS.bentoCard}
            aria-labelledby="lookup-speed-heading"
            className="bento-card space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-caption uppercase tracking-wider text-accent-cyan">
                  Open-Book Speed · {activeJurisdiction.code_family}{" "}
                  {activeJurisdiction.edition}
                </span>
                <h2 id="lookup-speed-heading" className="text-h2 text-ink-primary">
                  Median Lookup Time per Chapter
                </h2>
              </div>
              <Activity className="h-5 w-5 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
            </div>

            {!navEnabled ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-canvas/60 p-3">
                <div className="flex items-start gap-2.5">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-ink-primary">
                      Closed-Book Jurisdiction ({activeJurisdiction.state})
                    </p>
                    <p className="text-caption text-ink-secondary">
                      Open-book navigation timing unlocks when{" "}
                      <code className="font-mono">jurisdictions.open_book</code> is{" "}
                      <code className="font-mono">true</code>.
                    </p>
                  </div>
                </div>
                <Link href="/navigate" className="btn-secondary min-h-10 px-3 text-caption">
                  View Gate
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line-subtle bg-canvas/70 px-3.5 py-2 text-caption tabular-nums">
                  <span className="inline-flex items-center gap-1.5 text-ink-secondary">
                    <Clock className="h-3.5 w-3.5 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
                    Overall Median:{" "}
                    <strong className="text-ink-primary">
                      {formatLookupMs(overallNav.medianMs)}
                    </strong>
                  </span>
                  <span className="text-ink-secondary">
                    First-Try:{" "}
                    <strong className="text-accent-emerald">
                      {overallNav.firstTryAccuracyPct !== null
                        ? `${overallNav.firstTryAccuracyPct}%`
                        : "—"}
                    </strong>
                  </span>
                  <Link href="/navigate" className="font-semibold text-accent-cyan hover:underline">
                    Open Lab →
                  </Link>
                </div>

                <div className="space-y-2">
                  {chapterLookupMetrics.map((m) => (
                    <article
                      key={m.chapter.id}
                      data-testid={`chapter-lookup-card-${m.chapter.id}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-line-subtle bg-canvas/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-caption font-semibold text-accent-cyan">
                          {m.chapter.code_ref}
                        </span>
                        <h3 className="truncate text-sm font-semibold text-ink-primary">
                          {m.chapter.title}
                        </h3>
                        <p className="font-mono tabular-nums text-caption text-ink-secondary">
                          Median: {formatLookupMs(m.medianMs)} · First-try:{" "}
                          {m.firstTryAccuracyPct !== null
                            ? `${m.firstTryAccuracyPct}%`
                            : "—"}{" "}
                          · {m.totalAttempts}{" "}
                          {m.totalAttempts === 1 ? "drill" : "drills"}
                        </p>
                      </div>

                      <Link
                        href={`/navigate?chapter=${m.chapter.id}`}
                        className="btn-secondary min-h-10 shrink-0 px-3 text-caption"
                      >
                        Drill
                      </Link>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {navEnabled && (
              <Link href="/navigate" className="btn-secondary w-full justify-between">
                <span className="inline-flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-accent-emerald" strokeWidth={1.75} aria-hidden="true" />
                  Practice Open-Book Lookups
                </span>
                <CheckCircle2 className="h-4 w-4 text-accent-emerald" strokeWidth={1.75} aria-hidden="true" />
              </Link>
            )}
          </motion.section>
        </div>
      </motion.div>
    </div>
  );
}
