"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Download,
  FileCode2,
  GitBranch,
  History,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAppState } from "@/components/providers/app-state-provider";
import {
  DEFAULT_RUBRIC_SCORES,
  RUBRIC_CRITERIA,
  type ReviewItemKind,
  type ReviewItemStatus,
  type ReviewRecord,
  type ReviewVerdictAction,
  type ReviewableDrawingExercise,
  type ReviewableQuestion,
  type ReviewerRoleRecord,
  type RubricCriterionKey,
  type RubricScores,
  buildReviewQueueEntries,
  evaluateHardGates,
} from "@/lib/review";
import type { UserRole } from "@/lib/domain/types";

type AdminTab = "queue" | "roles" | "log";
type StatusFilter = "queue" | "published" | "archived" | "all";

interface ReviewApiSnapshot {
  questions: ReviewableQuestion[];
  drawingExercises: ReviewableDrawingExercise[];
  reviews: ReviewRecord[];
  reviewers: ReviewerRoleRecord[];
  currentUserId: string;
  currentUserName: string;
  currentRole: UserRole;
  canManageRoles: boolean;
  source: string;
}

const STATUS_BADGE: Record<ReviewItemStatus, string> = {
  draft: "border-border bg-elevated text-ink",
  revise: "border-primary/60 bg-primary/15 text-primary",
  reviewed: "border-accent/60 bg-accent/15 text-accent",
  published: "border-success/60 bg-success/15 text-success",
  flagged: "border-error/60 bg-error/15 text-error",
  archived: "border-border/60 bg-bg/60 text-muted",
};

export function ReviewQueueWorkspace() {
  const { topics } = useAppState();
  const topicMap = useMemo(
    () => new Map(topics.map((t) => [t.id, t])),
    [topics]
  );

  const [snapshot, setSnapshot] = useState<ReviewApiSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("queue");

  // Queue Filters
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<"all" | ReviewItemKind>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("queue");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Rubric Form State
  const [licenseNo, setLicenseNo] = useState<string>("TX-MP-41892");
  const [scores, setScores] = useState<RubricScores>(() => ({
    ...DEFAULT_RUBRIC_SCORES,
  }));
  const [calcVerified, setCalcVerified] = useState<boolean>(false);
  const [verdict, setVerdict] = useState<ReviewVerdictAction>("approve");
  const [comments, setComments] = useState<string>("");
  const [suggestedFix, setSuggestedFix] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // New Version Drawer State
  const [showVersionForm, setShowVersionForm] = useState<boolean>(false);
  const [versionTitleOrStem, setVersionTitleOrStem] = useState<string>("");
  const [versionPromptOrSeed, setVersionPromptOrSeed] = useState<string>("");

  // Role editor drafts
  const [roleDrafts, setRoleDrafts] = useState<
    Record<string, { role: UserRole; licenseNo: string }>
  >({});
  const [roleStatusMsg, setRoleStatusMsg] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/review", { cache: "no-store" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ReviewApiSnapshot;
      setSnapshot(data);

      const drafts: Record<string, { role: UserRole; licenseNo: string }> = {};
      for (const r of data.reviewers) {
        drafts[r.id] = { role: r.role, licenseNo: r.license_no ?? "" };
      }
      setRoleDrafts(drafts);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to load review queue."
      );
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const queueEntries = useMemo(() => {
    if (!snapshot) return [];
    return buildReviewQueueEntries({
      questions: snapshot.questions,
      drawingExercises: snapshot.drawingExercises,
      topicId: topicFilter === "all" ? null : topicFilter,
      kindFilter,
      statusFilter,
    });
  }, [kindFilter, snapshot, statusFilter, topicFilter]);

  const activeEntry = useMemo(() => {
    if (queueEntries.length === 0) return null;
    const match = queueEntries.find(
      (e) => `${e.kind}:${e.id}` === selectedKey
    );
    return match ?? queueEntries[0];
  }, [queueEntries, selectedKey]);

  const selectedQuestion = useMemo(() => {
    if (!snapshot || !activeEntry || activeEntry.kind !== "question") {
      return null;
    }
    return snapshot.questions.find((q) => q.id === activeEntry.id) ?? null;
  }, [activeEntry, snapshot]);

  const selectedExercise = useMemo(() => {
    if (!snapshot || !activeEntry || activeEntry.kind !== "drawing_exercise") {
      return null;
    }
    return (
      snapshot.drawingExercises.find((d) => d.id === activeEntry.id) ?? null
    );
  }, [activeEntry, snapshot]);

  // Reset form fields when active selected item changes
  useEffect(() => {
    setScores({ ...DEFAULT_RUBRIC_SCORES });
    setCalcVerified(false);
    setVerdict("approve");
    setComments("");
    setSuggestedFix("");
    setSubmitError(null);
    setShowVersionForm(false);

    if (selectedQuestion) {
      setVersionTitleOrStem(selectedQuestion.stem);
      setVersionPromptOrSeed(selectedQuestion.explanation_seed);
    } else if (selectedExercise) {
      setVersionTitleOrStem(selectedExercise.title);
      setVersionPromptOrSeed(selectedExercise.prompt_md);
    }
  }, [activeEntry?.id, activeEntry?.kind, activeEntry?.version, selectedExercise, selectedQuestion]);

  const liveGates = useMemo(() => {
    if (!activeEntry) return { passed: true, failures: [] };
    return evaluateHardGates({
      scores,
      itemType: activeEntry.itemType,
      calcIndependentlyVerified: calcVerified,
    });
  }, [activeEntry, calcVerified, scores]);

  function setCriterionScore(key: RubricCriterionKey, value: number) {
    setScores((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmitVerdict(e: React.FormEvent) {
    e.preventDefault();
    if (!snapshot || !activeEntry) return;
    setSubmitError(null);
    setSubmitSuccess(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/admin/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemKind: activeEntry.kind,
          itemId: activeEntry.id,
          itemTitle: activeEntry.title,
          itemVersion: activeEntry.version,
          itemType: activeEntry.itemType,
          topicId: activeEntry.topicId,
          codeFamily: activeEntry.codeFamily,
          edition: activeEntry.edition,
          reviewerId: snapshot.currentUserId,
          reviewerName: snapshot.currentUserName,
          licenseNo,
          scores,
          calcIndependentlyVerified: calcVerified,
          verdict,
          comments,
          suggestedFix,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        errors?: string[];
        error?: string;
        review?: ReviewRecord;
      };

      if (!res.ok || !data.ok) {
        throw new Error(
          data.errors?.join(" ") ?? data.error ?? "Review submission rejected."
        );
      }

      setSubmitSuccess(
        `Saved "${data.review?.verdict}" -> status "${data.review?.resulting_status}" (v${data.review?.item_version}).`
      );
      await loadSnapshot();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit review."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBumpNewVersion(e: React.FormEvent) {
    e.preventDefault();
    if (!activeEntry) return;
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const res = await fetch("/api/admin/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "new_version",
          itemKind: activeEntry.kind,
          itemId: activeEntry.id,
          titleOrStem: versionTitleOrStem,
          explanationOrPrompt: versionPromptOrSeed,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        updatedItem?: { version: number; status: string };
        errors?: string[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.errors?.join(" ") ?? "Version update failed.");
      }

      setShowVersionForm(false);
      setStatusFilter("queue");
      setSelectedKey(`${activeEntry.kind}:${activeEntry.id}`);
      setSubmitSuccess(
        `Created v${data.updatedItem?.version} — prior approval invalidated (status reset to "${data.updatedItem?.status}").`
      );
      await loadSnapshot();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Version creation failed."
      );
    }
  }

  async function handleSaveReviewerRole(userId: string) {
    const draft = roleDrafts[userId];
    if (!draft) return;
    setRoleStatusMsg(null);
    try {
      const res = await fetch("/api/admin/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_role",
          targetUserId: userId,
          role: draft.role,
          licenseNo: draft.licenseNo,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        reviewer?: ReviewerRoleRecord;
        error?: string;
        errors?: string[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(
          data.errors?.join(" ") ?? data.error ?? "Role update failed."
        );
      }
      setRoleStatusMsg(
        `Updated ${data.reviewer?.display_name} -> role "${data.reviewer?.role}".`
      );
      await loadSnapshot();
    } catch (err) {
      setRoleStatusMsg(
        err instanceof Error ? err.message : "Role update failed."
      );
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="bento-card space-y-3 border-error/60">
        <h1 className="text-h2 text-ink">Editorial Review Studio Unavailable</h1>
        <p className="text-sm text-muted">{loadError}</p>
        <button
          type="button"
          onClick={() => void loadSnapshot()}
          className="btn-secondary"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="bento-card text-sm text-muted">
        Loading review queue and 8-criteria rubric...
      </div>
    );
  }

  const totalPendingCount = buildReviewQueueEntries({
    questions: snapshot.questions,
    drawingExercises: snapshot.drawingExercises,
    statusFilter: "queue",
  }).length;

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-caption uppercase tracking-wider text-accent-cyan">
            Editorial Gatekeeper · Role: {snapshot.currentRole.toUpperCase()}
          </span>
          <h1 className="text-h1 text-ink-primary">
            Technical Review Studio
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/draw/admin" className="btn-secondary min-h-12 px-3 text-sm">
            Drawing Rules Admin
          </Link>
          <a
            href="/api/admin/review/export"
            download="bendline-reviews.csv"
            className="btn-secondary min-h-12 px-3.5 text-sm text-accent-cyan"
          >
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Export Reviews CSV
          </a>
        </div>
      </div>

      {/* Mode Tabs */}
      <div
        role="tablist"
        aria-label="Review studio sections"
        className="flex flex-wrap gap-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "queue"}
          onClick={() => setActiveTab("queue")}
          className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-semibold ${
            activeTab === "queue"
              ? "border-accent-cyan bg-elevated text-ink-primary"
              : "border-line-subtle bg-surface text-ink-secondary hover:text-ink-primary"
          }`}
        >
          <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Review Queue ({totalPendingCount})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "roles"}
          onClick={() => setActiveTab("roles")}
          className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-semibold ${
            activeTab === "roles"
              ? "border-accent-cyan bg-elevated text-ink-primary"
              : "border-line-subtle bg-surface text-ink-secondary hover:text-ink-primary"
          }`}
        >
          <Users className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Reviewer Roles ({snapshot.reviewers.length})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "log"}
          onClick={() => setActiveTab("log")}
          className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-semibold ${
            activeTab === "log"
              ? "border-accent-cyan bg-elevated text-ink-primary"
              : "border-line-subtle bg-surface text-ink-secondary hover:text-ink-primary"
          }`}
        >
          <History className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Review Log ({snapshot.reviews.length})
        </button>
      </div>

      {submitSuccess && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-accent-emerald/60 bg-accent-emerald/15 px-4 py-2.5 text-sm text-ink-primary"
        >
          <CheckCircle2
            className="h-4 w-4 shrink-0 text-accent-emerald"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>{submitSuccess}</span>
        </div>
      )}

      {submitError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-accent-crimson/60 bg-accent-crimson/15 px-4 py-2.5 text-sm text-ink-primary"
        >
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-accent-crimson"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>{submitError}</span>
        </div>
      )}

      {activeTab === "queue" && (
        <>
          {/* Filter Bar */}
          <div className="bento-card grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="review-filter-topic" className="block text-caption text-muted">
                Topic
              </label>
              <select
                id="review-filter-topic"
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
              >
                <option value="all">All Topics</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.display_order}. {t.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="review-filter-kind" className="block text-caption text-muted">
                Item Kind
              </label>
              <select
                id="review-filter-kind"
                value={kindFilter}
                onChange={(e) =>
                  setKindFilter(e.target.value as "all" | ReviewItemKind)
                }
                className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
              >
                <option value="all">Questions &amp; Drawing Exercises</option>
                <option value="question">Questions Only</option>
                <option value="drawing_exercise">Drawing Exercises Only</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="review-filter-status" className="block text-caption text-muted">
                Queue Status
              </label>
              <select
                id="review-filter-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
              >
                <option value="queue">Draft &amp; Revise Queue</option>
                <option value="published">Published (Approved)</option>
                <option value="archived">Archived (Rejected)</option>
                <option value="all">All Statuses</option>
              </select>
            </div>
          </div>

          {/* Main Workspace: Queue Sidebar + Side-by-Side Inspector & Rubric */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Queue List */}
            <aside
              aria-label="Review queue list"
              className="bento-card space-y-2.5 lg:col-span-4"
            >
              <h2 className="text-h3 text-ink">
                Queue Items ({queueEntries.length})
              </h2>

              {queueEntries.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
                  No items match the current topic/status filter.
                </p>
              ) : (
                <div className="space-y-2">
                  {queueEntries.map((entry) => {
                    const key = `${entry.kind}:${entry.id}`;
                    const isSelected =
                      activeEntry &&
                      `${activeEntry.kind}:${activeEntry.id}` === key;
                    const topicTitle =
                      topicMap.get(entry.topicId)?.title ?? "Code Domain";

                    return (
                      <button
                        key={key}
                        type="button"
                        data-testid={`queue-item-${entry.id}`}
                        onClick={() => setSelectedKey(key)}
                        className={`w-full space-y-1.5 rounded-xl border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-accent bg-elevated"
                            : "border-border/70 bg-bg/60 hover:border-accent/50"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5 font-mono text-caption">
                          <span className="uppercase text-accent">
                            {entry.kind === "drawing_exercise"
                              ? "DRAWING"
                              : entry.itemType}
                            {" · "}
                            {entry.codeFamily} {entry.edition}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 uppercase ${STATUS_BADGE[entry.status]}`}
                          >
                            {entry.status} · v{entry.version}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-sm font-medium text-ink">
                          {entry.title}
                        </p>
                        <p className="truncate text-caption text-muted">
                          {topicTitle}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </aside>

            {/* Side-by-Side Question/Drawing Inspector + 8-Criteria Rubric Form */}
            <div className="lg:col-span-8">
              {activeEntry ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {/* Left Panel: Item Inspector & New Version */}
                  <section
                    aria-label="Item under review"
                    className="bento-card space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
                      <div>
                        <span className="font-mono text-caption uppercase text-accent">
                          {activeEntry.kind === "question"
                            ? `Question (${activeEntry.itemType})`
                            : "Isometric Drawing Exercise"}
                          {" · "}v{activeEntry.version}
                        </span>
                        <h2 className="text-h3 text-ink">
                          {topicMap.get(activeEntry.topicId)?.title ??
                            "Plumbing Domain"}
                        </h2>
                      </div>
                      <span
                        data-testid="active-item-status"
                        className={`rounded-full border px-2.5 py-0.5 font-mono text-caption uppercase ${STATUS_BADGE[activeEntry.status]}`}
                      >
                        {activeEntry.status}
                      </span>
                    </div>

                    {selectedQuestion && (
                      <div className="space-y-3">
                        <p className="font-mono text-caption text-muted">
                          Ref: {selectedQuestion.code_ref} · Diff{" "}
                          {selectedQuestion.difficulty}/5
                        </p>
                        <p className="text-base font-medium leading-relaxed text-ink">
                          {selectedQuestion.stem}
                        </p>
                        <ol className="space-y-1.5">
                          {selectedQuestion.options.map((opt, idx) => {
                            const isKey = idx === selectedQuestion.correct_index;
                            return (
                              <li
                                key={`${selectedQuestion.id}-opt-${idx}`}
                                className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                                  isKey
                                    ? "border-success/60 bg-success/10 text-ink"
                                    : "border-border/60 bg-bg/60 text-muted"
                                }`}
                              >
                                <span>
                                  <strong className="font-mono">
                                    {String.fromCharCode(65 + idx)}.
                                  </strong>{" "}
                                  {opt}
                                </span>
                                {isKey && (
                                  <span className="shrink-0 font-mono text-caption font-semibold text-success">
                                    KEY
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ol>
                        <div className="rounded-xl border border-border/70 bg-bg/60 p-3 text-sm">
                          <p className="font-semibold text-ink">Explanation Seed</p>
                          <p className="mt-1 text-muted">
                            {selectedQuestion.explanation_seed}
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedExercise && (
                      <div className="space-y-3">
                        <p className="font-mono text-caption text-muted">
                          System: {selectedExercise.pipe_system.toUpperCase()} ·{" "}
                          {selectedExercise.code_family}{" "}
                          {selectedExercise.edition}
                        </p>
                        <h3 className="text-base font-semibold text-ink">
                          {selectedExercise.title}
                        </h3>
                        <p className="text-sm text-muted">
                          {selectedExercise.prompt_md}
                        </p>
                        <div className="rounded-xl border border-border/70 bg-bg/60 p-3 text-caption">
                          <p className="font-semibold text-ink">
                            Fixtures ({selectedExercise.fixtures.length}) &amp;
                            Scoring Rubric
                          </p>
                          <p className="mt-1 font-mono text-muted">
                            {Object.entries(selectedExercise.scoring_rubric)
                              .map(([k, v]) => `${k}: ${v}pts`)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                    )}

                    {(selectedQuestion?.latest_review_comments ||
                      selectedExercise?.latest_review_comments) && (
                      <div className="rounded-xl border border-primary/50 bg-primary/10 p-3 text-caption text-ink">
                        <p className="font-semibold text-primary">
                          Latest Reviewer Notes
                        </p>
                        <p className="mt-0.5">
                          {selectedQuestion?.latest_review_comments ??
                            selectedExercise?.latest_review_comments}
                        </p>
                      </div>
                    )}

                    {/* New Version Controls (Invalidates prior approval) */}
                    <div className="border-t border-border/70 pt-3">
                      <button
                        type="button"
                        onClick={() => setShowVersionForm((prev) => !prev)}
                        className="btn-secondary min-h-11 w-full justify-between px-3 text-caption font-semibold"
                      >
                        <span className="inline-flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
                          Publish New Version (Invalidates Approval)
                        </span>
                        <span>v{activeEntry.version + 1}</span>
                      </button>

                      {showVersionForm && (
                        <form
                          onSubmit={handleBumpNewVersion}
                          className="mt-3 space-y-2.5 rounded-xl border border-border bg-bg/80 p-3"
                        >
                          <label
                            htmlFor="new-version-title"
                            className="block text-caption text-muted"
                          >
                            {activeEntry.kind === "question"
                              ? "Updated Question Stem"
                              : "Updated Exercise Title"}
                          </label>
                          <textarea
                            id="new-version-title"
                            rows={2}
                            value={versionTitleOrStem}
                            onChange={(e) =>
                              setVersionTitleOrStem(e.target.value)
                            }
                            className="w-full rounded-xl border border-border bg-elevated p-2.5 text-sm text-ink"
                          />
                          <label
                            htmlFor="new-version-seed"
                            className="block text-caption text-muted"
                          >
                            {activeEntry.kind === "question"
                              ? "Updated Explanation Seed"
                              : "Updated Drawing Prompt"}
                          </label>
                          <textarea
                            id="new-version-seed"
                            rows={2}
                            value={versionPromptOrSeed}
                            onChange={(e) =>
                              setVersionPromptOrSeed(e.target.value)
                            }
                            className="w-full rounded-xl border border-border bg-elevated p-2.5 text-sm text-ink"
                          />
                          <button
                            type="submit"
                            className="btn-secondary min-h-11 w-full border-primary/60 text-caption font-semibold text-primary"
                          >
                            Save Version v{activeEntry.version + 1} &amp; Invalidate Approval
                          </button>
                        </form>
                      )}
                    </div>
                  </section>

                  {/* Right Panel: 8-Criteria Rubric Form & Hard Gates */}
                  <form
                    onSubmit={handleSubmitVerdict}
                    aria-label="8-criteria rubric evaluation"
                    className="bento-card space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
                      <div>
                        <h2 className="text-h3 text-ink">8-Criteria Rubric</h2>
                        <p className="text-caption text-muted">
                          Hard gates: Key Accuracy, Distractors, Edition Fit ≥ 4
                        </p>
                      </div>
                      <FileCode2 className="h-5 w-5 text-accent" strokeWidth={1.75} aria-hidden="true" />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="review-license-no" className="block text-caption text-muted">
                        Reviewer License Number
                      </label>
                      <input
                        id="review-license-no"
                        type="text"
                        required
                        value={licenseNo}
                        onChange={(e) => setLicenseNo(e.target.value)}
                        className="min-h-11 w-full rounded-xl border border-border bg-elevated px-3 font-mono text-sm text-ink"
                      />
                    </div>

                    {/* All 8 Scoring Criteria */}
                    <div className="space-y-2">
                      {RUBRIC_CRITERIA.map((crit) => {
                        const val = scores[crit.key];
                        const failedGate =
                          crit.isHardGate && val < crit.minForApproval;
                        return (
                          <div
                            key={crit.key}
                            className={`rounded-xl border p-2.5 ${
                              failedGate
                                ? "border-error/60 bg-error/10"
                                : "border-border/70 bg-bg/60"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <span className="text-sm font-semibold text-ink">
                                  {crit.label}
                                </span>
                                {crit.isHardGate && (
                                  <span className="ml-2 rounded border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                                    Gate ≥ 4
                                  </span>
                                )}
                              </div>
                              <div
                                role="group"
                                aria-label={`${crit.label} score`}
                                className="flex gap-1"
                              >
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    aria-label={`${crit.label} score ${n}`}
                                    aria-pressed={val === n}
                                    onClick={() => setCriterionScore(crit.key, n)}
                                    className={`min-h-9 min-w-9 rounded-lg border font-mono text-caption font-semibold tabular-nums ${
                                      val === n
                                        ? "border-accent bg-elevated text-accent"
                                        : "border-border bg-card text-muted hover:text-ink"
                                    }`}
                                  >
                                    {n}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <p className="mt-1 text-caption text-muted">
                              {crit.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Mandatory calc_independently_verified gate for calc questions */}
                    {activeEntry.itemType === "calc" && (
                      <label
                        htmlFor="calc-independently-verified"
                        className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-primary/50 bg-primary/10 p-3 text-sm text-ink"
                      >
                        <input
                          id="calc-independently-verified"
                          type="checkbox"
                          checked={calcVerified}
                          onChange={(e) => setCalcVerified(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-amber-400"
                        />
                        <span>
                          <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-primary">
                            <Calculator className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            calc_independently_verified
                          </span>
                          <span className="block text-caption text-muted">
                            Required for calculation questions: independently
                            re-computed numbers and rounding match deterministic answer.
                          </span>
                        </span>
                      </label>
                    )}

                    {/* Live Hard-Gate Status Banner */}
                    {verdict === "approve" && (
                      <div
                        data-testid="hard-gate-status"
                        className={`rounded-xl border px-3 py-2 text-caption ${
                          liveGates.passed
                            ? "border-success/50 bg-success/10 text-success"
                            : "border-error/60 bg-error/10 text-error"
                        }`}
                      >
                        {liveGates.passed
                          ? "All approval hard gates satisfied."
                          : liveGates.failures.join(" ")}
                      </div>
                    )}

                    {/* Comments & Suggested Fix */}
                    <div className="space-y-2">
                      <label htmlFor="review-comments" className="block text-caption text-muted">
                        Reviewer Comments (required for Revise)
                      </label>
                      <textarea
                        id="review-comments"
                        rows={2}
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder="Verification notes or revision instructions..."
                        className="w-full rounded-xl border border-border bg-elevated p-2.5 text-sm text-ink placeholder:text-muted"
                      />
                      <label htmlFor="review-suggested-fix" className="block text-caption text-muted">
                        Suggested Fix (optional)
                      </label>
                      <input
                        id="review-suggested-fix"
                        type="text"
                        value={suggestedFix}
                        onChange={(e) => setSuggestedFix(e.target.value)}
                        placeholder="Suggested replacement wording or distractor..."
                        className="min-h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink placeholder:text-muted"
                      />
                    </div>

                    {/* Verdict Actions */}
                    <div className="space-y-2">
                      <span className="block text-caption text-muted">Verdict</span>
                      <div
                        role="radiogroup"
                        aria-label="Review verdict"
                        className="grid grid-cols-3 gap-2"
                      >
                        {(
                          [
                            { id: "approve", label: "Approve → Published" },
                            { id: "revise", label: "Revise → Return" },
                            { id: "reject", label: "Reject → Archive" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            role="radio"
                            aria-checked={verdict === opt.id}
                            onClick={() => setVerdict(opt.id)}
                            className={`min-h-12 rounded-xl border px-2 text-caption font-semibold ${
                              verdict === opt.id
                                ? "border-accent bg-elevated text-ink"
                                : "border-border bg-bg/60 text-muted hover:text-ink"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-primary w-full"
                    >
                      {isSubmitting ? "Recording Verdict..." : "Submit Review Verdict"}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="bento-card text-sm text-muted">
                  Select an item from the queue to inspect and evaluate.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Reviewer Role Management Tab */}
      {activeTab === "roles" && (
        <section
          aria-labelledby="reviewer-roles-heading"
          className="bento-card space-y-4"
        >
          <div>
            <h2 id="reviewer-roles-heading" className="text-h2 text-ink">
              Admin Reviewer Role Management
            </h2>
            <p className="text-sm text-muted">
              Promote licensed tradespeople to <code className="font-mono">reviewer</code>{" "}
              or <code className="font-mono">admin</code> and bind their state
              license numbers.
            </p>
          </div>

          {roleStatusMsg && (
            <p
              role="status"
              className="rounded-xl border border-accent/50 bg-accent/10 px-3.5 py-2 text-sm text-ink"
            >
              {roleStatusMsg}
            </p>
          )}

          <div className="space-y-3">
            {snapshot.reviewers.map((rev) => {
              const draft = roleDrafts[rev.id] ?? {
                role: rev.role,
                licenseNo: rev.license_no ?? "",
              };
              return (
                <div
                  key={rev.id}
                  data-testid={`role-row-${rev.id}`}
                  className="grid grid-cols-1 items-center gap-3 rounded-xl border border-border/70 bg-bg/60 p-3.5 sm:grid-cols-12"
                >
                  <div className="sm:col-span-4">
                    <p className="text-base font-semibold text-ink">
                      {rev.display_name}
                    </p>
                    <p className="font-mono text-caption text-muted">
                      {rev.email || rev.id}
                    </p>
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      htmlFor={`role-select-${rev.id}`}
                      className="block text-caption text-muted"
                    >
                      Role
                    </label>
                    <select
                      id={`role-select-${rev.id}`}
                      value={draft.role}
                      disabled={!snapshot.canManageRoles}
                      onChange={(e) =>
                        setRoleDrafts((prev) => ({
                          ...prev,
                          [rev.id]: {
                            ...draft,
                            role: e.target.value as UserRole,
                          },
                        }))
                      }
                      className="min-h-12 w-full rounded-xl border border-border bg-elevated px-2.5 text-sm text-ink"
                    >
                      <option value="user">user</option>
                      <option value="reviewer">reviewer</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      htmlFor={`license-input-${rev.id}`}
                      className="block text-caption text-muted"
                    >
                      Trade License No.
                    </label>
                    <input
                      id={`license-input-${rev.id}`}
                      type="text"
                      value={draft.licenseNo}
                      disabled={!snapshot.canManageRoles}
                      onChange={(e) =>
                        setRoleDrafts((prev) => ({
                          ...prev,
                          [rev.id]: {
                            ...draft,
                            licenseNo: e.target.value,
                          },
                        }))
                      }
                      placeholder="e.g. CO-MP-20914"
                      className="min-h-12 w-full rounded-xl border border-border bg-elevated px-2.5 font-mono text-sm text-ink"
                    />
                  </div>

                  <div className="sm:col-span-2 sm:self-end">
                    <button
                      type="button"
                      disabled={!snapshot.canManageRoles}
                      onClick={() => void handleSaveReviewerRole(rev.id)}
                      className="btn-secondary min-h-12 w-full px-3 text-caption font-semibold"
                    >
                      Save Role
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Review Audit Log Tab */}
      {activeTab === "log" && (
        <section
          aria-labelledby="review-log-heading"
          className="bento-card space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="review-log-heading" className="text-h2 text-ink">
                Recorded Review Decisions
              </h2>
              <p className="text-sm text-muted">
                Every logged 8-criteria score, gate verification, and verdict is
                exportable as RFC-4180 CSV.
              </p>
            </div>
            <a
              href="/api/admin/review/export"
              download="bendline-reviews.csv"
              className="btn-primary min-h-12 px-4 text-sm"
            >
              <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Download CSV
            </a>
          </div>

          <div className="space-y-2">
            {snapshot.reviews.map((r) => (
              <article
                key={r.id}
                className="rounded-xl border border-border/70 bg-bg/60 p-3.5 text-sm space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-caption">
                  <span className="text-accent">
                    {r.item_kind.toUpperCase()} v{r.item_version} · {r.code_family}{" "}
                    {r.edition} · License {r.license_no}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 uppercase ${STATUS_BADGE[r.resulting_status]}`}
                  >
                    {r.verdict} → {r.resulting_status}
                  </span>
                </div>
                <p className="font-medium text-ink">{r.item_title}</p>
                <p className="font-mono text-caption tabular-nums text-muted">
                  Gates — Key: {r.scores.key_accuracy}/5 · Distractors:{" "}
                  {r.scores.distractors}/5 · Edition Fit: {r.scores.edition_fit}/5
                  {r.item_type === "calc"
                    ? ` · calc_independently_verified: ${r.calc_independently_verified}`
                    : ""}
                </p>
                {r.comments && (
                  <p className="text-caption text-muted">Notes: {r.comments}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
