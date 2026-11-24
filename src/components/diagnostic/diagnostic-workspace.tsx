"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { TopicPlumbingIcon } from "@/components/icons/plumbing-icons";
import { useGlobalModal } from "@/components/modals/global-modal-provider";
import { RadioCard } from "@/components/practice/radio-card";
import { useAppState } from "@/components/providers/app-state-provider";
import { ThemeToggleButton } from "@/components/shell/theme-toggle";
import {
  computeDiagnosticSummary,
  loadAnonymousDiagnostic,
  saveAnonymousDiagnostic,
  selectDiagnosticQuestions,
  type AnonymousDiagnosticState,
  type DiagnosticAnswerRecord,
} from "@/lib/diagnostic";
import { READINESS_MIN_CORRECT_PER_TOPIC } from "@/lib/domain/metrics";
import type { AiErrorType, Jurisdiction } from "@/lib/domain/types";
import { questionSwap } from "@/lib/motion";
import {
  AI_ERROR_TYPES,
  ERROR_TYPE_META,
  formatQuestionReviewStamp,
  inferAttemptErrorType,
} from "@/lib/progress/analytics";
import { generateUuid } from "@/lib/utils";

function formatTimer(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function DiagnosticWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stateParam = (searchParams.get("state") ?? "").toUpperCase();

  const {
    isHydrated,
    authMode,
    jurisdictions,
    topics,
    questions,
    reduceMotion,
    toggleReduceMotion,
  } = useAppState();
  const { openModal } = useGlobalModal();

  const resolvedJurisdiction: Jurisdiction = useMemo(() => {
    return (
      jurisdictions.find((j) => j.state === stateParam) ?? jurisdictions[0]
    );
  }, [jurisdictions, stateParam]);

  const [session, setSession] = useState<AnonymousDiagnosticState | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [revealedAnswer, setRevealedAnswer] =
    useState<DiagnosticAnswerRecord | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const questionStartRef = useRef<number>(Date.now());

  const createFreshSession = (jur: Jurisdiction): AnonymousDiagnosticState => {
    const picked = selectDiagnosticQuestions(jur, topics, questions, 10);
    return {
      session_id: generateUuid(),
      jurisdiction_id: jur.id,
      question_ids: picked.map((q) => q.id),
      current_index: 0,
      answers: [],
      elapsed_ms: 0,
      started_at: new Date().toISOString(),
      completed_at: null,
      migrated_at: null,
    };
  };

  // Load or initialize anonymous diagnostic session
  useEffect(() => {
    if (!isHydrated) return;
    const saved = loadAnonymousDiagnostic();
    if (
      saved &&
      saved.jurisdiction_id === resolvedJurisdiction.id &&
      saved.question_ids.length > 0 &&
      !saved.migrated_at
    ) {
      setSession(saved);
      setElapsedMs(saved.elapsed_ms);
      const currentQId = saved.question_ids[saved.current_index];
      const existingAns = currentQId
        ? saved.answers.find((a) => a.question_id === currentQId) ?? null
        : null;
      if (existingAns) {
        setSelectedOption(existingAns.selected_index);
        setRevealedAnswer(existingAns);
      } else {
        setSelectedOption(null);
        setRevealedAnswer(null);
      }
      questionStartRef.current = Date.now();
      return;
    }

    const fresh = createFreshSession(resolvedJurisdiction);
    saveAnonymousDiagnostic(fresh);
    setSession(fresh);
    setElapsedMs(0);
    setSelectedOption(null);
    setRevealedAnswer(null);
    questionStartRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, resolvedJurisdiction.id]);

  // Live timer while diagnostic is in progress
  useEffect(() => {
    if (!session || session.completed_at) return;
    const id = window.setInterval(() => {
      setElapsedMs((prev) => prev + 1000);
    }, 1000);
    return () => window.clearInterval(id);
  }, [session?.session_id, session?.completed_at]);

  const questionsById = useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions]
  );

  const currentQuestion = useMemo(() => {
    if (!session || session.completed_at) return null;
    const qid = session.question_ids[session.current_index];
    return qid ? questionsById.get(qid) ?? null : null;
  }, [questionsById, session]);

  const currentTopic = useMemo(() => {
    if (!currentQuestion) return null;
    return topics.find((t) => t.id === currentQuestion.topic_id) ?? null;
  }, [currentQuestion, topics]);

  const summary = useMemo(() => {
    if (!session) return null;
    return computeDiagnosticSummary(session, topics, resolvedJurisdiction);
  }, [resolvedJurisdiction, session, topics]);

  function handleSelectJurisdiction(jur: Jurisdiction) {
    router.replace(`/diagnostic?state=${jur.state}`);
    const fresh = createFreshSession(jur);
    saveAnonymousDiagnostic(fresh);
    setSession(fresh);
    setElapsedMs(0);
    setSelectedOption(null);
    setRevealedAnswer(null);
    questionStartRef.current = Date.now();
  }

  function handleCheckAnswer() {
    if (!session || !currentQuestion || selectedOption === null || revealedAnswer) {
      return;
    }

    const timeSpent = Math.max(500, Date.now() - questionStartRef.current);
    const isCorrect = selectedOption === currentQuestion.correct_index;
    const inferredError: AiErrorType | null = isCorrect
      ? null
      : inferAttemptErrorType(currentQuestion, timeSpent);

    const record: DiagnosticAnswerRecord = {
      id: generateUuid(),
      question_id: currentQuestion.id,
      topic_id: currentQuestion.topic_id,
      selected_index: selectedOption,
      is_correct: isCorrect,
      time_ms: timeSpent,
      error_type: inferredError,
      answered_at: new Date().toISOString(),
    };

    const nextAnswers = [
      ...session.answers.filter((a) => a.question_id !== currentQuestion.id),
      record,
    ];
    const nextSession: AnonymousDiagnosticState = {
      ...session,
      answers: nextAnswers,
      elapsed_ms: elapsedMs,
    };

    saveAnonymousDiagnostic(nextSession);
    setSession(nextSession);
    setRevealedAnswer(record);
  }

  function handleUpdateErrorTag(tag: AiErrorType) {
    if (!session || !revealedAnswer || revealedAnswer.is_correct) return;
    const updatedAnswer: DiagnosticAnswerRecord = {
      ...revealedAnswer,
      error_type: tag,
    };
    const nextSession: AnonymousDiagnosticState = {
      ...session,
      answers: session.answers.map((a) =>
        a.id === updatedAnswer.id ? updatedAnswer : a
      ),
    };
    saveAnonymousDiagnostic(nextSession);
    setSession(nextSession);
    setRevealedAnswer(updatedAnswer);
  }

  function handleAdvance() {
    if (!session) return;
    const nextIndex = session.current_index + 1;
    const isFinished = nextIndex >= session.question_ids.length;
    const nextSession: AnonymousDiagnosticState = {
      ...session,
      current_index: isFinished ? session.question_ids.length : nextIndex,
      elapsed_ms: elapsedMs,
      completed_at: isFinished ? new Date().toISOString() : null,
    };
    saveAnonymousDiagnostic(nextSession);
    setSession(nextSession);
    setSelectedOption(null);
    setRevealedAnswer(null);
    questionStartRef.current = Date.now();
  }

  function handleRestart() {
    const fresh = createFreshSession(resolvedJurisdiction);
    saveAnonymousDiagnostic(fresh);
    setSession(fresh);
    setElapsedMs(0);
    setSelectedOption(null);
    setRevealedAnswer(null);
    questionStartRef.current = Date.now();
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink-primary">
      <header className="sticky top-0 z-30 border-b border-ink/[0.08] bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
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
            <span className="hidden font-mono text-xs uppercase tracking-[0.14em] text-accent-cyan sm:inline">
              Free Diagnostic
            </span>
          </div>

          <nav
            aria-label="Diagnostic utilities"
            className="flex shrink-0 items-center gap-1 sm:gap-2"
          >
            <button
              type="button"
              onClick={() => openModal("accuracy")}
              className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-ink-secondary transition-colors hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              Accuracy
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

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        {/* Top Context + Segmented Jurisdiction Switcher */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <Link
              href="/"
              className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-ink-secondary transition-colors hover:text-ink-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Back to overview
            </Link>
            <h1 className="text-h1 text-ink-primary">
              {resolvedJurisdiction.state} Journeyman Diagnostic ({resolvedJurisdiction.code_family}{" "}
              {resolvedJurisdiction.edition})
            </h1>
            <p className="text-sm text-ink-secondary">
              No account required · 10-domain baseline check · Saves locally and migrates automatically if you sign in.
            </p>
          </div>

          <div
            role="group"
            aria-label="Select diagnostic jurisdiction"
            className="grid grid-cols-3 divide-x divide-ink/[0.08] overflow-hidden rounded-xl border border-ink/[0.08] bg-card"
          >
            {jurisdictions.map((jur) => {
              const active = jur.id === resolvedJurisdiction.id;
              return (
                <button
                  key={jur.id}
                  type="button"
                  onClick={() => handleSelectJurisdiction(jur)}
                  aria-pressed={active}
                  className={`relative min-w-[76px] px-3.5 py-2.5 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-cyan ${
                    active ? "bg-elevated/80" : ""
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-[2px] bg-accent-cyan"
                    />
                  )}
                  <span
                    className={`block font-mono text-xs font-bold ${
                      active ? "text-accent-cyan" : "text-ink-primary"
                    }`}
                  >
                    {jur.state}
                  </span>
                  <span className="block font-mono text-[11px] text-ink-secondary">
                    {jur.code_family} {jur.edition}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {!session ? (
          <div className="rounded-2xl border border-ink/[0.08] bg-card p-6 text-sm text-ink-secondary">
            Preparing 10-domain diagnostic...
          </div>
        ) : session.completed_at && summary ? (
          /* Diagnostic Completion Report + Account Migration Entry */
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
            <section
              aria-labelledby="diagnostic-summary-heading"
              className="min-w-0 space-y-6 rounded-2xl border border-ink/[0.08] bg-card p-6 lg:col-span-7"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/[0.08] pb-5">
                <div className="space-y-1">
                  <span className="font-mono text-xs uppercase tracking-[0.14em] text-accent-cyan">
                    Baseline Diagnostic Complete
                  </span>
                  <h2 id="diagnostic-summary-heading" className="text-h1 text-ink-primary">
                    {summary.correctCount} / {summary.totalQuestions} Correct ({summary.scorePct}%)
                  </h2>
                  <p className="text-sm text-ink-secondary">
                    {summary.passed
                      ? `Meets ${resolvedJurisdiction.state}'s ${resolvedJurisdiction.pass_pct}% exam benchmark.`
                      : `Below ${resolvedJurisdiction.state}'s ${resolvedJurisdiction.pass_pct}% benchmark — target your missed domains below.`}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1 font-mono text-xs tabular-nums">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${
                      summary.passed
                        ? "border-accent-emerald/40 bg-accent-emerald/10 text-accent-emerald"
                        : "border-accent-amber/40 bg-accent-amber/10 text-accent-amber"
                    }`}
                  >
                    {summary.passed ? "At Benchmark" : "Needs Targeted Prep"}
                  </span>
                  <span className="text-ink-muted">
                    Elapsed: {formatTimer(elapsedMs)}
                  </span>
                </div>
              </div>

              {/* Domain-by-Domain Readiness Preview */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-ink-primary">
                    10-Domain Baseline Breakdown
                  </h3>
                  <span className="font-mono text-xs text-ink-muted">
                    Readiness gate: {READINESS_MIN_CORRECT_PER_TOPIC} verified correct / domain
                  </span>
                </div>
                <div className="divide-y divide-ink/[0.08] overflow-hidden rounded-xl border border-ink/[0.08] bg-canvas">
                  {summary.domainResults.map((dom) => (
                    <div
                      key={dom.topic.id}
                      className="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <TopicPlumbingIcon
                          slug={dom.topic.slug}
                          className="h-4 w-4 shrink-0 text-accent-cyan"
                        />
                        <span className="truncate text-ink-primary">
                          {dom.topic.title}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${
                          dom.correct === dom.answered && dom.answered > 0
                            ? "text-accent-emerald"
                            : "text-accent-amber"
                        }`}
                      >
                        {dom.correct}/{dom.answered}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Miss Diagnosis Summary */}
              {summary.correctCount < summary.totalQuestions && (
                <div className="space-y-2.5">
                  <h3 className="text-base font-semibold text-ink-primary">
                    Miss Diagnosis Profile
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {AI_ERROR_TYPES.filter((t) => summary.mistakeCounts[t] > 0).map(
                      (errType) => (
                        <span
                          key={errType}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-accent-amber/40 bg-accent-amber/10 px-3 py-1.5 font-mono text-xs text-ink-primary"
                        >
                          <span className="font-semibold text-accent-amber">
                            {summary.mistakeCounts[errType]}×
                          </span>
                          {ERROR_TYPE_META[errType].label}
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.08] pt-4">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="btn-secondary text-sm"
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Retake Diagnostic
                </button>
                {authMode === "authenticated" && (
                  <Link href="/progress" className="btn-primary text-sm">
                    Open Progress &amp; Readiness
                    <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </section>

            <div className="min-w-0 space-y-4 lg:col-span-5">
              {authMode === "logged_out" ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 p-4 text-sm text-ink-secondary">
                    <strong className="block font-semibold text-ink-primary">
                      Save &amp; migrate these {summary.answeredCount} answers
                    </strong>
                    Sign in below to transfer your diagnostic scores, miss classifications, and spaced-review cards directly into your workspace.
                  </div>
                  <AuthCard primarySubmit={false} />
                </div>
              ) : (
                <div className="space-y-3 rounded-2xl border border-ink/[0.08] bg-card p-6">
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-accent-emerald">
                    <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Synced to Workspace
                  </span>
                  <h3 className="text-h2 text-ink-primary">
                    Diagnostic saved to your account
                  </h3>
                  <p className="text-sm text-ink-secondary">
                    Your {summary.answeredCount} answers and spaced-review schedule are queued in your profile.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link href="/practice?mode=weak_spots" className="btn-secondary text-sm">
                      Drill Weak Spots
                    </Link>
                    <Link href="/tools" className="btn-secondary text-sm">
                      Open Calculators
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : currentQuestion ? (
          /* Active Question Card */
          <section
            aria-label="Diagnostic question workspace"
            className="space-y-5 rounded-2xl border border-ink/[0.08] bg-card p-6"
          >
            {/* Progress & Timer Header */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-accent-cyan">
                    Question {session.current_index + 1} / {session.question_ids.length}
                  </span>
                  {currentTopic && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/[0.1] bg-canvas px-2.5 py-0.5 text-xs text-ink-secondary">
                      <TopicPlumbingIcon
                        slug={currentTopic.slug}
                        className="h-3.5 w-3.5 text-accent-cyan"
                      />
                      {currentTopic.title}
                    </span>
                  )}
                </div>

                <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-ink-secondary">
                  <Clock className="h-3.5 w-3.5 text-accent-amber" strokeWidth={1.75} aria-hidden="true" />
                  {formatTimer(elapsedMs)}
                </span>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                <div
                  className="h-full rounded-full bg-accent-cyan transition-[width] duration-200"
                  style={{
                    width: `${Math.round(
                      ((session.current_index + (revealedAnswer ? 1 : 0)) /
                        Math.max(1, session.question_ids.length)) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.article
                key={currentQuestion.id}
                variants={questionSwap}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                  <span className="font-mono">{currentQuestion.code_ref}</span>
                  <span>
                    {formatQuestionReviewStamp(
                      currentQuestion.reviewed_at,
                      currentQuestion.code_family,
                      currentQuestion.edition
                    )}
                  </span>
                </div>

                <h2 className="text-h3 font-semibold leading-relaxed text-ink-primary sm:text-lg">
                  {currentQuestion.stem}
                </h2>

                <div
                  role="radiogroup"
                  aria-label="Answer options"
                  className="space-y-2.5"
                >
                  {currentQuestion.options.map((opt, idx) => (
                    <RadioCard
                      key={`${currentQuestion.id}-${idx}`}
                      label={opt}
                      optionIndex={idx}
                      selected={selectedOption === idx}
                      revealed={Boolean(revealedAnswer)}
                      isCorrectOption={idx === currentQuestion.correct_index}
                      disabled={Boolean(revealedAnswer)}
                      onSelect={() => setSelectedOption(idx)}
                    />
                  ))}
                </div>
              </motion.article>
            </AnimatePresence>

            {/* Immediate Diagnosis & Explanation */}
            {revealedAnswer && (
              <div
                role="status"
                className={`space-y-4 rounded-xl border p-4 ${
                  revealedAnswer.is_correct
                    ? "border-accent-emerald/40 bg-accent-emerald/10"
                    : "border-accent-amber/40 bg-accent-amber/10"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {revealedAnswer.is_correct ? (
                    <CheckCircle2
                      className="mt-0.5 h-5 w-5 shrink-0 text-accent-emerald"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  ) : (
                    <XCircle
                      className="mt-0.5 h-5 w-5 shrink-0 text-accent-amber"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  )}
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-ink-primary">
                      {revealedAnswer.is_correct
                        ? "Correct — logged toward your 15-verified-correct readiness baseline"
                        : "Incorrect — review the code rationale below"}
                    </p>
                    <p className="text-sm leading-relaxed text-ink-secondary">
                      {currentQuestion.explanation_seed}
                    </p>
                  </div>
                </div>

                {!revealedAnswer.is_correct && (
                  <div className="space-y-2 border-t border-ink/[0.08] pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs uppercase tracking-wider text-accent-amber">
                        Miss Diagnosis Tag
                      </span>
                      {revealedAnswer.error_type && (
                        <span className="text-xs text-ink-secondary">
                          {ERROR_TYPE_META[revealedAnswer.error_type].shortDescription}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {AI_ERROR_TYPES.map((errType) => {
                        const active = revealedAnswer.error_type === errType;
                        return (
                          <button
                            key={errType}
                            type="button"
                            onClick={() => handleUpdateErrorTag(errType)}
                            aria-pressed={active}
                            className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs transition-colors ${
                              active
                                ? "border-accent-cyan bg-accent-cyan/15 font-semibold text-accent-cyan"
                                : "border-ink/[0.12] bg-canvas text-ink-secondary hover:border-ink/25 hover:text-ink-primary"
                            }`}
                          >
                            {errType}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer Action (strictly 1 .btn-primary) */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.08] pt-4">
              <span className="font-mono text-xs tabular-nums text-ink-muted">
                {session.answers.length} of {session.question_ids.length} answered
              </span>

              {!revealedAnswer ? (
                <button
                  type="button"
                  disabled={selectedOption === null}
                  onClick={handleCheckAnswer}
                  className="btn-primary"
                >
                  Check Answer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAdvance}
                  className="btn-primary"
                >
                  {session.current_index + 1 >= session.question_ids.length
                    ? "View Diagnostic Report"
                    : "Next Question"}
                  <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
