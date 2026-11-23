"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { DrawingLabWorkspace } from "@/components/draw/drawing-lab-workspace";
import { useAppState } from "@/components/providers/app-state-provider";
import { AppShell } from "@/components/shell/app-shell";

export default function DrawPage() {
  const { authMode } = useAppState();

  if (authMode === "logged_out") {
    return (
      <main className="blueprint-grid-bg flex min-h-dvh items-center justify-center px-4 py-10">
        <AuthCard />
      </main>
    );
  }

  return (
    <AppShell>
      <DrawingLabWorkspace />
    </AppShell>
  );
}
