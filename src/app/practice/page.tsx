"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flag,
  Lock,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { TopicPlumbingIcon } from "@/components/icons/plumbing-icons";
import { RadioCard } from "@/components/practice/radio-card";
import { QuestionReviewBar } from "@/components/questions/question-review-bar";
import { useAppState } from "@/components/providers/app-state-provider";
import { AppShell } from "@/components/shell/app-shell";
import type {
  AiErrorType,
  PracticeMode,
  PracticeSessionRecord,
  SrsStateRecord,
} from "@/lib/domain/types";
import { questionSwap } from "@/lib/motion";
import { AI_ERROR_TYPES, ERROR_TYPE_META } from "@/lib/progress/analytics";
import { FREE_TIER_DAILY_LIMIT } from "@/lib/srs";

const PRACTICE_MODES: { id: PracticeMode; label: string; subtitle: string }[] = [
  { id: "daily_12", label: "Daily 12", subtitle: "~50% due · 35% weak · 15% blueprint" },
  { id: "topic_drill", label: "Topic Drill", subtitle: "Single code domain focus" },
  { id: "weak_spots", label: "Weak Spots", subtitle: "Lowest recency-weighted mastery" },
  { id: "missed_review", label: "Missed Review", subtitle: "Lapses & prior misses" },
];

function formatTimer(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function PracticeContent() {
  const searchParams = useSearchParams();
  const urlMode = searchParams.get("mode");
  const urlTopicSlug = searchParams.get("topic");
  const urlErrorTypeRaw = searchParams.get("errorType");
  const activeErrorType: AiErrorType | null = AI_ERROR_TYPES.includes(
    urlErrorTypeRaw as AiErrorType
  )
    ? (urlErrorTypeRaw as AiErrorType)
    : null;

  const {
    authMode,
    activeJurisdiction,
    topics,
    servableQuestionsForJurisdiction,
    planTier,
    freeTierRemaining,
    freeTierUsedToday,
    startOrResumePracticeSession,
    savePracticeSessionProgress,
    recordAttempt,
    updateAttemptErrorType,
  } = useAppState();

  const initialMode: PracticeMode =
    urlTopicSlug
      ? "topic_drill"
      : activeErrorType
        ? "weak_spots"
        : urlMode === "weak_spots" ||
            urlMode === "missed_review" ||
            urlMode === "topic_drill"
          ? urlMode
          : "daily_12";

  const initialTopicId = useMemo(() => {
    if (urlTopicSlug) {
      return topics.find((t) => t.slug === urlTopicSlug)?.id ?? topics[0]?.id ?? null;
    }
    return topics[0]?.id ?? null;
  }, [topics, urlTopicSlug]);

  const [mode, setMode] = useState<PracticeMode>(initialMode);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    initialTopicId
  );
  const [session, setSession] = useState<PracticeSessionRecord | null>(null);
  const [wasResumed, setWasResumed] = useState<boolean>(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<boolean>(false);
  const [lastSrsResult, setLastSrsResult] = useState<SrsStateRecord | null>(null);
  const [capError, setCapError] = useState<string | null>(null);

  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const questionStartMsRef = useRef<number>(Date.now());
  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
  const [taggedErrorType, setTaggedErrorType] = useState<AiErrorType | null>(null);

  const loadSession = useCallback(
    async (
      targetMode: PracticeMode,
      targetTopicId: string | null,
      forceRestart = false
    ) => {
      const outcome = await startOrResumePracticeSession({
        mode: targetMode,
        topicId: targetMode === "topic_drill" ? targetTopicId : null,
        errorType: activeErrorType,
        forceRestart,
      });
      setSession(outcome.session);
      setWasResumed(outcome.resumed);
      setElapsedMs(outcome.session?.elapsed_ms ?? 0);
      setSelectedOption(null);
      setRevealed(false);
      setLastSrsResult(null);
      setLastAttemptId(null);
      setTaggedErrorType(null);
      setCapError(null);
      questionStartMsRef.current = Date.now();
    },
    [activeErrorType, startOrResumePracticeSession]
  );

  // Initialize or switch session when jurisdiction, mode, topic, or errorType filter changes
  useEffect(() => {
    if (authMode !== "authenticated") return;
    void loadSession(mode, selectedTopicId, false);
    // Intentionally keyed on authMode, activeJurisdiction.id, mode, selectedTopicId, activeErrorType
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode, activeJurisdiction.id, mode, selectedTopicId, activeErrorType]);

  // Live session timer
  useEffect(() => {
    if (!session || session.status !== "in_progress") return;
    const id = window.setInterval(() => {
      setElapsedMs((prev) => prev + 1000);
    }, 1000);
    return () => window.clearInterval(id);
  }, [session?.id, session?.status]);

  const servableById = useMemo(() => {
    const map = new Map(servableQuestionsForJurisdiction.map((q) => [q.id, q]));
    return map;
  }, [servableQuestionsForJurisdiction]);

  const currentQuestion = useMemo(() => {
    if (!session || session.status !== "in_progress") return null;
    const qid = session.question_ids[session.current_index];
    return qid ? servableById.get(qid) ?? null : null;
  }, [servableById, session]);

  const currentTopic = useMemo(() => {
    if (!currentQuestion) return null;
    return topics.find((t) => t.id === currentQuestion.topic_id) ?? null;
  }, [currentQuestion, topics]);

  if (authMode === "logged_out") {
    return (
      <main className="blueprint-grid-bg flex min-h-dvh items-center justify-center px-4 py-10">
        <AuthCard />
      </main>
    );
  }

  const isFlagged = Boolean(
    session &&
      currentQuestion &&
      session.flagged_question_ids.includes(currentQuestion.id)
  );

  async function handleCheckAnswer() {
    if (!session || !currentQuestion || selectedOption === null || revealed) return;

    const timeSpent = Math.max(500, Date.now() - questionStartMsRef.current);
    const isCorrect = selectedOption === currentQuestion.correct_index;

    const outcome = await recordAttempt({
      questionId: currentQuestion.id,
      topicId: currentQuestion.topic_id,
      selectedIndex: selectedOption,
      isCorrect,
      timeMs: timeSpent,
      mode: mode === "missed_review" ? "srs" : "practice",
      errorType: isCorrect ? null : activeErrorType ?? undefined,
    });

    if (outcome.capReached || !outcome.ok) {
      setCapError(
        outcome.message ??
          `Free tier daily limit reached (${FREE_TIER_DAILY_LIMIT} questions/day).`
      );
      return;
    }

    const updatedAnswers = [
      ...session.answers,
      {
        question_id: currentQuestion.id,
        selected_index: selectedOption,
        is_correct: isCorrect,
        time_ms: timeSpent,
        answered_at: new Date().toISOString(),
      },
    ];

    const updatedSession: PracticeSessionRecord = {
      ...session,
      answers: updatedAnswers,
      elapsed_ms: elapsedMs,
    };
    setSession(updatedSession);
    setLastSrsResult(outcome.srsState ?? null);
    setLastAttemptId(outcome.attemptId ?? null);
    setTaggedErrorType(null);
    setRevealed(true);

    await savePracticeSessionProgress(session.id, {
      answers: updatedAnswers,
      elapsed_ms: elapsedMs,
    });
  }

  async function handleNextQuestion() {
    if (!session) return;
    const nextIndex = session.current_index + 1;
    const finished = nextIndex >= session.question_ids.length;
    const nextStatus = finished ? "completed" : "in_progress";

    const nextSession: PracticeSessionRecord = {
      ...session,
      current_index: nextIndex,
      elapsed_ms: elapsedMs,
      status: nextStatus,
    };
    setSession(nextSession);
    setSelectedOption(null);
    setRevealed(false);
    setLastSrsResult(null);
    setLastAttemptId(null);
    setTaggedErrorType(null);
    questionStartMsRef.current = Date.now();

    await savePracticeSessionProgress(session.id, {
      current_index: nextIndex,
      elapsed_ms: elapsedMs,
      status: nextStatus,
    });
  }

  async function handleToggleFlag() {
    if (!session || !currentQuestion) return;
    const exists = session.flagged_question_ids.includes(currentQuestion.id);
    const nextFlags = exists
      ? session.flagged_question_ids.filter((id) => id !== currentQuestion.id)
      : [...session.flagged_question_ids, currentQuestion.id];

    setSession({ ...session, flagged_question_ids: nextFlags });
    await savePracticeSessionProgress(session.id, {
      flagged_question_ids: nextFlags,
    });
  }

  async function handleSelectErrorTag(tag: AiErrorType) {
    if (!lastAttemptId) return;
    setTaggedErrorType(tag);
    await updateAttemptErrorType(lastAttemptId, tag);
  }

  const sessionCorrectCount =
    session?.answers.filter((a) => a.is_correct).length ?? 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Header & Free-tier meter */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="text-caption uppercase tracking-wider text-accent">
              Adaptive Practice · {activeJurisdiction.state}{" "}
              {activeJurisdiction.code_family} {activeJurisdiction.edition}
            </span>
            <h1 className="text-h1 text-ink">
              {PRACTICE_MODES.find((m) => m.id === mode)?.label}
            </h1>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-caption tabular-nums text-muted">
            {planTier === "free" ? (
              <span>
                Free tier:{" "}
                <strong className="text-ink">
                  {freeTierUsedToday}/{FREE_TIER_DAILY_LIMIT}
                </strong>{" "}
                today ({freeTierRemaining} left)
              </span>
            ) : (
              <span className="text-success font-semibold">Unlimited Pro</span>
            )}
          </div>
        </div>

        {/* Mode selector */}
        <div
          role="tablist"
          aria-label="Adaptive practice modes"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {PRACTICE_MODES.map((item) => {
            const active = item.id === mode;
            return (
              <button
                key={item.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setMode(item.id)}
                className={`flex min-h-12 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-accent bg-elevated text-ink"
                    : "border-border/70 bg-card text-muted hover:border-border hover:text-ink"
                }`}
              >
                <span className="text-sm font-semibold">{item.label}</span>
                <span className="line-clamp-1 text-caption opacity-85">
                  {item.subtitle}
                </span>
              </button>
            );
          })}
        </div>

        {/* Topic selector when in Topic Drill mode */}
        {mode === "topic_drill" && (
          <div className="space-y-1.5">
            <label
              htmlFor="topic-drill-select"
              className="block text-caption uppercase tracking-wider text-muted"
            >
              Drill topic
            </label>
            <select
              id="topic-drill-select"
              value={selectedTopicId ?? ""}
              onChange={(e) => setSelectedTopicId(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3.5 text-base text-ink"
            >
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_order}. {t.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Targeted error_type Fix Banner (when launched from Progress Mistake Profile) */}
        {activeErrorType && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/50 bg-primary/10 px-4 py-2.5 text-sm text-ink"
          >
            <span>
              Targeted Fix Drill:{" "}
              <strong className="text-ink">
                {ERROR_TYPE_META[activeErrorType].label}
              </strong>{" "}
              (<code className="font-mono text-caption">{activeErrorType}</code>)
            </span>
            <Link
              href="/practice"
              className="text-caption font-semibold text-accent hover:underline"
            >
              Clear filter
            </Link>
          </div>
        )}

        {/* Interrupted session resumed banner */}
        {wasResumed && session && session.status === "in_progress" && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/50 bg-accent/10 px-4 py-2.5 text-sm text-ink"
          >
            <span>
              Resumed interrupted session · Question{" "}
              <strong className="tabular-nums">
                {session.current_index + 1} of {session.question_ids.length}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => loadSession(mode, selectedTopicId, true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-caption text-ink hover:border-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Restart session
            </button>
          </div>
        )}

        {/* Free-tier daily cap alert */}
        {capError && (
          <div
            role="alert"
            className="bento-card flex items-start gap-3 border-primary/70 bg-primary/10"
          >
            <Lock
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="text-base font-semibold text-ink">{capError}</p>
              <p className="text-sm text-muted">
                Your session progress is saved. Return tomorrow or upgrade for unlimited daily questions and mock simulations.
              </p>
            </div>
          </div>
        )}

        {/* Active one-question-per-screen card */}
        <AnimatePresence mode="wait">
          {session && session.status === "completed" ? (
            <motion.section
              key={`completed-${session.id}`}
              variants={questionSwap}
              initial="initial"
              animate="animate"
              exit="exit"
              className="bento-card space-y-5"
            >
              <div className="space-y-1">
                <span className="text-caption uppercase tracking-wider text-success">
                  Session Complete
                </span>
                <h2 className="text-h2 text-ink">
                  {sessionCorrectCount} of {session.answers.length} correct
                </h2>
                <p className="tabular-nums text-sm text-muted">
                  Elapsed time: {formatTimer(elapsedMs)} · Flagged:{" "}
                  {session.flagged_question_ids.length}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Link href="/" className="btn-secondary">
                  Back to HomeBento
                </Link>
                <button
                  type="button"
                  onClick={() => loadSession(mode, selectedTopicId, true)}
                  className="btn-primary"
                >
                  Start Fresh Set
                  <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            </motion.section>
          ) : currentQuestion ? (
            <motion.article
              key={currentQuestion.id}
              variants={questionSwap}
              initial="initial"
              animate="animate"
              exit="exit"
              className="bento-card space-y-5"
            >
              {/* Progress & toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
                <div className="flex items-center gap-2.5">
                  {currentTopic && (
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-elevated text-accent">
                      <TopicPlumbingIcon
                        slug={currentTopic.slug}
                        className="h-4 w-4"
                      />
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {currentTopic?.title ?? "Plumbing Code"}
                    </p>
                    <p className="tabular-nums text-caption text-muted">
                      Question {(session?.current_index ?? 0) + 1} of{" "}
                      {session?.question_ids.length ?? 1} · Diff{" "}
                      {currentQuestion.difficulty}/5 · {currentQuestion.code_ref}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    aria-label="Session timer"
                    className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border bg-bg/70 px-3 font-mono text-sm tabular-nums text-ink"
                  >
                    <Clock className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
                    {formatTimer(elapsedMs)}
                  </span>

                  <button
                    type="button"
                    onClick={handleToggleFlag}
                    aria-label={isFlagged ? "Remove question flag" : "Flag question for review"}
                    aria-pressed={isFlagged}
                    className={`inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border px-3 transition-colors ${
                      isFlagged
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-bg/70 text-muted hover:text-ink"
                    }`}
                  >
                    <Flag className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Question stem */}
              <p className="text-h3 leading-relaxed text-ink">
                {currentQuestion.stem}
              </p>

              {/* RadioCard options */}
              <div
                role="radiogroup"
                aria-label="Answer choices"
                className="space-y-2.5"
              >
                {currentQuestion.options.map((opt, idx) => (
                  <RadioCard
                    key={`${currentQuestion.id}-${idx}`}
                    label={opt}
                    optionIndex={idx}
                    selected={selectedOption === idx}
                    revealed={revealed}
                    isCorrectOption={idx === currentQuestion.correct_index}
                    disabled={revealed}
                    onSelect={() => setSelectedOption(idx)}
                  />
                ))}
              </div>

              {/* Instant explanation slot */}
              {revealed && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  role="status"
                  className={`space-y-2.5 rounded-xl border p-4 text-sm ${
                    selectedOption === currentQuestion.correct_index
                      ? "border-success/50 bg-success/10"
                      : "border-error/50 bg-error/10"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 font-semibold text-ink">
                      {selectedOption === currentQuestion.correct_index ? (
                        <>
                          <CheckCircle2
                            className="h-5 w-5 text-success"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Correct
                        </>
                      ) : (
                        <>
                          <XCircle
                            className="h-5 w-5 text-error"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Incorrect
                        </>
                      )}
                    </span>
                    {lastSrsResult && (
                      <span className="font-mono text-caption tabular-nums text-muted">
                        SM-2 next: {lastSrsResult.interval_days}d · EF{" "}
                        {(lastSrsResult.ease_factor ?? 2.5).toFixed(2)}
                      </span>
                    )}
                  </div>

                  <p className="text-ink">{currentQuestion.explanation_seed}</p>

                  {selectedOption !== currentQuestion.correct_index &&
                    lastAttemptId && (
                      <div className="space-y-1.5 border-t border-border/60 pt-2">
                        <span className="block text-caption text-muted">
                          Tag mistake cause for your Progress Mistake Profile:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {AI_ERROR_TYPES.map((errType) => (
                            <button
                              key={errType}
                              type="button"
                              onClick={() => void handleSelectErrorTag(errType)}
                              className={`min-h-9 rounded-lg border px-2.5 font-mono text-caption transition-colors ${
                                taggedErrorType === errType
                                  ? "border-accent bg-elevated font-semibold text-accent"
                                  : "border-border bg-bg/70 text-muted hover:text-ink"
                              }`}
                            >
                              {errType}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  <p className="text-caption text-muted">
                    Ref: {currentQuestion.code_ref} · Verify against your adopted code. Not legal advice.
                  </p>
                </motion.div>
              )}

              <QuestionReviewBar
                questionId={currentQuestion.id}
                reviewedAt={currentQuestion.reviewed_at}
                codeFamily={currentQuestion.code_family}
                edition={currentQuestion.edition}
                codeRef={currentQuestion.code_ref}
              />

              {/* Primary action footer (strictly one .btn-primary per screen) */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
                <Link href="/" className="btn-secondary">
                  Save &amp; Exit
                </Link>

                {!revealed ? (
                  <button
                    type="button"
                    disabled={selectedOption === null || Boolean(capError)}
                    onClick={handleCheckAnswer}
                    className="btn-primary"
                  >
                    Check Answer
                    <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="btn-primary"
                  >
                    {(session?.current_index ?? 0) + 1 >=
                    (session?.question_ids.length ?? 1)
                      ? "Finish Session"
                      : "Next Question"}
                    <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
              </div>
            </motion.article>
          ) : (
            <motion.div
              key="empty-pool"
              variants={questionSwap}
              initial="initial"
              animate="animate"
              exit="exit"
              className="bento-card space-y-3"
            >
              <div className="flex items-center gap-2 text-primary">
                <AlertTriangle className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                <h2 className="text-h3 text-ink">
                  No matching servable questions in this filter
                </h2>
              </div>
              <p className="text-sm text-muted">
                {mode === "missed_review"
                  ? "You have no missed or lapsed questions for this jurisdiction yet. Switch to Daily 12 or Topic Drill."
                  : "Try another topic or Daily 12 adaptive mode."}
              </p>
              <button
                type="button"
                onClick={() => setMode("daily_12")}
                className="btn-primary"
              >
                Switch to Daily 12
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-bg px-4 py-12 text-muted">
          Loading adaptive practice...
        </div>
      }
    >
      <PracticeContent />
    </Suspense>
  );
}
