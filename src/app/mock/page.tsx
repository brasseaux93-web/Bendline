"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { MockExamRunner } from "@/components/mock/mock-exam-runner";
import { useAppState } from "@/components/providers/app-state-provider";
import { AppShell } from "@/components/shell/app-shell";

export default function MockPage() {
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
      <MockExamRunner />
    </AppShell>
  );
}
