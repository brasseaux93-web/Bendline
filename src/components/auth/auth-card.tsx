"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowRight, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { useAppState } from "@/components/providers/app-state-provider";
import {
  magicLinkSchema,
  type MagicLinkInput,
} from "@/lib/schemas/onboarding";

export function AuthCard({
  compact = false,
  primarySubmit = true,
}: {
  compact?: boolean;
  primarySubmit?: boolean;
}) {
  const router = useRouter();
  const {
    isSupabaseReady,
    signInWithMagicLink,
    signInWithOAuth,
    enterLocalPreview,
  } = useAppState();

  const [statusMessage, setStatusMessage] = useState<{
    tone: "ok" | "warn";
    text: string;
  } | null>(null);
  const [oauthPending, setOauthPending] = useState<"google" | "apple" | null>(
    null
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MagicLinkInput>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: "" },
  });

  async function onSubmitMagicLink(values: MagicLinkInput) {
    setStatusMessage(null);
    const result = await signInWithMagicLink(values.email);
    setStatusMessage({
      tone: result.ok ? "ok" : "warn",
      text: result.message,
    });
  }

  async function handleOAuth(provider: "google" | "apple") {
    setOauthPending(provider);
    setStatusMessage(null);
    const result = await signInWithOAuth(provider);
    if (!result.ok) {
      setStatusMessage({ tone: "warn", text: result.message });
    } else {
      setStatusMessage({ tone: "ok", text: result.message });
    }
    setOauthPending(null);
  }

  async function handleLocalPreview(skipOnboarding: boolean) {
    await enterLocalPreview("journeyman@bendline.local", skipOnboarding);
    router.push(skipOnboarding ? "/" : "/onboarding");
  }

  return (
    <section
      aria-labelledby="auth-card-heading"
      className={
        compact
          ? "bento-card w-full space-y-4 border-line-strong/80"
          : "bento-card mx-auto w-full max-w-md space-y-5 border-line-strong/80 p-6"
      }
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption uppercase tracking-wider text-accent-cyan">
            Supabase Auth
          </span>
          <span className="inline-flex items-center gap-1.5 text-caption text-ink-secondary">
            <ShieldCheck className="h-4 w-4 text-accent-emerald" strokeWidth={1.75} aria-hidden="true" />
            Row-level secured
          </span>
        </div>
        <h2 id="auth-card-heading" className="text-h2 text-ink-primary">
          Sign in to Bendline
        </h2>
        <p className="text-sm text-ink-secondary">
          Sync your jurisdiction rules, SRS review queue, and isometric drawings offline and across devices.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmitMagicLink)}
        className="space-y-3"
        noValidate
      >
        <div className="space-y-1.5">
          <label
            htmlFor="magic-link-email"
            className="block text-sm font-medium text-ink-primary"
          >
            Email address for Magic Link
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              id="magic-link-email"
              type="email"
              autoComplete="email"
              placeholder="plumber@example.com"
              className="min-h-12 w-full rounded-xl border border-line-strong bg-elevated/90 pl-10 pr-4 text-base text-ink-primary placeholder:text-ink-muted focus:border-accent-cyan focus:outline-none"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "magic-link-email-error" : undefined}
              {...register("email")}
            />
          </div>
          {errors.email && (
            <p
              id="magic-link-email-error"
              role="alert"
              className="text-sm text-accent-crimson"
            >
              {errors.email.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={primarySubmit ? "btn-primary w-full" : "btn-secondary w-full"}
        >
          {isSubmitting ? "Sending magic link..." : "Send Magic Link"}
          <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </form>

      <div className="relative flex items-center py-1">
        <div className="h-px flex-1 bg-line-subtle" />
        <span className="px-3 text-caption uppercase tracking-wider text-ink-muted">
          Or continue with
        </span>
        <div className="h-px flex-1 bg-line-subtle" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => handleOAuth("google")}
          disabled={oauthPending !== null}
          className="btn-secondary w-full"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="currentColor"
          >
            <path d="M21.35 11.1H12v2.98h5.38c-.24 1.4-1.66 4.1-5.38 4.1-3.24 0-5.88-2.68-5.88-6s2.64-6 5.88-6c1.85 0 3.08.79 3.79 1.47l2.58-2.49C16.72 3.63 14.57 2.75 12 2.75A9.25 9.25 0 0 0 2.75 12 9.25 9.25 0 0 0 12 21.25c5.34 0 8.88-3.75 8.88-9.03 0-.61-.07-1.08-.15-1.12Z" />
          </svg>
          {oauthPending === "google" ? "Connecting..." : "Google"}
        </button>

        <button
          type="button"
          onClick={() => handleOAuth("apple")}
          disabled={oauthPending !== null}
          className="btn-secondary w-full"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="currentColor"
          >
            <path d="M16.36 12.7c.03 2.84 2.49 3.78 2.52 3.8-.02.07-.39 1.35-1.3 2.68-.78 1.15-1.6 2.29-2.88 2.31-1.26.02-1.67-.75-3.11-.75-1.45 0-1.9.73-3.09.77-1.24.05-2.18-1.24-2.97-2.38-1.62-2.34-2.86-6.62-1.2-9.5.82-1.43 2.3-2.34 3.9-2.36 1.22-.02 2.38.82 3.12.82.74 0 2.13-1.02 3.59-.87.61.03 2.33.25 3.43 1.87-.09.06-2.05 1.2-2.01 3.61ZM14.07 6.38c.66-.8 1.11-1.91.99-3.02-.95.04-2.11.64-2.79 1.43-.61.71-1.15 1.84-1.01 2.93 1.06.08 2.15-.54 2.81-1.34Z" />
          </svg>
          {oauthPending === "apple" ? "Connecting..." : "Apple"}
        </button>
      </div>

      {statusMessage && (
        <div
          role="status"
          className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm ${
            statusMessage.tone === "ok"
              ? "border-accent-emerald/50 bg-accent-emerald/10 text-ink-primary"
              : "border-accent-amber/50 bg-accent-amber/10 text-ink-primary"
          }`}
        >
          <CheckCircle2
            className={`mt-0.5 h-4 w-4 shrink-0 ${
              statusMessage.tone === "ok"
                ? "text-accent-emerald"
                : "text-accent-amber"
            }`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>{statusMessage.text}</span>
        </div>
      )}

      {!isSupabaseReady && (
        <div className="space-y-2 rounded-xl border border-line-subtle bg-canvas/70 p-3">
          <p className="text-caption text-ink-secondary">
            Offline / local preview mode active (Supabase env vars not set).
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleLocalPreview(false)}
              className="btn-secondary min-h-12 w-full text-sm"
            >
              Preview Onboarding
            </button>
            <button
              type="button"
              onClick={() => handleLocalPreview(true)}
              className="btn-secondary min-h-12 w-full text-sm"
            >
              Preview HomeBento
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
