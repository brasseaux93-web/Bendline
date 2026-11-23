"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Flame,
  Gauge,
  Layers,
  Lock,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";
import { TopicPlumbingIcon } from "@/components/icons/plumbing-icons";
import { QuestionReviewBar } from "@/components/questions/question-review-bar";
import { useAppState } from "@/components/providers/app-state-provider";
import {
  READINESS_MIN_ANSWERS_PER_TOPIC,
  computeDaysToExam,
  computeDueReviewsCount,
  computeNextMockSummary,
  computeReadiness,
  computeStreakDays,
  computeTopicsOrderedByWeakness,
  computeWeakestTopic,
} from "@/lib/domain/metrics";
import type { TopicPerformance } from "@/lib/domain/types";
import {
  computeOverallNavMetrics,
  formatLookupMs,
  isNavigationTrainerEnabled,
} from "@/lib/nav";
import { MOTION_SPRING, MOTION_VARIANTS } from "@/lib/motion";

export function HomeBento() {
  const {
    activeJurisdiction,
    topics,
    questions,
    attempts,
    navAttempts,
    srsStates,
    mockSessions,
    profile,
    recordAttempt,
    completeSrsReview,
    updateExamDate,
  } = useAppState();

  const [activeDrillTopic, setActiveDrillTopic] =
    useState<TopicPerformance | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submittedResult, setSubmittedResult] = useState<boolean | null>(null);
  const [editingExamDate, setEditingExamDate] = useState<boolean>(false);
  const [examDateDraft, setExamDateDraft] = useState<string>(
    profile.exam_date ?? ""
  );

  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeDialogBtnRef = useRef<HTMLButtonElement | null>(null);

  const readiness = useMemo(
    () => computeReadiness(topics, attempts),
    [topics, attempts]
  );

  const orderedTopics = useMemo(
    () => computeTopicsOrderedByWeakness(topics, attempts),
    [topics, attempts]
  );

  const weakestTopic = useMemo(
    () => computeWeakestTopic(topics, attempts),
    [topics, attempts]
  );

  const dueReviewsCount = useMemo(
    () => computeDueReviewsCount(srsStates),
    [srsStates]
  );

  const streakDays = useMemo(
    () => computeStreakDays(attempts.map((a) => a.attempted_at)),
    [attempts]
  );

  const daysToExam = useMemo(
    () => computeDaysToExam(profile.exam_date),
    [profile.exam_date]
  );

  const nextMock = useMemo(
    () => computeNextMockSummary(activeJurisdiction, mockSessions),
    [activeJurisdiction, mockSessions]
  );

  const navEnabled = isNavigationTrainerEnabled(activeJurisdiction);
  const overallNavMetrics = useMemo(
    () => computeOverallNavMetrics(navAttempts, activeJurisdiction.id),
    [activeJurisdiction.id, navAttempts]
  );

  const activeDrillQuestion = useMemo(() => {
    if (!activeDrillTopic) return null;
    return (
      questions.find(
        (q) =>
          q.topic_id === activeDrillTopic.topic.id &&
          q.code_family === activeJurisdiction.code_family
      ) ??
      questions.find((q) => q.topic_id === activeDrillTopic.topic.id) ??
      questions[0] ??
      null
    );
  }, [activeDrillTopic, activeJurisdiction.code_family, questions]);

  // Keep activeDrillTopic synced when attempts update live
  const liveDrillTopic = useMemo(() => {
    if (!activeDrillTopic) return null;
    return (
      orderedTopics.find((t) => t.topic.id === activeDrillTopic.topic.id) ??
      activeDrillTopic
    );
  }, [activeDrillTopic, orderedTopics]);

  useEffect(() => {
    if (!activeDrillTopic) return;
    closeDialogBtnRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActiveDrillTopic(null);
        setSelectedOption(null);
        setSubmittedResult(null);
        lastTriggerRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDrillTopic]);

  function openTopicDrill(
    topicPerf: TopicPerformance,
    triggerEl: HTMLButtonElement | null
  ) {
    lastTriggerRef.current = triggerEl;
    setSelectedOption(null);
    setSubmittedResult(null);
    setActiveDrillTopic(topicPerf);
  }

  function closeTopicDrill() {
    setActiveDrillTopic(null);
    setSelectedOption(null);
    setSubmittedResult(null);
    lastTriggerRef.current?.focus();
  }

  async function handleDrillAnswer(optionIndex: number) {
    if (!activeDrillQuestion || !liveDrillTopic) return;
    const isCorrect = optionIndex === activeDrillQuestion.correct_index;
    setSelectedOption(optionIndex);
    setSubmittedResult(isCorrect);
    await recordAttempt({
      questionId: activeDrillQuestion.id,
      topicId: liveDrillTopic.topic.id,
      isCorrect,
      timeMs: 3800,
      mode: "practice",
    });
  }

  async function handleClearOneDueReview() {
    const dueCard = srsStates.find((s) => Date.parse(s.due_at) <= Date.now());
    if (dueCard) {
      await completeSrsReview(dueCard.question_id);
    }
  }

  async function handleSaveExamDate() {
    await updateExamDate(examDateDraft || null);
    setEditingExamDate(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption uppercase tracking-wider text-accent-cyan">
            Journeyman Workspace · {activeJurisdiction.name}
          </p>
          <h1 className="text-h1 text-ink-primary">Study Command Center</h1>
        </div>
        <p className="tabular-nums text-caption text-ink-secondary">
          {attempts.length} total answers logged
        </p>
      </div>

      <motion.div
        variants={MOTION_VARIANTS.staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12"
      >
        {/* 1. Readiness Card (null until 15 answers per topic) */}
        <motion.article
          variants={MOTION_VARIANTS.bentoCard}
          className="bento-card flex flex-col justify-between gap-4 lg:col-span-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-caption uppercase tracking-wider text-ink-secondary">
                Exam Readiness
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                {readiness.scorePct === null ? (
                  <span className="inline-flex items-center gap-2 text-h1 text-ink-primary">
                    <Lock
                      className="h-5 w-5 text-accent-amber"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    Locked
                  </span>
                ) : (
                  <span className="tabular-nums text-hero text-accent-emerald">
                    {readiness.scorePct}%
                  </span>
                )}
              </div>
            </div>
            <Gauge
              className="h-5 w-5 text-accent-cyan"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>

          <div className="space-y-2">
            {readiness.scorePct === null ? (
              <p className="text-sm text-ink-secondary">
                Score stays <code className="font-mono text-ink-primary">null</code> until you answer{" "}
                <strong className="tabular-nums text-ink-primary">
                  {READINESS_MIN_ANSWERS_PER_TOPIC}
                </strong>{" "}
                questions in all{" "}
                <strong className="tabular-nums text-ink-primary">
                  {readiness.totalTopics}
                </strong>{" "}
                topics.
              </p>
            ) : (
              <p className="text-sm text-ink-secondary">
                Qualified across all {readiness.totalTopics} licensing domains. Passing threshold for {activeJurisdiction.state}:{" "}
                <strong className="tabular-nums text-ink-primary">
                  {activeJurisdiction.pass_pct}%
                </strong>
                .
              </p>
            )}

            <div className="flex items-center justify-between text-caption text-ink-secondary tabular-nums">
              <span>Topics qualified</span>
              <span className="font-semibold text-ink-primary">
                {readiness.qualifiedTopicsCount} / {readiness.totalTopics}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-canvas">
              <div
                className="h-full rounded-full bg-accent-cyan transition-[width] duration-300"
                style={{
                  width: `${Math.round(
                    (readiness.qualifiedTopicsCount /
                      Math.max(1, readiness.totalTopics)) *
                      100
                  )}%`,
                }}
              />
            </div>
          </div>
        </motion.article>

        {/* 2. Weakest Topic Card (with plumbing icon + shared layoutId drill + sole primary action) */}
        <motion.article
          variants={MOTION_VARIANTS.bentoCard}
          layoutId={`topic-card-${weakestTopic.topic.slug}`}
          className="bento-card flex flex-col justify-between gap-4 border-accent-amber/40 lg:col-span-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent-amber/40 bg-accent-amber/10 text-accent-amber">
                <TopicPlumbingIcon
                  slug={weakestTopic.topic.slug}
                  className="h-6 w-6"
                />
              </span>
              <div>
                <span className="text-caption uppercase tracking-wider text-accent-amber">
                  {weakestTopic.answered > 0
                    ? "Weakest Topic"
                    : "Recommended First Topic"}
                </span>
                <h2 className="mt-0.5 text-h3 text-ink-primary">
                  {weakestTopic.topic.title}
                </h2>
              </div>
            </div>

            <span className="rounded-lg border border-line-subtle bg-canvas px-2.5 py-1 font-mono text-caption text-accent-cyan">
              {activeJurisdiction.code_family} {activeJurisdiction.edition}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm text-ink-secondary tabular-nums">
              <span>
                Accuracy:{" "}
                <strong className="text-ink-primary">
                  {weakestTopic.accuracyPct !== null
                    ? `${weakestTopic.accuracyPct}%`
                    : "No attempts"}
                </strong>
              </span>
              <span>
                Answered:{" "}
                <strong className="text-ink-primary">
                  {weakestTopic.answered}/{READINESS_MIN_ANSWERS_PER_TOPIC}
                </strong>
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => openTopicDrill(weakestTopic, e.currentTarget)}
              className="btn-primary w-full sm:w-auto"
            >
              Drill Weakest Topic
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </motion.article>

        {/* 3. Due Reviews + Streak + Days to Exam compact column */}
        <motion.div
          variants={MOTION_VARIANTS.bentoCard}
          className="grid grid-cols-1 gap-3 sm:col-span-2 lg:col-span-3"
        >
          <article className="bento-card flex items-center justify-between gap-3">
            <div>
              <span className="text-caption uppercase tracking-wider text-ink-secondary">
                Due Reviews
              </span>
              <p className="mt-1 tabular-nums text-h1 text-ink-primary">
                {dueReviewsCount}
              </p>
              <p className="text-caption text-ink-muted">
                SRS queue ready
              </p>
            </div>
            {dueReviewsCount > 0 ? (
              <button
                type="button"
                onClick={handleClearOneDueReview}
                className="btn-secondary min-h-12 px-3 text-sm"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Review 1
              </button>
            ) : (
              <span className="rounded-full border border-accent-emerald/40 bg-accent-emerald/10 px-2.5 py-1 text-caption text-accent-emerald">
                Caught up
              </span>
            )}
          </article>

          <div className="grid grid-cols-2 gap-3">
            <article className="bento-card flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-caption text-ink-secondary">Streak</span>
                <Flame
                  className="h-4 w-4 text-accent-amber"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </div>
              <p className="tabular-nums text-h1 text-ink-primary">
                {streakDays}d
              </p>
            </article>

            <article className="bento-card flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-caption text-ink-secondary">
                  Days to Exam
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setExamDateDraft(profile.exam_date ?? "");
                    setEditingExamDate((prev) => !prev);
                  }}
                  aria-label="Edit exam date"
                  className="rounded-lg p-1 text-accent-cyan hover:bg-elevated"
                >
                  <Calendar className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              <p className="tabular-nums text-h1 text-ink-primary">
                {daysToExam !== null ? `${daysToExam}d` : "—"}
              </p>
            </article>
          </div>

          {editingExamDate && (
            <div className="bento-card space-y-2 border-accent-cyan/50">
              <label
                htmlFor="home-exam-date-input"
                className="block text-caption text-ink-primary"
              >
                Target exam date
              </label>
              <div className="flex gap-2">
                <input
                  id="home-exam-date-input"
                  type="date"
                  value={examDateDraft}
                  onChange={(e) => setExamDateDraft(e.target.value)}
                  className="min-h-12 flex-1 rounded-xl border border-line-strong bg-elevated px-3 text-sm text-ink-primary"
                />
                <button
                  type="button"
                  onClick={handleSaveExamDate}
                  className="btn-secondary min-h-12 px-3 text-sm"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* 4. Signature "Isometric Drawing Lab" Card */}
        <motion.article
          variants={MOTION_VARIANTS.bentoCard}
          className="bento-card blueprint-grid-bg flex flex-col justify-between gap-4 border-accent-cyan/40 lg:col-span-7"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-cyan/40 bg-canvas/85 px-2.5 py-0.5 text-caption text-accent-cyan">
                <Compass className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                Signature Lab
              </span>
              <h2 className="text-h2 text-ink-primary">
                Isometric Drawing Lab
              </h2>
              <p className="max-w-lg text-sm text-ink-secondary">
                Practice routing DWV stacks, wet vents, and supply risers on a 30° isometric grid checked against {activeJurisdiction.code_family} {activeJurisdiction.edition} rules.
              </p>
            </div>

            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-accent-cyan/40 bg-canvas/90 text-accent-cyan">
              <TopicPlumbingIcon
                slug="isometric-math-special"
                className="h-7 w-7"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 font-mono text-caption text-ink-secondary">
              <span className="rounded-lg border border-line-subtle bg-canvas/85 px-2.5 py-1">
                DWV
              </span>
              <span className="rounded-lg border border-line-subtle bg-canvas/85 px-2.5 py-1">
                VENT
              </span>
              <span className="rounded-lg border border-line-subtle bg-canvas/85 px-2.5 py-1">
                SUPPLY
              </span>
            </div>

            <Link href="/draw" className="btn-secondary">
              Open Isometric Lab
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
        </motion.article>

        {/* 5. Next Mock Card */}
        <motion.article
          variants={MOTION_VARIANTS.bentoCard}
          className="bento-card flex flex-col justify-between gap-4 lg:col-span-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="text-caption uppercase tracking-wider text-ink-secondary">
                Next Mock Exam
              </span>
              <h2 className="text-h3 text-ink-primary">{nextMock.title}</h2>
            </div>
            <ClipboardCheck
              className="h-5 w-5 text-accent-cyan"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>

          <dl className="grid grid-cols-3 gap-2 rounded-xl border border-line-subtle bg-canvas/70 p-3 text-center tabular-nums">
            <div>
              <dt className="text-caption text-ink-muted">Questions</dt>
              <dd className="text-base font-semibold text-ink-primary">
                {nextMock.questionCount}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Timer</dt>
              <dd className="text-base font-semibold text-ink-primary">
                {nextMock.timeLimitMin}m
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Pass</dt>
              <dd className="text-base font-semibold text-accent-emerald">
                {nextMock.passPct}%
              </dd>
            </div>
          </dl>

          <div className="flex items-center justify-between gap-3">
            <span className="text-caption text-ink-secondary">
              {nextMock.openBook ? "Open-book rules apply" : "Closed-book exam"}
            </span>
            <Link href="/mock" className="btn-secondary">
              {nextMock.hasInProgressSession ? "Resume Mock" : "Configure Mock"}
            </Link>
          </div>
        </motion.article>

        {/* Open-Book Navigation Trainer Card (activeJurisdiction.open_book only) */}
        {navEnabled && (
          <motion.article
            variants={MOTION_VARIANTS.bentoCard}
            className="bento-card flex flex-wrap items-center justify-between gap-4 border-accent-emerald/40 sm:col-span-2 lg:col-span-12"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent-emerald/40 bg-accent-emerald/10 text-accent-emerald">
                <BookOpen className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="space-y-1">
                <span className="text-caption uppercase tracking-wider text-accent-emerald">
                  Open-Book Jurisdiction ({activeJurisdiction.state})
                </span>
                <h2 className="text-h3 text-ink-primary">
                  Code Lookup &amp; Tabbing Trainer
                </h2>
                <p className="font-mono text-caption tabular-nums text-ink-secondary">
                  Median lookup: {formatLookupMs(overallNavMetrics.medianMs)} ·
                  First-try accuracy:{" "}
                  {overallNavMetrics.firstTryAccuracyPct !== null
                    ? `${overallNavMetrics.firstTryAccuracyPct}%`
                    : "—"}
                </p>
              </div>
            </div>

            <Link href="/navigate" className="btn-secondary">
              Open Navigation Lab
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </motion.article>
        )}

        {/* 6. Topic Priority Strip with Motion Layout Reordering */}
        <motion.section
          variants={MOTION_VARIANTS.bentoCard}
          aria-labelledby="topic-priority-heading"
          className="bento-card space-y-3 sm:col-span-2 lg:col-span-12"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers
                className="h-4 w-4 text-accent-cyan"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <h2 id="topic-priority-heading" className="text-h3 text-ink-primary">
                Priority Topic Order
              </h2>
            </div>
            <span className="text-caption text-ink-secondary">
              Reorders automatically as your weakest topic shifts
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {orderedTopics.slice(0, 5).map((item, idx) => (
              <motion.button
                key={item.topic.id}
                layout
                type="button"
                transition={MOTION_SPRING.layout}
                onClick={(e) => openTopicDrill(item, e.currentTarget)}
                className={`flex min-h-16 flex-col justify-between gap-2 rounded-xl border p-3 text-left transition-colors ${
                  idx === 0
                    ? "border-accent-amber/50 bg-elevated/90"
                    : "border-line-subtle bg-canvas/70 hover:border-line-strong"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-accent-cyan">
                    <TopicPlumbingIcon
                      slug={item.topic.slug}
                      className="h-4 w-4"
                    />
                  </span>
                  <span className="tabular-nums text-caption text-ink-secondary">
                    {item.accuracyPct !== null ? `${item.accuracyPct}%` : "New"}
                  </span>
                </div>
                <div>
                  <p className="line-clamp-2 text-sm font-medium text-ink-primary">
                    {item.topic.title}
                  </p>
                  <p className="mt-0.5 tabular-nums text-caption text-ink-muted">
                    {item.answered}/{READINESS_MIN_ANSWERS_PER_TOPIC} answered
                  </p>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.section>
      </motion.div>

      {/* Shared layoutId Topic Drill Dialog */}
      <AnimatePresence>
        {liveDrillTopic && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              variants={MOTION_VARIANTS.overlayFade}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={closeTopicDrill}
              className="fixed inset-0 bg-canvas/80 backdrop-blur-sm"
              aria-hidden="true"
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="topic-drill-dialog-title"
              layoutId={`topic-card-${liveDrillTopic.topic.slug}`}
              transition={MOTION_SPRING.gentle}
              className="bento-card relative z-10 w-full max-w-xl space-y-4 border-accent-cyan/50 bg-surface p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent-cyan/40 bg-elevated text-accent-cyan">
                    <TopicPlumbingIcon
                      slug={liveDrillTopic.topic.slug}
                      className="h-5 w-5"
                    />
                  </span>
                  <div>
                    <span className="text-caption uppercase tracking-wider text-accent-cyan">
                      Topic Drill · {activeJurisdiction.code_family}{" "}
                      {activeJurisdiction.edition}
                    </span>
                    <h2
                      id="topic-drill-dialog-title"
                      className="text-h2 text-ink-primary"
                    >
                      {liveDrillTopic.topic.title}
                    </h2>
                  </div>
                </div>

                <button
                  ref={closeDialogBtnRef}
                  type="button"
                  onClick={closeTopicDrill}
                  aria-label="Close topic drill"
                  className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-line-strong bg-elevated text-ink-secondary hover:text-ink-primary"
                >
                  <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line-subtle bg-canvas/70 px-3.5 py-2 text-sm tabular-nums text-ink-secondary">
                <span>
                  Topic answers:{" "}
                  <strong className="text-ink-primary">
                    {liveDrillTopic.answered}/{READINESS_MIN_ANSWERS_PER_TOPIC}
                  </strong>
                </span>
                <span>
                  Accuracy:{" "}
                  <strong className="text-ink-primary">
                    {liveDrillTopic.accuracyPct !== null
                      ? `${liveDrillTopic.accuracyPct}%`
                      : "—"}
                  </strong>
                </span>
              </div>

              {activeDrillQuestion && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-caption text-ink-muted">
                    <span className="font-mono">{activeDrillQuestion.code_ref}</span>
                    <span className="uppercase">{activeDrillQuestion.type}</span>
                  </div>
                  <p className="text-body font-medium text-ink-primary">
                    {activeDrillQuestion.stem}
                  </p>

                  <div className="space-y-2">
                    {activeDrillQuestion.options.map((opt, idx) => {
                      const isChosen = selectedOption === idx;
                      const isAnswer = idx === activeDrillQuestion.correct_index;
                      let optionStyle =
                        "border-line-strong/80 bg-canvas/60 hover:border-accent-cyan";
                      if (submittedResult !== null) {
                        if (isAnswer) {
                          optionStyle =
                            "border-accent-emerald bg-accent-emerald/15";
                        } else if (isChosen) {
                          optionStyle =
                            "border-accent-crimson bg-accent-crimson/15";
                        }
                      }

                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleDrillAnswer(idx)}
                          className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left text-sm text-ink-primary transition-colors ${optionStyle}`}
                        >
                          <span>{opt}</span>
                          {submittedResult !== null && isAnswer && (
                            <CheckCircle2
                              className="h-4 w-4 shrink-0 text-accent-emerald"
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          )}
                          {submittedResult !== null &&
                            isChosen &&
                            !isAnswer && (
                              <XCircle
                                className="h-4 w-4 shrink-0 text-accent-crimson"
                                strokeWidth={1.75}
                                aria-hidden="true"
                              />
                            )}
                        </button>
                      );
                    })}
                  </div>

                  {submittedResult !== null && (
                    <div
                      role="status"
                      className="rounded-xl border border-line-subtle bg-canvas/80 p-3.5 text-sm text-ink-secondary"
                    >
                      <p className="font-semibold text-ink-primary">
                        {submittedResult ? "Correct — logged to topic mastery." : "Missed — queued for SRS review."}
                      </p>
                      <p className="mt-1">{activeDrillQuestion.explanation_seed}</p>
                      <p className="mt-2 text-caption text-ink-muted">
                        Verify against your adopted code. Not legal advice.
                      </p>
                    </div>
                  )}

                  <QuestionReviewBar
                    questionId={activeDrillQuestion.id}
                    reviewedAt={activeDrillQuestion.reviewed_at}
                    codeFamily={activeDrillQuestion.code_family}
                    edition={activeDrillQuestion.edition}
                    codeRef={activeDrillQuestion.code_ref}
                    compact
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-3">
                <button
                  type="button"
                  onClick={closeTopicDrill}
                  className="btn-secondary"
                >
                  Back to Home
                </button>
                <Link
                  href={`/practice?topic=${liveDrillTopic.topic.slug}`}
                  className="btn-primary"
                >
                  Full Topic Session
                  <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
