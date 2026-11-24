"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, X } from "lucide-react";
import { useAppState } from "@/components/providers/app-state-provider";

export function DevPreviewPill() {
  const router = useRouter();
  const { isSupabaseReady, enterLocalPreview } = useAppState();
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!expanded) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setExpanded(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded]);

  if (process.env.NODE_ENV !== "development" || isSupabaseReady) {
    return null;
  }

  async function handleLocalPreview(skipOnboarding: boolean) {
    setExpanded(false);
    await enterLocalPreview("journeyman@bendline.local", skipOnboarding);
    router.push(skipOnboarding ? "/" : "/onboarding");
  }

  return (
    <div
      ref={containerRef}
      className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2"
    >
      {expanded && (
        <div
          role="region"
          aria-label="Local preview controls"
          className="w-56 space-y-2 rounded-xl border border-ink/[0.1] bg-card/95 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        >
          <p className="font-mono text-[11px] text-ink-muted">
            Local preview (no Supabase env)
          </p>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => handleLocalPreview(false)}
              className="inline-flex min-h-[40px] w-full items-center justify-center rounded-lg border border-ink/[0.12] bg-elevated px-3 text-xs font-medium text-ink-primary transition-colors hover:border-accent-cyan/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              Preview Onboarding
            </button>
            <button
              type="button"
              onClick={() => handleLocalPreview(true)}
              className="inline-flex min-h-[40px] w-full items-center justify-center rounded-lg border border-ink/[0.12] bg-elevated px-3 text-xs font-medium text-ink-primary transition-colors hover:border-accent-cyan/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              Preview HomeBento
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse dev preview toolbar" : "Expand dev preview toolbar"}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-ink/[0.12] bg-card/95 px-3.5 py-1.5 font-mono text-xs text-ink-secondary shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md transition-colors hover:border-accent-cyan/50 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
      >
        <span
          className="h-1.5 w-1.5 rounded-full bg-accent-amber"
          aria-hidden="true"
        />
        <span>Dev preview</span>
        {expanded ? (
          <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
