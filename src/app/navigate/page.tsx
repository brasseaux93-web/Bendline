"use client";

import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { NavigationTrainerWorkspace } from "@/components/nav/navigation-trainer-workspace";
import { useAppState } from "@/components/providers/app-state-provider";
import { AppShell } from "@/components/shell/app-shell";

export default function NavigatePage() {
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
      <Suspense
        fallback={
          <div className="bento-card text-sm text-muted">
            Loading Open-Book Code Navigation Trainer...
          </div>
        }
      >
        <NavigationTrainerWorkspace />
      </Suspense>
    </AppShell>
  );
}
