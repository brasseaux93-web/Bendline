"use client";

import { HomeBento } from "@/components/home/home-bento";
import { BlueprintLanding } from "@/components/landing/blueprint-landing";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { useAppState } from "@/components/providers/app-state-provider";
import { AppShell } from "@/components/shell/app-shell";

export default function HomePage() {
  const { isHydrated, authMode, profile } = useAppState();

  if (!isHydrated) {
    return (
      <div className="min-h-dvh bg-canvas px-4 py-12">
        <div className="mx-auto max-w-5xl animate-pulse space-y-4">
          <div className="h-10 w-64 rounded-xl bg-surface" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="h-44 rounded-2xl bg-surface" />
            <div className="h-44 rounded-2xl bg-surface" />
            <div className="h-44 rounded-2xl bg-surface" />
          </div>
        </div>
      </div>
    );
  }

  if (authMode === "logged_out") {
    return <BlueprintLanding />;
  }

  if (!profile.onboarding_completed_at) {
    return (
      <div className="min-h-dvh bg-canvas px-4 py-6 sm:px-6">
        <OnboardingWizard />
      </div>
    );
  }

  return (
    <AppShell>
      <HomeBento />
    </AppShell>
  );
}
