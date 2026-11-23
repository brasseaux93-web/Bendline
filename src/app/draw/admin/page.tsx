"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AdminExerciseEditor } from "@/components/draw/admin-exercise-editor";
import { useAppState } from "@/components/providers/app-state-provider";
import { AppShell } from "@/components/shell/app-shell";

export default function DrawAdminPage() {
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
      <AdminExerciseEditor />
    </AppShell>
  );
}
