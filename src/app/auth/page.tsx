import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";

export default function AuthPage() {
  return (
    <main className="blueprint-grid-bg flex min-h-dvh flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mx-auto mb-6 w-full max-w-md">
        <Link
          href="/"
          className="inline-flex min-h-12 items-center gap-2 text-sm font-medium text-ink-secondary hover:text-ink-primary"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to landing
        </Link>
      </div>
      <AuthCard />
    </main>
  );
}
