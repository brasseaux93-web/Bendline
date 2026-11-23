"use client";

import { useId, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useAppState } from "@/components/providers/app-state-provider";
import type { CodeFamily, ErrorReportRecord } from "@/lib/domain/types";
import { formatQuestionReviewStamp } from "@/lib/progress/analytics";

interface QuestionReviewBarProps {
  questionId: string;
  reviewedAt?: string | null;
  codeFamily: CodeFamily;
  edition: string;
  codeRef?: string;
  compact?: boolean;
}

export function QuestionReviewBar({
  questionId,
  reviewedAt,
  codeFamily,
  edition,
  codeRef,
  compact = false,
}: QuestionReviewBarProps) {
  const { submitErrorReport } = useAppState();
  const uid = useId();
  const categoryId = `report-cat-${uid}`;
  const detailsId = `report-details-${uid}`;

  const [open, setOpen] = useState<boolean>(false);
  const [category, setCategory] =
    useState<ErrorReportRecord["category"]>("technical");
  const [details, setDetails] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const reviewStamp = formatQuestionReviewStamp(
    reviewedAt,
    codeFamily,
    edition
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = details.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setStatusMessage(null);
    const res = await submitErrorReport({
      questionId,
      category,
      description: codeRef ? `[${codeRef}] ${trimmed}` : trimmed,
    });
    setSubmitting(false);
    setStatusMessage(res.message);
    if (res.ok) {
      setDetails("");
      setOpen(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-border/60 pt-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-muted">
        <span className="inline-flex items-center gap-1.5 font-mono text-ink-secondary">
          <ShieldCheck
            className="h-3.5 w-3.5 shrink-0 text-accent-emerald"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>{reviewStamp}</span>
        </span>

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label={`Report error on question (${codeFamily} ${edition})`}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-bg/70 px-2.5 text-caption text-muted transition-colors hover:border-error/60 hover:text-ink ${
            compact ? "min-h-9 py-1" : "min-h-10 py-1.5"
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          Report error
        </button>
      </div>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="space-y-2.5 rounded-xl border border-border bg-bg/85 p-3.5"
        >
          <p className="text-sm font-semibold text-ink">
            Report a code, calculation, or wording issue
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor={categoryId} className="block text-caption text-muted">
                Category
              </label>
              <select
                id={categoryId}
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as ErrorReportRecord["category"])
                }
                className="min-h-11 w-full rounded-xl border border-border bg-elevated px-2.5 text-sm text-ink"
              >
                <option value="technical">Technical accuracy</option>
                <option value="code_citation">Code citation</option>
                <option value="calculation">Calculation</option>
                <option value="jurisdiction_amendment">State amendment</option>
                <option value="typo">Typo / clarity</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor={detailsId} className="block text-caption text-muted">
                Issue details
              </label>
              <input
                id={detailsId}
                type="text"
                required
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Describe what looks inaccurate..."
                className="min-h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink placeholder:text-muted"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-secondary min-h-10 px-3 text-caption"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-secondary min-h-10 border-accent/60 px-3 text-caption text-ink"
            >
              {submitting ? "Sending..." : "Submit Report"}
            </button>
          </div>
        </form>
      )}

      {statusMessage && (
        <p
          role="status"
          className="rounded-lg border border-success/50 bg-success/10 px-3 py-1.5 text-caption text-ink"
        >
          {statusMessage}
        </p>
      )}
    </div>
  );
}
