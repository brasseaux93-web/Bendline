"use client";

import { ReviewQueueWorkspace } from "@/components/admin/review-queue-workspace";
import { AuthCard } from "@/components/auth/auth-card";
import { useAppState } from "@/components/providers/app-state-provider";
import { AppShell } from "@/components/shell/app-shell";

export default function AdminReviewPage() {
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
      <ReviewQueueWorkspace />
    </AppShell>
  );
}
