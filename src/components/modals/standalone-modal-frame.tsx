"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";

export function StandaloneModalFrame({ children }: { children: ReactNode }) {
  const router = useRouter();

  function handleDismiss() {
    router.push("/");
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        router.push("/");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return (
    <main
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
      className="flex min-h-dvh cursor-pointer items-center justify-center bg-canvas px-4 py-8 text-ink-primary sm:px-6"
    >
      <div className="w-full max-w-3xl cursor-default space-y-6 rounded-2xl border border-ink/[0.1] bg-card p-6 shadow-[0_24px_70px_rgba(0,0,0,0.5)] sm:p-8">
        <div className="flex items-center justify-between gap-3 border-b border-ink/[0.08] pb-4">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-secondary transition-colors hover:text-ink-primary"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Back to Bendline
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close"
            className="inline-flex h-10 w-10 min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-ink/[0.1] bg-canvas text-ink-secondary transition-colors hover:border-ink/25 hover:text-ink-primary"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </main>
  );
}
