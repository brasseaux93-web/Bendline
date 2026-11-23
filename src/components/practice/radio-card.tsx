"use client";

import { motion } from "motion/react";
import { CheckCircle2, XCircle } from "lucide-react";
import { MOTION_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface RadioCardProps {
  label: string;
  optionIndex: number;
  selected: boolean;
  revealed: boolean;
  isCorrectOption: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export function RadioCard({
  label,
  optionIndex,
  selected,
  revealed,
  isCorrectOption,
  disabled = false,
  onSelect,
}: RadioCardProps) {
  const letter = OPTION_LETTERS[optionIndex] ?? String(optionIndex + 1);
  const showSuccess = revealed && isCorrectOption;
  const showError = revealed && selected && !isCorrectOption;

  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      transition={MOTION_SPRING.snappy}
      onClick={onSelect}
      className={cn(
        "flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-default",
        showSuccess && "border-success bg-success/15 text-ink",
        showError && "border-error bg-error/15 text-ink",
        !revealed &&
          selected &&
          "border-accent bg-elevated text-ink",
        !revealed &&
          !selected &&
          "border-border bg-bg/70 text-ink hover:border-accent/70 hover:bg-elevated/60",
        revealed &&
          !showSuccess &&
          !showError &&
          "border-border/60 bg-bg/40 text-muted opacity-80"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-mono text-sm font-semibold",
            showSuccess && "border-success bg-success/20 text-success",
            showError && "border-error bg-error/20 text-error",
            !revealed &&
              selected &&
              "border-accent bg-accent/20 text-accent",
            !revealed &&
              !selected &&
              "border-border bg-card text-muted"
          )}
        >
          {letter}
        </span>
        <span className="leading-snug">{label}</span>
      </div>

      {showSuccess && (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-success/50 bg-success/15 px-2.5 py-0.5 text-caption font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Correct
        </span>
      )}

      {showError && (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-error/50 bg-error/15 px-2.5 py-0.5 text-caption font-semibold text-error">
          <XCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Incorrect
        </span>
      )}
    </motion.button>
  );
}
