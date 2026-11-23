"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Flag,
  HelpCircle,
  Lock,
  ShieldCheck,
  WifiOff,
  XCircle,
} from "lucide-react";
import { TopicPlumbingIcon } from "@/components/icons/plumbing-icons";
import { QuestionReviewBar } from "@/components/questions/question-review-bar";
import { useAppState } from "@/components/providers/app-state-provider";
import {
  type ClientMockQuestion,
  type ClientMockSession,
  type MockExamResult,
  type SavedMockAnswer,
  allocateTopicCountsByBlueprint,
  computeServerRemainingMs,
} from "@/lib/mock/engine";
import {
  type MockDraftRecord,
  getOfflineDb,
} from "@/lib/offline/db";

type ExamPhase = "lobby" | "exam" | "review" | "results";
type NavFilter = "all" | "unanswered" | "flagged";
type SyncStatus = "synced" | "saving" | "offline_queued";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDurationSeconds(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatVerifiedDate(iso: string | null): string {
  if (!iso) return "Pending verification";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "Pending verification";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(parsed));
}

export function MockExamRunner() {
  const {
    activeJurisdiction,
    topics,
    blueprints,
    recordMockCompletion,
  } = useAppState();

  const [phase, setPhase] = useState<ExamPhase>("lobby");
  const [session, setSession] = useState<ClientMockSession | null>(null);
  const [questions, setQuestions] = useState<ClientMockQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, SavedMockAnswer>>({});
  const [flaggedIds, setFlaggedIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [navFilter, setNavFilter] = useState<NavFilter>("all");
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [resumedBanner, setResumedBanner] = useState<boolean>(false);
  const [openBookGuideOpen, setOpenBookGuideOpen] = useState<boolean>(false);
  const [showReviewDetail, setShowReviewDetail] = useState<boolean>(false);
  const [result, setResult] = useState<MockExamResult | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Server clock offset = serverNow - clientNow
  const serverClockOffsetRef = useRef<number>(0);
  const questionEnteredAtRef = useRef<number>(Date.now());
  const autoSubmittedRef = useRef<boolean>(false);

  const blueprintPreviewAllocations = useMemo(
    () =>
      allocateTopicCountsByBlueprint(
        activeJurisdiction.question_count,
        blueprints,
        activeJurisdiction.id,
        topics
      ),
    [activeJurisdiction.id, activeJurisdiction.question_count, blueprints, topics]
  );

  const persistLocalDraft = useCallback(
    async (
      targetSession: ClientMockSession,
      targetQuestions: ClientMockQuestion[],
      nextAnswers: Record<string, SavedMockAnswer>,
      nextFlags: string[],
      nextIndex: number,
      pendingSync: boolean
    ) => {
      const db = getOfflineDb();
      if (!db) return;
      try {
        await db.mockDrafts.put({
          id: targetSession.id,
          jurisdiction_id: targetSession.jurisdiction_id,
          session: {
            ...targetSession,
            answers: nextAnswers,
            flagged_question_ids: nextFlags,
            current_index: nextIndex,
          },
          questions: targetQuestions,
          answers: nextAnswers,
          flagged_question_ids: nextFlags,
          current_index: nextIndex,
          pending_sync: pendingSync,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // Ignore storage errors in restricted environments
      }
    },
    []
  );

  const flushPatchToServer = useCallback(
    async (
      targetSession: ClientMockSession,
      targetQuestions: ClientMockQuestion[],
      nextAnswers: Record<string, SavedMockAnswer>,
      nextFlags: string[],
      nextIndex: number
    ) => {
      setSyncStatus("saving");
      try {
        const res = await fetch(`/api/mock/sessions/${targetSession.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: Object.fromEntries(
              Object.entries(nextAnswers).map(([k, v]) => [
                k,
                { selected_index: v.selected_index, time_ms: v.time_ms },
              ])
            ),
            flaggedQuestionIds: nextFlags,
            currentIndex: nextIndex,
          }),
        });

        if (res.status === 409) {
          setSyncStatus("synced");
          return "expired" as const;
        }
        if (!res.ok) {
          throw new Error("PATCH failed");
        }

        const data = (await res.json()) as {
          session: ClientMockSession;
          server_now: string;
          remaining_ms: number;
        };
        serverClockOffsetRef.current =
          Date.parse(data.server_now) - Date.now();
        setRemainingMs(data.remaining_ms);
        setSyncStatus("synced");
        await persistLocalDraft(
          data.session,
          targetQuestions,
          nextAnswers,
          nextFlags,
          nextIndex,
          false
        );
        return "ok" as const;
      } catch {
        setSyncStatus("offline_queued");
        await persistLocalDraft(
          targetSession,
          targetQuestions,
          nextAnswers,
          nextFlags,
          nextIndex,
          true
        );
        return "offline" as const;
      }
    },
    [persistLocalDraft]
  );

  // Hydrate & auto-resume after refresh or reconnect
  useEffect(() => {
    let active = true;

    async function checkResumableExam() {
      setErrorBanner(null);
      const db = getOfflineDb();
      let localDraft: MockDraftRecord | undefined;

      if (db) {
        try {
          const drafts = await db.mockDrafts
            .where("jurisdiction_id")
            .equals(activeJurisdiction.id)
            .toArray();
          localDraft = drafts.find(
            (d) =>
              d.session.status === "in_progress" &&
              Date.parse(d.session.expires_at) > Date.now()
          );
        } catch {
          // Ignore Dexie failure
        }
      }

      try {
        const listRes = await fetch(
          `/api/mock/sessions?jurisdictionId=${encodeURIComponent(activeJurisdiction.id)}`
        );
        if (listRes.ok) {
          const listData = (await listRes.json()) as {
            sessions: ClientMockSession[];
            server_now: string;
          };
          const activeServer = listData.sessions.find(
            (s) =>
              s.status === "in_progress" &&
              computeServerRemainingMs(s.expires_at, listData.server_now) > 0
          );

          if (active && activeServer) {
            const detailRes = await fetch(`/api/mock/sessions/${activeServer.id}`);
            if (detailRes.ok) {
              const detail = (await detailRes.json()) as {
                session: ClientMockSession;
                questions: ClientMockQuestion[];
                server_now: string;
                remaining_ms: number;
              };
              serverClockOffsetRef.current =
                Date.parse(detail.server_now) - Date.now();

              const mergedAnswers =
                localDraft &&
                localDraft.id === detail.session.id &&
                localDraft.pending_sync
                  ? { ...detail.session.answers, ...localDraft.answers }
                  : detail.session.answers;
              const mergedFlags =
                localDraft &&
                localDraft.id === detail.session.id &&
                localDraft.pending_sync
                  ? localDraft.flagged_question_ids
                  : detail.session.flagged_question_ids;
              const mergedIndex =
                localDraft &&
                localDraft.id === detail.session.id &&
                localDraft.pending_sync
                  ? localDraft.current_index
                  : detail.session.current_index;

              if (!active) return;
              setSession(detail.session);
              setQuestions(detail.questions);
              setAnswers(mergedAnswers);
              setFlaggedIds(mergedFlags);
              setCurrentIndex(mergedIndex);
              setRemainingMs(detail.remaining_ms);
              setResumedBanner(true);
              setPhase("exam");
              questionEnteredAtRef.current = Date.now();

              if (localDraft?.pending_sync) {
                void flushPatchToServer(
                  detail.session,
                  detail.questions,
                  mergedAnswers,
                  mergedFlags,
                  mergedIndex
                );
              }
              return;
            }
          }
        }
      } catch {
        // Network offline: fall back to Dexie draft directly
        if (active && localDraft) {
          setSession(localDraft.session);
          setQuestions(localDraft.questions);
          setAnswers(localDraft.answers);
          setFlaggedIds(localDraft.flagged_question_ids);
          setCurrentIndex(localDraft.current_index);
          setRemainingMs(
            Math.max(0, Date.parse(localDraft.session.expires_at) - Date.now())
          );
          setSyncStatus("offline_queued");
          setResumedBanner(true);
          setPhase("exam");
          questionEnteredAtRef.current = Date.now();
          return;
        }
      }

      if (active) {
        setSession(null);
        setQuestions([]);
        setAnswers({});
        setFlaggedIds([]);
        setResult(null);
        setPhase("lobby");
      }
    }

    void checkResumableExam();
    return () => {
      active = false;
    };
  }, [activeJurisdiction.id, flushPatchToServer]);

  // Flush queued answers automatically when network reconnects
  useEffect(() => {
    function handleOnline() {
      if (session && session.status === "in_progress") {
        void flushPatchToServer(
          session,
          questions,
          answers,
          flaggedIds,
          currentIndex
        );
      }
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [answers, currentIndex, flaggedIds, flushPatchToServer, questions, session]);

  const handleSubmitExam = useCallback(
    async (isAutoExpire = false) => {
      if (!session || isSubmitting) return;
      if (isAutoExpire && autoSubmittedRef.current) return;
      if (isAutoExpire) autoSubmittedRef.current = true;

      setIsSubmitting(true);
      setErrorBanner(null);

      try {
        const res = await fetch(`/api/mock/sessions/${session.id}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            finalAnswers: Object.fromEntries(
              Object.entries(answers).map(([k, v]) => [
                k,
                { selected_index: v.selected_index, time_ms: v.time_ms },
              ])
            ),
            flaggedQuestionIds: flaggedIds,
            timeSpentMs: Object.values(answers).reduce(
              (sum, a) => sum + a.time_ms,
              0
            ),
          }),
        });

        if (!res.ok) {
          throw new Error("Could not grade exam right now.");
        }

        const data = (await res.json()) as {
          session: ClientMockSession;
          result: MockExamResult;
        };

        setSession(data.session);
        setResult(data.result);
        setPhase("results");

        const db = getOfflineDb();
        if (db) {
          await db.mockDrafts.delete(session.id);
        }

        await recordMockCompletion({
          session: {
            id: data.session.id,
            jurisdiction_id: data.session.jurisdiction_id,
            status: data.session.status,
            started_at: data.session.started_at,
            score_pct: data.result.score_pct,
            passed: data.result.passed,
          },
          gradedAttempts: data.result.question_review
            .filter((item) => item.selected_index !== null)
            .map((item) => ({
              id: `${data.session.id}-${item.question_id}`,
              question_id: item.question_id,
              topic_id: item.topic_id,
              is_correct: item.is_correct,
              time_ms: item.time_ms,
              mode: "exam" as const,
              attempted_at: data.session.submitted_at ?? new Date().toISOString(),
            })),
        });
      } catch (err) {
        setErrorBanner(
          err instanceof Error
            ? err.message
            : "Connection lost before grading. Your answers are saved locally; retry submit once online."
        );
        if (isAutoExpire) autoSubmittedRef.current = false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [answers, flaggedIds, isSubmitting, recordMockCompletion, session]
  );

  // Server-authoritative countdown ticker
  useEffect(() => {
    if (
      !session ||
      session.status !== "in_progress" ||
      (phase !== "exam" && phase !== "review")
    ) {
      return;
    }

    const tick = () => {
      const serverNowIso = new Date(
        Date.now() + serverClockOffsetRef.current
      ).toISOString();
      const rem = computeServerRemainingMs(session.expires_at, serverNowIso);
      setRemainingMs(rem);
      if (rem <= 0 && !autoSubmittedRef.current) {
        void handleSubmitExam(true);
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [handleSubmitExam, phase, session]);

  async function handleStartExam() {
    setIsLoading(true);
    setErrorBanner(null);
    autoSubmittedRef.current = false;

    try {
      const res = await fetch("/api/mock/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jurisdictionId: activeJurisdiction.id,
          resumeIfActive: true,
          strictBankSize: false,
        }),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(errData.message ?? "Unable to initialize timed mock.");
      }

      const data = (await res.json()) as {
        session: ClientMockSession;
        questions: ClientMockQuestion[];
        server_now: string;
        remaining_ms: number;
      };

      serverClockOffsetRef.current = Date.parse(data.server_now) - Date.now();
      setSession(data.session);
      setQuestions(data.questions);
      setAnswers(data.session.answers);
      setFlaggedIds(data.session.flagged_question_ids);
      setCurrentIndex(data.session.current_index);
      setRemainingMs(data.remaining_ms);
      setResult(null);
      setResumedBanner(Object.keys(data.session.answers).length > 0);
      setPhase("exam");
      questionEnteredAtRef.current = Date.now();

      await persistLocalDraft(
        data.session,
        data.questions,
        data.session.answers,
        data.session.flagged_question_ids,
        data.session.current_index,
        false
      );
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : "Failed to start mock exam."
      );
    } finally {
      setIsLoading(false);
    }
  }

  function recordCurrentQuestionDwell(): Record<string, SavedMockAnswer> {
    const q = questions[currentIndex];
    if (!q) return answers;
    const prev = answers[q.id];
    if (!prev) return answers;

    const delta = Math.max(0, Date.now() - questionEnteredAtRef.current);
    questionEnteredAtRef.current = Date.now();

    return {
      ...answers,
      [q.id]: {
        ...prev,
        time_ms: prev.time_ms + delta,
        updated_at: new Date().toISOString(),
      },
    };
  }

  async function handleSelectAnswer(optionIndex: number) {
    if (!session || !questions[currentIndex]) return;
    const q = questions[currentIndex];
    const delta = Math.max(500, Date.now() - questionEnteredAtRef.current);
    questionEnteredAtRef.current = Date.now();
    const prevTime = answers[q.id]?.time_ms ?? 0;

    const nextAnswers: Record<string, SavedMockAnswer> = {
      ...answers,
      [q.id]: {
        selected_index: optionIndex,
        time_ms: prevTime + delta,
        updated_at: new Date().toISOString(),
      },
    };

    setAnswers(nextAnswers);
    await persistLocalDraft(
      session,
      questions,
      nextAnswers,
      flaggedIds,
      currentIndex,
      true
    );
    await flushPatchToServer(
      session,
      questions,
      nextAnswers,
      flaggedIds,
      currentIndex
    );
  }

  async function handleJumpToQuestion(nextIdx: number) {
    if (!session || nextIdx < 0 || nextIdx >= questions.length) return;
    const nextAnswers = recordCurrentQuestionDwell();
    setAnswers(nextAnswers);
    setCurrentIndex(nextIdx);
    setPhase("exam");
    questionEnteredAtRef.current = Date.now();

    await persistLocalDraft(
      session,
      questions,
      nextAnswers,
      flaggedIds,
      nextIdx,
      true
    );
    void flushPatchToServer(
      session,
      questions,
      nextAnswers,
      flaggedIds,
      nextIdx
    );
  }

  async function handleToggleFlag() {
    if (!session || !questions[currentIndex]) return;
    const qId = questions[currentIndex].id;
    const nextFlags = flaggedIds.includes(qId)
      ? flaggedIds.filter((id) => id !== qId)
      : [...flaggedIds, qId];
    setFlaggedIds(nextFlags);
    await persistLocalDraft(
      session,
      questions,
      answers,
      nextFlags,
      currentIndex,
      true
    );
    void flushPatchToServer(
      session,
      questions,
      answers,
      nextFlags,
      currentIndex
    );
  }

  const currentQuestion = questions[currentIndex];
  const answeredCount = questions.filter((q) => Boolean(answers[q.id])).length;
  const unansweredCount = questions.length - answeredCount;
  const flaggedSet = useMemo(() => new Set(flaggedIds), [flaggedIds]);
  const topicTitleMap = useMemo(
    () => new Map(topics.map((t) => [t.id, t])),
    [topics]
  );

  // =========================================================================
  // 1. LOBBY VIEW
  // =========================================================================
  if (phase === "lobby") {
    return (
      <div className="space-y-4">
        <div>
          <span className="text-caption uppercase tracking-wider text-accent">
            Timed Jurisdiction Simulation · {activeJurisdiction.state}
          </span>
          <h1 className="text-h1 text-ink">
            {activeJurisdiction.name} Mock Exam
          </h1>
        </div>

        {errorBanner && (
          <div
            role="alert"
            className="bento-card flex items-start gap-3 border-error/60 bg-error/10 text-sm text-ink"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-error" strokeWidth={1.75} aria-hidden="true" />
            <span>{errorBanner}</span>
          </div>
        )}

        <article className="bento-card space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-caption font-semibold text-accent">
                {activeJurisdiction.code_family} {activeJurisdiction.edition}
              </span>
              <p className="pt-1 text-sm text-muted">
                {activeJurisdiction.amendments_note}
              </p>
            </div>
            <span className="text-caption text-muted">
              Last verified {formatVerifiedDate(activeJurisdiction.last_verified_at)}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-bg/70 p-3.5">
              <dt className="flex items-center gap-1.5 text-caption text-muted">
                <HelpCircle className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
                Questions
              </dt>
              <dd className="mt-1 tabular-nums text-h2 text-ink">
                {activeJurisdiction.question_count}
              </dd>
            </div>
            <div className="rounded-xl border border-border/70 bg-bg/70 p-3.5">
              <dt className="flex items-center gap-1.5 text-caption text-muted">
                <Clock className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
                Time limit
              </dt>
              <dd className="mt-1 tabular-nums text-h2 text-ink">
                {activeJurisdiction.time_limit_min} min
              </dd>
            </div>
            <div className="rounded-xl border border-border/70 bg-bg/70 p-3.5">
              <dt className="flex items-center gap-1.5 text-caption text-muted">
                <ShieldCheck className="h-4 w-4 text-success" strokeWidth={1.75} aria-hidden="true" />
                Pass score
              </dt>
              <dd className="mt-1 tabular-nums text-h2 text-ink">
                {activeJurisdiction.pass_pct}%
              </dd>
            </div>
            <div className="rounded-xl border border-border/70 bg-bg/70 p-3.5">
              <dt className="flex items-center gap-1.5 text-caption text-muted">
                <BookOpen className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden="true" />
                Book policy
              </dt>
              <dd className="mt-1 text-base font-semibold text-ink">
                {activeJurisdiction.open_book ? "Open book" : "Closed book"}
              </dd>
            </div>
          </dl>

          {activeJurisdiction.open_book ? (
            <div className="rounded-xl border border-accent/40 bg-accent/10 p-3.5 text-sm text-ink">
              <p className="font-semibold">Permitted References Notice</p>
              <p className="mt-1 text-muted">
                Allowed references:{" "}
                {activeJurisdiction.allowed_refs.join(", ") ||
                  `${activeJurisdiction.edition} ${activeJurisdiction.code_family}`}
                . Code lookup pointer drawer will be available during the exam.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-bg/70 px-3.5 py-2.5 text-sm text-muted">
              <Lock className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden="true" />
              Closed-book exam: all code lookup tools are hidden during simulation, and answers remain locked until submission.
            </div>
          )}

          {/* Blueprint allocation preview */}
          <div className="space-y-2 border-t border-border/70 pt-4">
            <h2 className="text-caption uppercase tracking-wider text-muted">
              Jurisdiction Blueprint Allocation ({activeJurisdiction.question_count} Q target)
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {topics.map((topic) => {
                const count = blueprintPreviewAllocations.get(topic.id) ?? 0;
                return (
                  <div
                    key={topic.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2 truncate text-ink">
                      <TopicPlumbingIcon slug={topic.slug} className="h-4 w-4 shrink-0 text-accent" />
                      <span className="truncate">{topic.title}</span>
                    </span>
                    <span className="shrink-0 font-mono text-caption tabular-nums text-muted">
                      {count} Qs
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
            {activeJurisdiction.bulletin_url && (
              <a
                href={activeJurisdiction.bulletin_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center gap-1.5 text-sm font-medium text-accent hover:underline"
              >
                Official {activeJurisdiction.exam_vendor} Bulletin
                <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </a>
            )}
            <button
              type="button"
              disabled={isLoading}
              onClick={handleStartExam}
              className="btn-primary w-full sm:w-auto"
            >
              {isLoading ? "Preparing Exam..." : "Start Timed Mock"}
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </article>
      </div>
    );
  }

  // =========================================================================
  // 2. ACTIVE EXAM OR REVIEW SCREEN (MINIMAL MOTION, ZERO ANSWER REVEAL)
  // =========================================================================
  if (session && (phase === "exam" || phase === "review")) {
    const lowTimeWarning = remainingMs > 0 && remainingMs <= 5 * 60 * 1000;

    return (
      <div className="space-y-4">
        {/* Authoritative exam bar */}
        <header className="bento-card flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-caption uppercase tracking-wider text-accent">
              {activeJurisdiction.state} · {activeJurisdiction.code_family}{" "}
              {activeJurisdiction.edition}
            </span>
            <p className="text-sm font-semibold tabular-nums text-ink">
              Answered {answeredCount} of {questions.length} · Flagged{" "}
              {flaggedIds.length}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-caption ${
                syncStatus === "offline_queued"
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border bg-bg/70 text-muted"
              }`}
            >
              {syncStatus === "offline_queued" && (
                <WifiOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              )}
              {syncStatus === "synced"
                ? "Auto-saved"
                : syncStatus === "saving"
                  ? "Saving..."
                  : "Offline — queued"}
            </span>

            <span
              aria-label="Server-authoritative remaining time"
              className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-3.5 font-mono text-base font-bold tabular-nums ${
                lowTimeWarning
                  ? "border-error bg-error/15 text-error"
                  : "border-accent/50 bg-bg/80 text-ink"
              }`}
            >
              <Clock className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
              {formatCountdown(remainingMs)}
            </span>
          </div>
        </header>

        {resumedBanner && (
          <div
            role="status"
            className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-ink"
          >
            Session restored from server/offline state with authoritative timer.
          </div>
        )}

        {session.is_scaled_preview && (
          <div className="rounded-xl border border-border bg-card px-4 py-2 text-caption text-muted">
            Bank preview: running {questions.length} verified servable questions (official {activeJurisdiction.state} blueprint targets {session.requested_question_count} questions).
          </div>
        )}

        {/* Open-book vs Closed-book policy bar */}
        {session.open_book ? (
          <div className="bento-card space-y-2 border-accent/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-ink">
                <BookOpen className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  <strong>Permitted References:</strong>{" "}
                  {session.allowed_refs.join(", ") ||
                    `${activeJurisdiction.edition} ${activeJurisdiction.code_family}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpenBookGuideOpen((prev) => !prev)}
                aria-expanded={openBookGuideOpen}
                className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border bg-elevated px-3 text-caption text-ink"
              >
                Code Section Index
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-150 ${
                    openBookGuideOpen ? "rotate-180" : ""
                  }`}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            </div>
            {openBookGuideOpen && (
              <div className="grid grid-cols-1 gap-2 border-t border-border/60 pt-2 text-caption text-muted sm:grid-cols-2">
                {topics.map((t) => (
                  <div key={t.id} className="rounded-lg bg-bg/70 px-3 py-1.5">
                    <span className="font-semibold text-ink">{t.title}:</span>{" "}
                    <span>{t.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Closed book strictly omits all lookup tools */
          <div className="sr-only">Closed book exam — reference tools hidden.</div>
        )}

        {errorBanner && (
          <div
            role="alert"
            className="bento-card border-error/60 bg-error/10 text-sm text-ink"
          >
            {errorBanner}
          </div>
        )}

        {phase === "review" ? (
          <section className="bento-card space-y-5">
            <div className="space-y-1">
              <span className="text-caption uppercase tracking-wider text-accent">
                Pre-Submit Check
              </span>
              <h2 className="text-h2 text-ink">Review Before Grading</h2>
              <p className="text-sm text-muted">
                No answers or correctness are revealed until you submit the exam for server-side grading.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center tabular-nums">
              <div className="rounded-xl border border-border bg-bg/70 p-3">
                <p className="text-caption text-muted">Answered</p>
                <p className="text-h2 text-ink">{answeredCount}</p>
              </div>
              <div className="rounded-xl border border-border bg-bg/70 p-3">
                <p className="text-caption text-muted">Unanswered</p>
                <p className="text-h2 text-primary">{unansweredCount}</p>
              </div>
              <div className="rounded-xl border border-border bg-bg/70 p-3">
                <p className="text-caption text-muted">Flagged</p>
                <p className="text-h2 text-accent">{flaggedIds.length}</p>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {questions.map((q, idx) => {
                const isAns = Boolean(answers[q.id]);
                const isFlg = flaggedSet.has(q.id);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => void handleJumpToQuestion(idx)}
                    aria-label={`Jump to question ${idx + 1}, ${isAns ? "answered" : "unanswered"}${isFlg ? ", flagged" : ""}`}
                    className={`relative flex min-h-12 items-center justify-center rounded-xl border font-mono text-sm font-semibold tabular-nums ${
                      isFlg
                        ? "border-primary bg-primary/15 text-ink"
                        : isAns
                          ? "border-accent/50 bg-elevated text-ink"
                          : "border-border bg-bg/60 text-muted"
                    }`}
                  >
                    {idx + 1}
                    {isFlg && (
                      <Flag
                        className="absolute right-1 top-1 h-3 w-3 text-primary"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
              <button
                type="button"
                onClick={() => setPhase("exam")}
                className="btn-secondary"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Return to Questions
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleSubmitExam(false)}
                className="btn-primary"
              >
                {isSubmitting ? "Grading..." : "Submit Exam for Grading"}
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Active Question Card */}
            {currentQuestion && (
              <article className="bento-card space-y-5 lg:col-span-8">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
                  <div>
                    <p className="tabular-nums text-sm font-semibold text-ink">
                      Question {currentIndex + 1} of {questions.length}
                    </p>
                    <p className="text-caption text-muted">
                      {topicTitleMap.get(currentQuestion.topic_id)?.title ??
                        "Plumbing Code"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleToggleFlag()}
                    aria-pressed={flaggedSet.has(currentQuestion.id)}
                    className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium ${
                      flaggedSet.has(currentQuestion.id)
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-bg/70 text-muted hover:text-ink"
                    }`}
                  >
                    <Flag className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    {flaggedSet.has(currentQuestion.id) ? "Flagged" : "Flag"}
                  </button>
                </div>

                <p className="text-h3 leading-relaxed text-ink">
                  {currentQuestion.stem}
                </p>

                <div
                  role="radiogroup"
                  aria-label="Mock exam answer choices"
                  className="space-y-2.5"
                >
                  {currentQuestion.options.map((opt, idx) => {
                    const isSelected =
                      answers[currentQuestion.id]?.selected_index === idx;
                    return (
                      <button
                        key={`${currentQuestion.id}-opt-${idx}`}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => void handleSelectAnswer(idx)}
                        className={`flex min-h-14 w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-base transition-colors duration-150 ${
                          isSelected
                            ? "border-accent bg-elevated text-ink"
                            : "border-border bg-bg/70 text-ink hover:border-accent/60"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-mono text-sm font-semibold ${
                            isSelected
                              ? "border-accent bg-accent/20 text-accent"
                              : "border-border bg-card text-muted"
                          }`}
                        >
                          {OPTION_LETTERS[idx] ?? idx + 1}
                        </span>
                        <span className="leading-snug">{opt}</span>
                      </button>
                    );
                  })}
                </div>

                <QuestionReviewBar
                  questionId={currentQuestion.id}
                  reviewedAt={currentQuestion.reviewed_at}
                  codeFamily={currentQuestion.code_family}
                  edition={currentQuestion.edition}
                  codeRef={currentQuestion.code_ref}
                  compact
                />

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={currentIndex === 0}
                      onClick={() => void handleJumpToQuestion(currentIndex - 1)}
                      className="btn-secondary"
                    >
                      <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhase("review")}
                      className="btn-secondary"
                    >
                      Review ({unansweredCount} left)
                    </button>
                  </div>

                  {currentIndex + 1 < questions.length ? (
                    <button
                      type="button"
                      onClick={() => void handleJumpToQuestion(currentIndex + 1)}
                      className="btn-primary"
                    >
                      Next Question
                      <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPhase("review")}
                      className="btn-primary"
                    >
                      Review &amp; Submit
                      <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </article>
            )}

            {/* Navigator Grid with Flag States */}
            <aside
              aria-label="Question navigator"
              className="bento-card space-y-3 lg:col-span-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-h3 text-ink">Navigator</h2>
                <span className="text-caption text-muted tabular-nums">
                  {answeredCount}/{questions.length}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "unanswered", label: `Open (${unansweredCount})` },
                    { id: "flagged", label: `Flag (${flaggedIds.length})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setNavFilter(tab.id)}
                    className={`min-h-10 rounded-lg border px-2 text-caption transition-colors ${
                      navFilter === tab.id
                        ? "border-accent bg-elevated text-ink"
                        : "border-border/60 bg-bg/60 text-muted"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, idx) => {
                  const isAns = Boolean(answers[q.id]);
                  const isFlg = flaggedSet.has(q.id);
                  const isCurrent = idx === currentIndex;

                  if (navFilter === "unanswered" && isAns) return null;
                  if (navFilter === "flagged" && !isFlg) return null;

                  return (
                    <button
                      key={q.id}
                      type="button"
                      aria-current={isCurrent ? "step" : undefined}
                      aria-label={`Question ${idx + 1}, ${isAns ? "answered" : "unanswered"}${isFlg ? ", flagged" : ""}`}
                      onClick={() => void handleJumpToQuestion(idx)}
                      className={`relative flex min-h-12 items-center justify-center rounded-xl border font-mono text-sm font-semibold tabular-nums transition-colors duration-150 ${
                        isCurrent
                          ? "border-accent bg-accent/20 text-ink ring-1 ring-accent"
                          : isFlg
                            ? "border-primary bg-primary/15 text-ink"
                            : isAns
                              ? "border-border bg-elevated text-ink"
                              : "border-border/60 bg-bg/60 text-muted"
                      }`}
                    >
                      {idx + 1}
                      {isFlg && (
                        <Flag
                          className="absolute right-1 top-1 h-3 w-3 text-primary"
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 3. RESULTS SCREEN (SERVER-GRADED)
  // =========================================================================
  if (phase === "results" && result) {
    return (
      <div className="space-y-4">
        <article className="bento-card space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <span className="text-caption uppercase tracking-wider text-accent">
                Server-Graded Result · {activeJurisdiction.state}{" "}
                {activeJurisdiction.code_family} {activeJurisdiction.edition}
              </span>
              <h1 className="text-hero tabular-nums text-ink">
                {result.score_pct}%
              </h1>
              <p className="text-sm text-muted tabular-nums">
                {result.correct_count} of {result.total_questions} correct · Pass threshold{" "}
                {result.pass_pct}%
              </p>
            </div>

            <span
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${
                result.passed
                  ? "border-success/60 bg-success/15 text-success"
                  : "border-error/60 bg-error/15 text-error"
              }`}
            >
              {result.passed ? (
                <>
                  <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  PASSED
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  NOT PASSED
                </>
              )}
            </span>
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-bg/70 p-3.5">
              <dt className="text-caption text-muted">Answered</dt>
              <dd className="mt-1 tabular-nums text-h2 text-ink">
                {result.answered_count} / {result.total_questions}
              </dd>
            </div>
            <div className="rounded-xl border border-border/70 bg-bg/70 p-3.5">
              <dt className="text-caption text-muted">Avg time per question</dt>
              <dd className="mt-1 tabular-nums text-h2 text-ink">
                {formatDurationSeconds(result.avg_time_per_question_ms)}
              </dd>
            </div>
            <div className="rounded-xl border border-border/70 bg-bg/70 p-3.5">
              <dt className="text-caption text-muted">Total recorded time</dt>
              <dd className="mt-1 tabular-nums text-h2 text-ink">
                {formatCountdown(result.total_time_ms)}
              </dd>
            </div>
          </dl>

          <div className="space-y-3 border-t border-border/70 pt-4">
            <h2 className="text-h3 text-ink">
              Topic Breakdown (Weakest First)
            </h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {result.topic_breakdown.map((item) => (
                <div
                  key={item.topic_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-bg/60 p-3"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-elevated text-accent">
                      <TopicPlumbingIcon slug={item.slug} className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {item.title}
                      </p>
                      <p className="tabular-nums text-caption text-muted">
                        {item.correct}/{item.total} correct · Avg{" "}
                        {formatDurationSeconds(item.avg_time_ms)}/Q
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-sm font-bold tabular-nums ${
                      item.accuracy_pct >= result.pass_pct
                        ? "text-success"
                        : "text-error"
                    }`}
                  >
                    {item.accuracy_pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowReviewDetail((prev) => !prev)}
                className="btn-secondary"
              >
                {showReviewDetail ? "Hide Item Review" : "Inspect Graded Items"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setSession(null);
                  setPhase("lobby");
                }}
                className="btn-secondary"
              >
                New Mock Exam
              </button>
            </div>

            <Link href="/practice?mode=weak_spots" className="btn-primary">
              Practice my weakest topics
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
        </article>

        {showReviewDetail && (
          <section className="space-y-3">
            <h2 className="text-h2 text-ink">Post-Submit Item Review</h2>
            {result.question_review.map((item, idx) => (
              <article
                key={item.question_id}
                className={`bento-card space-y-2 ${
                  item.is_correct ? "border-success/40" : "border-error/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-caption">
                  <span className="font-mono text-muted">
                    Q{idx + 1} · {item.code_ref} ·{" "}
                    {formatDurationSeconds(item.time_ms)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      item.is_correct ? "text-success" : "text-error"
                    }`}
                  >
                    {item.is_correct ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        Correct
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        Incorrect
                      </>
                    )}
                  </span>
                </div>
                <p className="text-base font-medium text-ink">{item.stem}</p>
                <p className="text-sm text-muted">
                  Your answer:{" "}
                  <strong className="text-ink">
                    {item.selected_index !== null
                      ? item.options[item.selected_index]
                      : "Unanswered"}
                  </strong>{" "}
                  · Correct:{" "}
                  <strong className="text-success">
                    {item.options[item.correct_index]}
                  </strong>
                </p>
                <p className="text-sm text-muted">{item.explanation_seed}</p>
                <p className="text-caption text-muted">
                  Verify against your adopted code. Not legal advice.
                </p>
                <QuestionReviewBar
                  questionId={item.question_id}
                  reviewedAt={item.reviewed_at}
                  codeFamily={item.code_family}
                  edition={item.edition}
                  codeRef={item.code_ref}
                  compact
                />
              </article>
            ))}
          </section>
        )}
      </div>
    );
  }

  return null;
}
