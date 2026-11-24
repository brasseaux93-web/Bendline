import { Suspense } from "react";
import { DiagnosticWorkspace } from "@/components/diagnostic/diagnostic-workspace";

export default function DiagnosticPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh bg-canvas px-4 py-12 text-ink-secondary">
          <div className="mx-auto max-w-5xl rounded-2xl border border-ink/[0.08] bg-card p-6 font-mono text-sm">
            Loading diagnostic workspace...
          </div>
        </main>
      }
    >
      <DiagnosticWorkspace />
    </Suspense>
  );
}
