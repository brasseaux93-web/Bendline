"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { generateUuid } from "@/lib/utils";
import {
  AlertTriangle,
  BookmarkCheck,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  ExternalLink,
  Lock,
  PauseCircle,
  Play,
  Plus,
  Search,
  Tag,
  Timer,
  XCircle,
} from "lucide-react";
import { RadioCard } from "@/components/practice/radio-card";
import { useAppState } from "@/components/providers/app-state-provider";
import {
  type ForegroundTimerState,
  type NavAttemptRecord,
  type NavDrillPrompt,
  type NavDrillType,
  type OutlineNodeKind,
  type OutlineNodeRecord,
  buildOutlineTree,
  buildTabbingGuide,
  completeForegroundTimer,
  computeChapterLookupMetrics,
  computeOverallNavMetrics,
  createCustomOutlineNodeSchema,
  createForegroundTimer,
  evaluateNavAttempt,
  filterOutlineForJurisdiction,
  formatLookupMs,
  generateNavDrillQueue,
  getElapsedForegroundMs,
  isNavigationTrainerEnabled,
  pauseForBackground,
  resumeFromBackground,
} from "@/lib/nav";
import { MOTION_VARIANTS } from "@/lib/motion";

type ActiveNavTab = NavDrillType | "tabbing_guide";

const DRILL_TABS: { id: ActiveNavTab; label: string }[] = [
  { id: "where_is_it", label: "Where Is It?" },
  { id: "timed_find", label: "Timed Find" },
  { id: "index_term", label: "Index-Term Choice" },
  { id: "tabbing_guide", label: "Tabbing Guide" },
];

const PACE_OPTIONS: { label: string; ms: number | undefined }[] = [
  { label: "Node Default", ms: undefined },
  { label: "30s Target", ms: 30_000 },
  { label: "20s Target", ms: 20_000 },
  { label: "12s Sprint", ms: 12_000 },
];

export function NavigationTrainerWorkspace() {
  const searchParams = useSearchParams();
  const initialChapterParam = searchParams.get("chapter");

  const {
    activeJurisdiction,
    jurisdictions,
    topics,
    outlineNodes,
    navAttempts,
    selectJurisdiction,
    recordNavAttempt,
    saveCustomOutlineNode,
  } = useAppState();

  const trainerEnabled = isNavigationTrainerEnabled(activeJurisdiction);
  const openBookJurisdictions = useMemo(
    () => jurisdictions.filter((j) => j.open_book === true),
    [jurisdictions]
  );

  const scopedNodes = useMemo(
    () => filterOutlineForJurisdiction(outlineNodes, activeJurisdiction),
    [activeJurisdiction, outlineNodes]
  );

  const outlineTree = useMemo(
    () => buildOutlineTree(scopedNodes),
    [scopedNodes]
  );

  const [activeTab, setActiveTab] = useState<ActiveNavTab>("where_is_it");
  const [chapterFilterId, setChapterFilterId] = useState<string>(
    initialChapterParam ?? "all"
  );
  const [timedTargetMs, setTimedTargetMs] = useState<number | undefined>(
    undefined
  );
  const [queueSeed, setQueueSeed] = useState<number>(101);
  const [drillIndex, setDrillIndex] = useState<number>(0);

  // Sync URL ?chapter= when navigated from Progress breakdown
  useEffect(() => {
    if (
      initialChapterParam &&
      outlineTree.chapters.some((c) => c.chapter.id === initialChapterParam)
    ) {
      setChapterFilterId(initialChapterParam);
      setDrillIndex(0);
    }
  }, [initialChapterParam, outlineTree.chapters]);

  // Reset chapter filter if switching code family / edition invalidates ID
  useEffect(() => {
    if (
      chapterFilterId !== "all" &&
      !outlineTree.chapters.some((c) => c.chapter.id === chapterFilterId)
    ) {
      setChapterFilterId("all");
    }
  }, [chapterFilterId, outlineTree.chapters]);

  const activeDrillType: NavDrillType =
    activeTab === "tabbing_guide" ? "where_is_it" : activeTab;

  const drillQueue: NavDrillPrompt[] = useMemo(() => {
    if (!trainerEnabled || activeTab === "tabbing_guide") return [];
    return generateNavDrillQueue(scopedNodes, activeDrillType, {
      count: 8,
      chapterId: chapterFilterId === "all" ? null : chapterFilterId,
      seed: queueSeed,
      targetTimeOverrideMs:
        activeDrillType === "timed_find" ? timedTargetMs : undefined,
    });
  }, [
    activeDrillType,
    activeTab,
    chapterFilterId,
    queueSeed,
    scopedNodes,
    timedTargetMs,
    trainerEnabled,
  ]);

  const currentPrompt = drillQueue[drillIndex] ?? null;

  // Collapsible outline chapters state
  const [collapsedChapterIds, setCollapsedChapterIds] = useState<Set<string>>(
    () => new Set()
  );
  const [showChapterHint, setShowChapterHint] = useState<boolean>(false);

  // Per-drill attempt states
  const [wrongNodeIds, setWrongNodeIds] = useState<string[]>([]);
  const [wrongIndexOptions, setWrongIndexOptions] = useState<number[]>([]);
  const [selectedIndexOption, setSelectedIndexOption] = useState<number | null>(
    null
  );
  const [completedAttempt, setCompletedAttempt] =
    useState<NavAttemptRecord | null>(null);
  const [wrongFeedbackText, setWrongFeedbackText] = useState<string | null>(
    null
  );

  // Monotonic foreground-only timer tracking
  const timerStateRef = useRef<ForegroundTimerState>(
    createForegroundTimer(typeof performance !== "undefined" ? performance.now() : 0)
  );
  const [elapsedDisplayMs, setElapsedDisplayMs] = useState<number>(0);
  const [isPausedBackground, setIsPausedBackground] = useState<boolean>(false);
  const [pauseCount, setPauseCount] = useState<number>(0);

  const resetTimerForPrompt = useCallback(() => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const isHidden =
      typeof document !== "undefined" && document.visibilityState === "hidden";
    let next = createForegroundTimer(now);
    if (isHidden) {
      next = pauseForBackground(next, now);
    }
    timerStateRef.current = next;
    setElapsedDisplayMs(0);
    setIsPausedBackground(next.isPaused);
    setPauseCount(next.pauseCount);
  }, []);

  // Restart foreground stopwatch when active drill changes
  useEffect(() => {
    if (!trainerEnabled || activeTab === "tabbing_guide" || !currentPrompt) {
      return;
    }
    setWrongNodeIds([]);
    setWrongIndexOptions([]);
    setSelectedIndexOption(null);
    setCompletedAttempt(null);
    setWrongFeedbackText(null);
    setShowChapterHint(false);
    resetTimerForPrompt();
  }, [
    activeTab,
    currentPrompt,
    drillIndex,
    queueSeed,
    resetTimerForPrompt,
    trainerEnabled,
  ]);

  // Pause stopwatch whenever tab is backgrounded or hidden, resume when foregrounded
  useEffect(() => {
    if (
      !trainerEnabled ||
      activeTab === "tabbing_guide" ||
      !currentPrompt ||
      completedAttempt !== null
    ) {
      return;
    }

    function syncVisibility(hidden: boolean) {
      const now = performance.now();
      if (hidden) {
        const paused = pauseForBackground(timerStateRef.current, now);
        timerStateRef.current = paused;
        setIsPausedBackground(true);
        setPauseCount(paused.pauseCount);
        setElapsedDisplayMs(getElapsedForegroundMs(paused, now));
      } else {
        const resumed = resumeFromBackground(timerStateRef.current, now);
        timerStateRef.current = resumed;
        setIsPausedBackground(false);
        setElapsedDisplayMs(getElapsedForegroundMs(resumed, now));
      }
    }

    function handleVisibilityChange() {
      syncVisibility(document.visibilityState === "hidden");
    }

    function handlePageHide() {
      syncVisibility(true);
    }

    function handlePageShow() {
      syncVisibility(document.visibilityState === "hidden");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    const intervalId = window.setInterval(() => {
      if (!timerStateRef.current.isPaused) {
        setElapsedDisplayMs(
          getElapsedForegroundMs(timerStateRef.current, performance.now())
        );
      }
    }, 100);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      window.clearInterval(intervalId);
    };
  }, [activeTab, completedAttempt, currentPrompt, trainerEnabled]);

  // Tabbing guide derived from jurisdiction + outline tables
  const tabbingGuide = useMemo(
    () => buildTabbingGuide(activeJurisdiction, outlineNodes),
    [activeJurisdiction, outlineNodes]
  );

  // Metrics scoped to current jurisdiction
  const overallMetrics = useMemo(
    () => computeOverallNavMetrics(navAttempts, activeJurisdiction.id),
    [activeJurisdiction.id, navAttempts]
  );

  const chapterMetrics = useMemo(
    () =>
      computeChapterLookupMetrics(
        scopedNodes,
        navAttempts,
        activeJurisdiction.id
      ),
    [activeJurisdiction.id, navAttempts, scopedNodes]
  );

  // Custom outline node drawer state
  const [showCustomForm, setShowCustomForm] = useState<boolean>(false);
  const [customKind, setCustomKind] = useState<OutlineNodeKind>("section");
  const [customParentId, setCustomParentId] = useState<string>(
    outlineTree.chapters[0]?.chapter.id ?? ""
  );
  const [customCodeRef, setCustomCodeRef] = useState<string>("");
  const [customTitle, setCustomTitle] = useState<string>("");
  const [customSummary, setCustomSummary] = useState<string>("");
  const [customIndexTerms, setCustomIndexTerms] = useState<string>("");
  const [customCue, setCustomCue] = useState<string>("");
  const [customTargetSec, setCustomTargetSec] = useState<string>("20");
  const [customStatusMsg, setCustomStatusMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  useEffect(() => {
    if (
      !outlineTree.chapters.some((c) => c.chapter.id === customParentId) &&
      outlineTree.chapters[0]
    ) {
      setCustomParentId(outlineTree.chapters[0].chapter.id);
    }
  }, [customParentId, outlineTree.chapters]);

  async function finalizePromptSuccess(wrongCount: number) {
    if (!currentPrompt || completedAttempt) return;
    const now = performance.now();
    const { elapsedMs, paused } = completeForegroundTimer(
      timerStateRef.current,
      now
    );
    timerStateRef.current = paused;
    setElapsedDisplayMs(elapsedMs);

    const record = evaluateNavAttempt({
      jurisdictionId: activeJurisdiction.id,
      prompt: currentPrompt,
      wrongGuesses: wrongCount,
      elapsedMs,
    });
    setCompletedAttempt(record);
    setWrongFeedbackText(null);
    await recordNavAttempt(record);
  }

  function handleSelectOutlineNode(node: OutlineNodeRecord) {
    if (!currentPrompt || completedAttempt) return;

    if (node.id === currentPrompt.targetNode.id) {
      void finalizePromptSuccess(wrongNodeIds.length);
      return;
    }

    if (!wrongNodeIds.includes(node.id)) {
      setWrongNodeIds((prev) => [...prev, node.id]);
    }
    setWrongFeedbackText(
      `${node.code_ref} (${node.title}) does not contain this requirement — check another section.`
    );
  }

  function handleSelectIndexOption(optIndex: number) {
    if (!currentPrompt || completedAttempt) return;
    if (currentPrompt.correctOptionIndex === undefined) return;

    setSelectedIndexOption(optIndex);
    if (optIndex === currentPrompt.correctOptionIndex) {
      void finalizePromptSuccess(wrongIndexOptions.length);
      return;
    }

    if (!wrongIndexOptions.includes(optIndex)) {
      setWrongIndexOptions((prev) => [...prev, optIndex]);
    }
    const chosenLabel = currentPrompt.options?.[optIndex] ?? "Option";
    setWrongFeedbackText(
      `"${chosenLabel}" points to a different topic — try another index heading.`
    );
  }

  function handleAdvanceNextDrill() {
    if (drillIndex + 1 < drillQueue.length) {
      setDrillIndex((i) => i + 1);
    } else {
      setDrillIndex(0);
      setQueueSeed((s) => s + 1);
    }
  }

  function toggleChapterCollapse(chapterId: string) {
    setCollapsedChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }

  async function handleSaveCustomNode(e: React.FormEvent) {
    e.preventDefault();
    setCustomStatusMsg(null);

    const terms = customIndexTerms
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const parentChapter =
      outlineTree.chapters.find((c) => c.chapter.id === customParentId)
        ?.chapter ?? null;

    const payload = {
      topic_id: parentChapter?.topic_id ?? topics[0]?.id ?? "22222222-2222-4222-8222-222222222201",
      parent_id: customKind === "chapter" ? null : customParentId || null,
      code_family: activeJurisdiction.code_family,
      edition: activeJurisdiction.edition,
      code_ref: customCodeRef,
      title: customTitle,
      summary_md: customSummary,
      node_kind: customKind,
      index_terms: terms.length > 0 ? terms : [customTitle.trim()],
      lookup_cues: customCue.trim()
        ? [customCue.trim()]
        : [`Locate ${customTitle.trim()} in ${customCodeRef.trim()}.`],
      target_time_ms: Math.max(
        5000,
        Math.min(180000, Math.round((Number(customTargetSec) || 20) * 1000))
      ),
    };

    const parsed = createCustomOutlineNodeSchema.safeParse(payload);
    if (!parsed.success) {
      setCustomStatusMsg({
        ok: false,
        text: parsed.error.issues[0]?.message ?? "Check custom node fields.",
      });
      return;
    }

    const newNode: OutlineNodeRecord = {
      id: generateUuid(),
      jurisdiction_id: activeJurisdiction.id,
      display_order: scopedNodes.length + 1200,
      ...parsed.data,
    };

    await saveCustomOutlineNode(newNode);
    setCustomCodeRef("");
    setCustomTitle("");
    setCustomSummary("");
    setCustomIndexTerms("");
    setCustomCue("");
    setShowCustomForm(false);
    setQueueSeed((s) => s + 1);
    setDrillIndex(0);
    setCustomStatusMsg({
      ok: true,
      text: `Saved paraphrased outline node "${newNode.code_ref} · ${newNode.title}" offline.`,
    });
  }

  // Strictly gate closed-book jurisdictions (e.g. Texas IPC / California UPC)
  if (!trainerEnabled) {
    const primaryOpenBook = openBookJurisdictions[0] ?? null;
    return (
      <div className="space-y-4">
        <div>
          <span className="text-caption uppercase tracking-wider text-accent">
            Open-Book Navigation Trainer · {activeJurisdiction.state}{" "}
            {activeJurisdiction.code_family} {activeJurisdiction.edition}
          </span>
          <h1 className="text-h1 text-ink">
            Navigation Trainer Disabled for Closed-Book Exam
          </h1>
        </div>

        <section
          aria-labelledby="closed-book-gate-heading"
          className="bento-card space-y-4 border-primary/50"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 text-primary">
              <Lock className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="space-y-1.5">
              <h2 id="closed-book-gate-heading" className="text-h2 text-ink">
                {activeJurisdiction.name} ({activeJurisdiction.state}) is Closed-Book
              </h2>
              <p className="text-sm text-muted">
                This trainer is active only when{" "}
                <code className="font-mono text-ink">jurisdictions.open_book</code>{" "}
                is <code className="font-mono text-ink">true</code>. Because{" "}
                {activeJurisdiction.name} administers a closed-book{" "}
                {activeJurisdiction.code_family} {activeJurisdiction.edition} exam
                ({activeJurisdiction.exam_vendor}), timed code-book lookup drills
                and tabbing guides are disabled for this state.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-bg/60 px-3.5 py-2.5 text-caption text-muted">
            <span>
              Last verified:{" "}
              {activeJurisdiction.last_verified_at
                ? activeJurisdiction.last_verified_at.slice(0, 10)
                : "Pending verification"}
            </span>
            {activeJurisdiction.bulletin_url && (
              <a
                href={activeJurisdiction.bulletin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
              >
                Verify vendor bulletin ({activeJurisdiction.exam_vendor})
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              </a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {primaryOpenBook && (
              <button
                type="button"
                onClick={() => void selectJurisdiction(primaryOpenBook.id)}
                className="btn-primary"
              >
                Switch to {primaryOpenBook.name} (Open Book)
              </button>
            )}
            <Link href="/practice" className="btn-secondary">
              Practice Closed-Book Recall
            </Link>
            <Link href="/onboarding" className="btn-secondary">
              Jurisdiction Settings
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-caption uppercase tracking-wider text-accent">
            Open-Book Code Navigation · {activeJurisdiction.code_family}{" "}
            {activeJurisdiction.edition}
          </span>
          <h1 className="text-h1 text-ink">Code Navigation &amp; Tabbing Lab</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-3 text-caption tabular-nums text-muted">
            <Timer className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
            <span>
              Median:{" "}
              <strong className="text-ink">
                {formatLookupMs(overallMetrics.medianMs)}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              First-try:{" "}
              <strong className="text-success">
                {overallMetrics.firstTryAccuracyPct !== null
                  ? `${overallMetrics.firstTryAccuracyPct}%`
                  : "—"}
              </strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowCustomForm((prev) => !prev)}
            className="btn-secondary min-h-12 px-3 text-sm"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Add Outline Node
          </button>
        </div>
      </div>

      {/* Mode Tabs + Filters */}
      <div className="bento-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Navigation drill mode"
            className="flex flex-wrap gap-1.5"
          >
            {DRILL_TABS.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setDrillIndex(0);
                  }}
                  className={`min-h-12 rounded-xl border px-3.5 text-sm font-semibold transition-colors ${
                    selected
                      ? "border-accent bg-elevated text-ink"
                      : "border-border/70 bg-bg/60 text-muted hover:text-ink"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab !== "tabbing_guide" && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="nav-chapter-filter" className="text-caption text-muted">
                Chapter
              </label>
              <select
                id="nav-chapter-filter"
                value={chapterFilterId}
                onChange={(e) => {
                  setChapterFilterId(e.target.value);
                  setDrillIndex(0);
                }}
                className="min-h-12 rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
              >
                <option value="all">
                  All Chapters ({outlineTree.chapters.length})
                </option>
                {outlineTree.chapters.map(({ chapter }) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.code_ref} · {chapter.title}
                  </option>
                ))}
              </select>

              {activeTab === "timed_find" && (
                <>
                  <label htmlFor="nav-pace-select" className="text-caption text-muted">
                    Target
                  </label>
                  <select
                    id="nav-pace-select"
                    value={timedTargetMs ?? "default"}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTimedTargetMs(
                        val === "default" ? undefined : Number(val)
                      );
                    }}
                    className="min-h-12 rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
                  >
                    {PACE_OPTIONS.map((p) => (
                      <option key={p.label} value={p.ms ?? "default"}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}
        </div>

        {/* Optional Custom Paraphrased Outline Node Form */}
        {showCustomForm && (
          <form
            onSubmit={handleSaveCustomNode}
            className="space-y-3 rounded-xl border border-accent/40 bg-bg/60 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-h3 text-ink">
                Add Custom Paraphrased Outline Node
              </h2>
              <span className="text-caption text-muted">
                Original study labels only · Saved offline in Dexie
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <label htmlFor="custom-kind" className="block text-caption text-muted">
                  Node Kind
                </label>
                <select
                  id="custom-kind"
                  value={customKind}
                  onChange={(e) =>
                    setCustomKind(e.target.value as OutlineNodeKind)
                  }
                  className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
                >
                  <option value="section">Section</option>
                  <option value="table">Table</option>
                  <option value="chapter">Chapter</option>
                </select>
              </div>

              {customKind !== "chapter" && (
                <div className="space-y-1">
                  <label htmlFor="custom-parent" className="block text-caption text-muted">
                    Parent Chapter
                  </label>
                  <select
                    id="custom-parent"
                    value={customParentId}
                    onChange={(e) => setCustomParentId(e.target.value)}
                    className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
                  >
                    {outlineTree.chapters.map(({ chapter }) => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.code_ref} · {chapter.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="custom-ref" className="block text-caption text-muted">
                  Code Pointer Label
                </label>
                <input
                  id="custom-ref"
                  type="text"
                  required
                  value={customCodeRef}
                  onChange={(e) => setCustomCodeRef(e.target.value)}
                  placeholder="e.g. IPC Ch. 7 · Indirect Waste"
                  className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink placeholder:text-muted"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="custom-target" className="block text-caption text-muted">
                  Target Time (sec)
                </label>
                <input
                  id="custom-target"
                  type="number"
                  min={5}
                  max={180}
                  value={customTargetSec}
                  onChange={(e) => setCustomTargetSec(e.target.value)}
                  className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 font-mono text-sm text-ink"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="custom-title" className="block text-caption text-muted">
                  Paraphrased Topic Title
                </label>
                <input
                  id="custom-title"
                  type="text"
                  required
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Indirect Waste Receptors & Air Breaks"
                  className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink placeholder:text-muted"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="custom-terms" className="block text-caption text-muted">
                  Index Search Terms (comma-separated)
                </label>
                <input
                  id="custom-terms"
                  type="text"
                  value={customIndexTerms}
                  onChange={(e) => setCustomIndexTerms(e.target.value)}
                  placeholder="Indirect piping, Air breaks, Floor sinks"
                  className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink placeholder:text-muted"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="custom-cue" className="block text-caption text-muted">
                Lookup Drill Cue
              </label>
              <input
                id="custom-cue"
                type="text"
                value={customCue}
                onChange={(e) => setCustomCue(e.target.value)}
                placeholder="Where do you locate minimum air break clearances for commercial dishwashers?"
                className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink placeholder:text-muted"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCustomForm(false)}
                className="btn-secondary min-h-12 px-4 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-secondary min-h-12 border-accent/60 px-4 text-sm text-accent"
              >
                Save Outline Node
              </button>
            </div>
          </form>
        )}

        {customStatusMsg && (
          <p
            role="status"
            className={`text-sm ${customStatusMsg.ok ? "text-success" : "text-error"}`}
          >
            {customStatusMsg.text}
          </p>
        )}
      </div>

      {/* Tabbing Guide View */}
      {activeTab === "tabbing_guide" ? (
        <section
          aria-labelledby="tabbing-guide-heading"
          className="space-y-4"
        >
          <div
            role="note"
            className="bento-card space-y-2 border-primary/60 bg-primary/10"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <div className="space-y-1.5">
                <h2 id="tabbing-guide-heading" className="text-h3 text-ink">
                  Verify Permitted Tabs in Your State Bulletin
                </h2>
                <p className="text-sm text-ink">
                  {tabbingGuide.bulletinVerificationNotice}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-caption text-muted">
                  <span>
                    Allowed refs:{" "}
                    <strong className="text-ink">
                      {tabbingGuide.allowedRefs.length > 0
                        ? tabbingGuide.allowedRefs.join(", ")
                        : `${activeJurisdiction.code_family} ${activeJurisdiction.edition}`}
                    </strong>
                  </span>
                  {tabbingGuide.lastVerifiedAt && (
                    <span>
                      Last verified: {tabbingGuide.lastVerifiedAt.slice(0, 10)}
                    </span>
                  )}
                  {tabbingGuide.bulletinUrl && (
                    <a
                      href={tabbingGuide.bulletinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                    >
                      Open {activeJurisdiction.state} Exam Bulletin
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {tabbingGuide.recommendedTabs.map((item) => (
              <article
                key={item.chapterRef}
                className="bento-card flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-accent">
                    <BookmarkCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    {item.chapterRef}
                  </span>
                  <span className="rounded-full border border-border bg-elevated px-2.5 py-0.5 text-caption text-muted">
                    {item.tabSide} · {item.tabColor}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-ink">{item.title}</h3>
                <p className="text-sm text-muted">{item.focusSummary}</p>
              </article>
            ))}
          </div>

          <div className="bento-card space-y-2">
            <h3 className="text-h3 text-ink">Exam-Day Tabbing Checklist</h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
              {tabbingGuide.examDayChecklist.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="pt-1 text-caption text-muted">
              {tabbingGuide.disclaimer}
            </p>
          </div>
        </section>
      ) : (
        /* Active Drill Area + Chapter Breakdown Grid */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            {currentPrompt ? (
              <AnimatePresence mode="wait">
                <motion.section
                  key={currentPrompt.id}
                  variants={MOTION_VARIANTS.questionSwap}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  aria-labelledby="nav-prompt-heading"
                  className="bento-card space-y-4"
                >
                  {/* Prompt Header & Foreground Stopwatch */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-caption uppercase tracking-wider text-accent">
                      {activeTab === "where_is_it"
                        ? "Where Is It?"
                        : activeTab === "timed_find"
                          ? "Timed Find"
                          : "Index-Term Choice"}{" "}
                      · Drill {drillIndex + 1} of {drillQueue.length}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      {isPausedBackground && (
                        <span
                          role="status"
                          className="inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2.5 py-0.5 text-caption text-primary"
                        >
                          <PauseCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          Paused while backgrounded
                        </span>
                      )}
                      {!isPausedBackground && pauseCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-2.5 py-0.5 text-caption text-muted">
                          <Play className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} aria-hidden="true" />
                          Background time excluded
                        </span>
                      )}

                      {currentPrompt.targetTimeMs !== null && (
                        <span className="rounded-full border border-primary/50 bg-primary/10 px-2.5 py-0.5 font-mono text-caption tabular-nums text-primary">
                          Target ≤ {formatLookupMs(currentPrompt.targetTimeMs)}
                        </span>
                      )}

                      <span
                        data-testid="nav-foreground-timer"
                        aria-label="Foreground lookup stopwatch"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-elevated px-3 py-1 font-mono text-sm font-semibold tabular-nums text-ink"
                      >
                        <Clock className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
                        {formatLookupMs(elapsedDisplayMs)}
                      </span>
                    </div>
                  </div>

                  {/* Cue Prompt */}
                  <div className="space-y-2">
                    <h2 id="nav-prompt-heading" className="text-h2 text-ink">
                      {activeTab === "index_term"
                        ? `Which index heading leads to "${currentPrompt.targetNode.code_ref} · ${currentPrompt.targetNode.title}"?`
                        : currentPrompt.cuePrompt}
                    </h2>
                    {activeTab === "index_term" && (
                      <p className="text-sm text-muted">
                        Topic cue: {currentPrompt.cuePrompt}
                      </p>
                    )}

                    {activeTab !== "index_term" && !completedAttempt && (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowChapterHint((v) => !v)}
                          className="text-caption font-semibold text-accent hover:underline"
                        >
                          {showChapterHint
                            ? `Chapter hint: ${currentPrompt.chapterNode.code_ref} (${currentPrompt.chapterNode.title})`
                            : "Need a chapter hint?"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Wrong Attempt Inline Feedback */}
                  {wrongFeedbackText && !completedAttempt && (
                    <div
                      role="status"
                      className="flex items-start gap-2 rounded-xl border border-error/50 bg-error/10 p-3 text-sm text-ink"
                    >
                      <XCircle
                        className="mt-0.5 h-4 w-4 shrink-0 text-error"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span>{wrongFeedbackText}</span>
                    </div>
                  )}

                  {/* Drill Body: Index-Term Choices OR Outline Picker */}
                  {activeTab === "index_term" && currentPrompt.options ? (
                    <div
                      role="radiogroup"
                      aria-label="Index search heading choices"
                      className="space-y-2"
                    >
                      {currentPrompt.options.map((opt, idx) => {
                        const isCorrectOpt =
                          idx === currentPrompt.correctOptionIndex;
                        const wasWrongPick = wrongIndexOptions.includes(idx);
                        const isRevealed =
                          completedAttempt !== null
                            ? isCorrectOpt || wasWrongPick
                            : wasWrongPick;

                        return (
                          <RadioCard
                            key={`${currentPrompt.id}-opt-${idx}`}
                            label={opt}
                            optionIndex={idx}
                            selected={selectedIndexOption === idx || wasWrongPick}
                            revealed={isRevealed}
                            isCorrectOption={isCorrectOpt}
                            disabled={completedAttempt !== null}
                            onSelect={() => handleSelectIndexOption(idx)}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-caption text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <Search className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} aria-hidden="true" />
                          Pick the paraphrased section or table node below:
                        </span>
                        <span className="font-mono tabular-nums">
                          {outlineTree.chapters.length} chapters
                        </span>
                      </div>

                      <div className="space-y-2">
                        {outlineTree.chapters.map(({ chapter, children }) => {
                          if (
                            chapterFilterId !== "all" &&
                            chapter.id !== chapterFilterId
                          ) {
                            return null;
                          }
                          const isCollapsed = collapsedChapterIds.has(chapter.id);

                          return (
                            <div
                              key={chapter.id}
                              className="overflow-hidden rounded-xl border border-border bg-bg/60"
                            >
                              <button
                                type="button"
                                aria-expanded={!isCollapsed}
                                onClick={() => toggleChapterCollapse(chapter.id)}
                                className="flex min-h-12 w-full items-center justify-between gap-2 bg-card/70 px-3.5 py-2 text-left transition-colors hover:bg-elevated/80"
                              >
                                <div className="flex items-center gap-2">
                                  {isCollapsed ? (
                                    <ChevronRight
                                      className="h-4 w-4 text-muted"
                                      strokeWidth={1.75}
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <ChevronDown
                                      className="h-4 w-4 text-accent"
                                      strokeWidth={1.75}
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span className="font-mono text-caption font-semibold text-accent">
                                    {chapter.code_ref}
                                  </span>
                                  <span className="text-sm font-semibold text-ink">
                                    {chapter.title}
                                  </span>
                                </div>
                                <span className="font-mono text-caption tabular-nums text-muted">
                                  {children.length} nodes
                                </span>
                              </button>

                              {!isCollapsed && (
                                <div className="divide-y divide-border/60 border-t border-border/60">
                                  {children.map((node) => {
                                    const isTarget =
                                      node.id === currentPrompt.targetNode.id;
                                    const isWrong = wrongNodeIds.includes(node.id);
                                    const isResolvedTarget =
                                      completedAttempt !== null && isTarget;

                                    return (
                                      <button
                                        key={node.id}
                                        type="button"
                                        disabled={completedAttempt !== null}
                                        onClick={() => handleSelectOutlineNode(node)}
                                        className={`flex min-h-12 w-full items-start justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                                          isResolvedTarget
                                            ? "bg-success/15 text-ink"
                                            : isWrong
                                              ? "bg-error/10 text-ink"
                                              : "hover:bg-elevated/60"
                                        }`}
                                      >
                                        <div className="space-y-0.5">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded border border-border bg-elevated px-1.5 py-0.5 font-mono text-caption uppercase text-muted">
                                              {node.node_kind}
                                            </span>
                                            <span className="font-mono text-caption text-accent">
                                              {node.code_ref}
                                            </span>
                                            <span className="text-sm font-medium text-ink">
                                              {node.title}
                                            </span>
                                          </div>
                                          <p className="text-caption text-muted">
                                            {node.summary_md}
                                          </p>
                                        </div>

                                        {isResolvedTarget && (
                                          <CheckCircle2
                                            className="mt-1 h-4 w-4 shrink-0 text-success"
                                            strokeWidth={1.75}
                                            aria-hidden="true"
                                          />
                                        )}
                                        {isWrong && !isResolvedTarget && (
                                          <XCircle
                                            className="mt-1 h-4 w-4 shrink-0 text-error"
                                            strokeWidth={1.75}
                                            aria-hidden="true"
                                          />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Completed Drill Summary + Sole Primary Action */}
                  {completedAttempt && (
                    <div className="space-y-3 rounded-xl border border-success/50 bg-success/10 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-semibold text-ink">
                          <CheckCircle2
                            className="h-5 w-5 text-success"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <span>
                            Located: {currentPrompt.chapterNode.code_ref} ·{" "}
                            {currentPrompt.targetNode.code_ref} (
                            {currentPrompt.targetNode.title})
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 font-mono text-caption tabular-nums">
                          <span className="rounded-lg border border-border bg-card px-2 py-0.5 text-ink">
                            {completedAttempt.elapsed_ms} ms (
                            {formatLookupMs(completedAttempt.elapsed_ms)})
                          </span>
                          <span
                            className={`rounded-lg border px-2 py-0.5 font-semibold ${
                              completedAttempt.first_try_correct
                                ? "border-success/50 bg-success/15 text-success"
                                : "border-primary/50 bg-primary/10 text-primary"
                            }`}
                          >
                            {completedAttempt.first_try_correct
                              ? "First-Try Accurate"
                              : `Resolved in ${completedAttempt.attempt_count} tries`}
                          </span>
                          {completedAttempt.met_target_time !== null && (
                            <span
                              className={`rounded-lg border px-2 py-0.5 font-semibold ${
                                completedAttempt.met_target_time
                                  ? "border-success/50 bg-success/15 text-success"
                                  : "border-primary/50 bg-primary/10 text-primary"
                              }`}
                            >
                              {completedAttempt.met_target_time
                                ? "Under Target Time"
                                : "Over Target Time"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5 text-caption text-muted">
                          <Tag className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} aria-hidden="true" />
                          <span>Index terms:</span>
                          {currentPrompt.targetNode.index_terms.map((term) => (
                            <span
                              key={term}
                              className="rounded border border-border bg-card px-2 py-0.5 text-ink"
                            >
                              {term}
                            </span>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={handleAdvanceNextDrill}
                          className="btn-primary"
                        >
                          {drillIndex + 1 < drillQueue.length
                            ? "Next Drill"
                            : "New Drill Set"}
                        </button>
                      </div>
                    </div>
                  )}
                </motion.section>
              </AnimatePresence>
            ) : (
              <div className="bento-card space-y-2 text-sm text-muted">
                <p>
                  No paraphrased outline nodes match the current chapter filter.
                  Switch to All Chapters or add an outline node above.
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Live Chapter Lookup Medians */}
          <aside className="space-y-4 lg:col-span-4">
            <div className="bento-card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-h3 text-ink">Chapter Lookup Medians</h2>
                <Link
                  href="/progress"
                  className="text-caption font-semibold text-accent hover:underline"
                >
                  Full Progress →
                </Link>
              </div>

              <div className="space-y-2">
                {chapterMetrics.map((m) => (
                  <div
                    key={m.chapter.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-bg/60 px-3 py-2 text-caption"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono font-semibold text-accent">
                        {m.chapter.code_ref}
                      </p>
                      <p className="truncate text-ink">{m.chapter.title}</p>
                    </div>
                    <div className="shrink-0 text-right font-mono tabular-nums">
                      <p className="font-semibold text-ink">
                        {formatLookupMs(m.medianMs)}
                      </p>
                      <p className="text-muted">
                        {m.firstTryAccuracyPct !== null
                          ? `${m.firstTryAccuracyPct}% · ${m.totalAttempts}x`
                          : "—"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bento-card space-y-2">
              <div className="flex items-center gap-2 text-accent">
                <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span className="text-caption uppercase tracking-wider font-semibold">
                  Open-Book Strategy
                </span>
              </div>
              <p className="text-caption text-muted">
                Build muscle memory mapping questions to their chapter and table
                before touching your physical code book. Backgrounded tab switches
                automatically pause your stopwatch.
              </p>
              <div className="flex items-center gap-2 pt-1 text-caption text-muted">
                <BookOpen className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setActiveTab("tabbing_guide")}
                  className="font-semibold text-accent hover:underline"
                >
                  Review bulletin-verified tabbing guide
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
