import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default function OnboardingPage() {
  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="inline-flex min-h-12 items-center gap-2 text-sm font-medium text-ink-secondary hover:text-ink-primary"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Bendline
        </Link>
      </div>
      <OnboardingWizard />
    </main>
  );
}
