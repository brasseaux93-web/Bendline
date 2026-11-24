"use client";

import { CheckCircle2, ChevronDown, History } from "lucide-react";
import type { PublicLedgerItem } from "@/lib/accuracy/compute";

function formatShortDate(iso: string | null): string {
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

export function AccuracyLedgerRow({
  item,
  isExpanded,
  onToggle,
}: {
  item: PublicLedgerItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const allPassed =
    item.status === "published" &&
    item.criteriaPassedCount === item.criteriaTotalCount;

  return (
    <div
      data-testid="ledger-item-row"
      className="min-w-0 bg-card transition-colors hover:bg-elevated/40"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="group flex min-h-[56px] w-full items-start justify-between gap-6 px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-cyan"
      >
        {/* Left: Primary question stem first, quiet metadata below */}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="line-clamp-2 text-[15px] font-medium leading-snug text-ink-primary">
            {item.stemPreview}
          </p>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-xs text-ink-secondary">
            <span className="font-medium text-accent-cyan">{item.code}</span>
            <span aria-hidden="true" className="text-ink-muted">
              /
            </span>
            <span className="text-ink-primary">v{item.version}</span>
            <span aria-hidden="true" className="text-ink-muted">
              ·
            </span>
            <span className="truncate">{item.codeRef}</span>
          </div>
        </div>

        {/* Right: Scannable status pill + disclosure chevron */}
        <div className="flex shrink-0 items-center gap-3 pt-0.5">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-medium tabular-nums ${
              allPassed
                ? "border-accent-emerald/30 bg-accent-emerald/10 text-accent-emerald"
                : "border-accent-amber/30 bg-accent-amber/10 text-accent-amber"
            }`}
          >
            {item.status === "published"
              ? `${item.criteriaPassedCount}/${item.criteriaTotalCount} passed`
              : "In revision"}
          </span>

          <ChevronDown
            className={`h-4 w-4 text-ink-secondary transition-transform duration-200 group-hover:text-ink-primary ${
              isExpanded ? "rotate-180 text-accent-cyan" : ""
            }`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* Expanded Drawer: Full question + license attribution + rubric & version history */}
      {isExpanded && (
        <div className="space-y-4 border-t border-ink/[0.06] bg-canvas/75 px-5 py-4 text-sm text-ink-secondary">
          <p className="leading-relaxed text-ink-primary">{item.stemPreview}</p>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/[0.06] pt-3 font-mono text-xs text-ink-secondary">
            <span>
              Verified by license: {item.reviewerLicenseNo ?? "Pending"} ·{" "}
              {formatShortDate(item.reviewedAt)}
            </span>
            <span>
              {item.topicTitle} · {item.codeRef}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {item.criteria.map((c) => (
              <div
                key={c.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-ink/[0.08] bg-card px-2.5 py-1.5 text-xs"
              >
                <span className="truncate text-ink-secondary">{c.label}</span>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 font-mono font-semibold tabular-nums ${
                    c.passed ? "text-accent-emerald" : "text-accent-amber"
                  }`}
                >
                  <CheckCircle2
                    className="h-3 w-3"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  {c.score}/5
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-ink-muted">
              <History
                className="h-3.5 w-3.5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Version History
            </span>
            <ul className="space-y-1.5">
              {item.versionHistory.map((vh) => (
                <li
                  key={`${item.id}-v${vh.version}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-ink/[0.08] bg-card px-3 py-2 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <span className="font-mono font-semibold text-ink-primary">
                      v{vh.version}
                    </span>{" "}
                    <span className="text-ink-secondary">— {vh.summary}</span>
                  </div>
                  <span className="shrink-0 font-mono text-ink-muted">
                    {formatShortDate(vh.date)} ·{" "}
                    {vh.reviewerLicenseNo ?? "Pending"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
