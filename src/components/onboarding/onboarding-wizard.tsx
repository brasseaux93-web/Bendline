"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import { useForm } from "react-hook-form";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  HelpCircle,
  Lock,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useAppState } from "@/components/providers/app-state-provider";
import { computeDaysToExam } from "@/lib/domain/metrics";
import { MOTION_VARIANTS } from "@/lib/motion";
import {
  stateWaitlistSchema,
  type StateWaitlistInput,
} from "@/lib/schemas/onboarding";

const STEPS = [
  { id: 1, label: "State" },
  { id: 2, label: "License" },
  { id: 3, label: "Code & Exam" },
  { id: 4, label: "Exam Date" },
] as const;

const LICENSE_OPTIONS = [
  {
    value: "journeyman" as const,
    title: "Journeyman Plumber",
    description: "Active track — full code drills, mock simulations, and isometric lab.",
    enabled: true,
  },
  {
    value: "apprentice" as const,
    title: "Apprentice",
    description: "Journeyman track is supported in this release.",
    enabled: false,
  },
  {
    value: "master" as const,
    title: "Master Plumber",
    description: "Journeyman track is supported in this release.",
    enabled: false,
  },
  {
    value: "contractor" as const,
    title: "Plumbing Contractor",
    description: "Journeyman track is supported in this release.",
    enabled: false,
  },
] as const;

function formatVerifiedDate(iso: string | null): string {
  if (!iso) return "Pending verification";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "Pending verification";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(parsed));
}

export function OnboardingWizard() {
  const router = useRouter();
  const {
    jurisdictions,
    profile,
    userEmail,
    migratedDiagnosticCount,
    dismissMigratedDiagnosticNotice,
    completeOnboarding,
    submitStateWaitlist,
  } = useAppState();

  const [step, setStep] = useState<number>(1);
  const [selectedJurisdictionId, setSelectedJurisdictionId] = useState<string>(
    profile.target_jurisdiction_id ?? jurisdictions[0]?.id ?? ""
  );
  const [confirmedCode, setConfirmedCode] = useState<boolean>(false);
  const [examDate, setExamDate] = useState<string>(profile.exam_date ?? "");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showWaitlist, setShowWaitlist] = useState<boolean>(false);
  const [waitlistResult, setWaitlistResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const selectedJurisdiction = useMemo(
    () =>
      jurisdictions.find((j) => j.id === selectedJurisdictionId) ??
      jurisdictions[0],
    [jurisdictions, selectedJurisdictionId]
  );

  const daysUntilExam = useMemo(
    () => computeDaysToExam(examDate || null),
    [examDate]
  );

  const waitlistForm = useForm<StateWaitlistInput>({
    resolver: zodResolver(stateWaitlistSchema),
    defaultValues: {
      email: userEmail ?? "",
      state: "",
      licenseLevel: "journeyman",
    },
  });

  async function onSubmitWaitlist(values: StateWaitlistInput) {
    setWaitlistResult(null);
    const res = await submitStateWaitlist({
      email: values.email,
      state: values.state,
    });
    setWaitlistResult({ ok: res.ok, text: res.message });
    if (res.ok) {
      waitlistForm.reset({
        email: values.email,
        state: "",
        licenseLevel: "journeyman",
      });
    }
  }

  async function handleStartDiagnostic() {
    if (!selectedJurisdiction) return;
    setIsSaving(true);
    try {
      await completeOnboarding({
        jurisdictionId: selectedJurisdiction.id,
        examDate: examDate || undefined,
      });
      router.push("/practice?mode=diagnostic");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-4 sm:py-8">
      {migratedDiagnosticCount > 0 && (
        <div
          role="status"
          data-testid="diagnostic-migrated-banner"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-emerald/40 bg-accent-emerald/10 px-4 py-3 text-sm text-ink-primary"
        >
          <span>
            Saved your <strong>{migratedDiagnosticCount}</strong> free diagnostic{" "}
            {migratedDiagnosticCount === 1 ? "answer" : "answers"} into your account.
          </span>
          <button
            type="button"
            onClick={dismissMigratedDiagnosticNotice}
            className="text-xs font-medium text-ink-secondary underline hover:text-ink-primary"
          >
            Dismiss
          </button>
        </div>
      )}
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption uppercase tracking-wider text-accent-cyan">
            Exam Setup · Step {step} of 4
          </span>
          <span className="tabular-nums text-caption text-ink-secondary">
            {Math.round((step / 4) * 100)}%
          </span>
        </div>

        <nav aria-label="Onboarding progress" className="grid grid-cols-4 gap-2">
          {STEPS.map((item) => {
            const isCurrent = item.id === step;
            const isDone = item.id < step;
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.id > step}
                onClick={() => {
                  if (item.id <= step) setStep(item.id);
                }}
                className={`flex min-h-12 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition duration-200 ${
                  isCurrent
                    ? "border-accent-cyan bg-elevated text-ink-primary"
                    : isDone
                    ? "border-accent-emerald/50 bg-surface text-ink-primary"
                    : "border-line-subtle bg-surface/50 text-ink-muted"
                }`}
              >
                <span className="text-caption tabular-nums">0{item.id}</span>
                <span className="text-xs font-semibold sm:text-sm">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.section
            key="step-1"
            variants={MOTION_VARIANTS.stepSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            aria-labelledby="step-1-heading"
            className="bento-card space-y-5"
          >
            <div className="space-y-1">
              <h1 id="step-1-heading" className="text-h1 text-ink-primary">
                Select your licensing state
              </h1>
              <p className="text-body text-ink-secondary">
                Questions, calculations, and mock exam timing adapt to your state board.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {jurisdictions.map((jur) => {
                const selected = jur.id === selectedJurisdictionId;
                return (
                  <button
                    key={jur.id}
                    type="button"
                    onClick={() => {
                      setSelectedJurisdictionId(jur.id);
                      setConfirmedCode(false);
                    }}
                    aria-pressed={selected}
                    className={`flex min-h-16 items-center justify-between gap-4 rounded-xl border p-4 text-left transition duration-200 ${
                      selected
                        ? "border-accent-cyan bg-elevated"
                        : "border-line-strong/70 bg-canvas/60 hover:border-line-strong"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface font-mono text-sm font-bold text-accent-cyan">
                        {jur.state}
                      </span>
                      <div>
                        <p className="text-base font-semibold text-ink-primary">
                          {jur.name}
                        </p>
                        <p className="text-sm text-ink-secondary">
                          {jur.code_family} {jur.edition} · Vendor: {jur.exam_vendor}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? "border-accent-cyan bg-accent-cyan text-canvas"
                          : "border-line-strong"
                      }`}
                    >
                      {selected && <Check className="h-4 w-4" strokeWidth={2.5} />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-line-subtle pt-4">
              <button
                type="button"
                onClick={() => setShowWaitlist((prev) => !prev)}
                aria-expanded={showWaitlist}
                className="inline-flex min-h-12 items-center gap-2 text-sm font-medium text-accent-cyan hover:underline"
              >
                <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                My state isn&apos;t listed
              </button>

              {showWaitlist && (
                <form
                  onSubmit={waitlistForm.handleSubmit(onSubmitWaitlist)}
                  className="mt-3 space-y-3 rounded-xl border border-line-strong bg-canvas/80 p-4"
                  noValidate
                >
                  <p className="text-sm text-ink-secondary">
                    Get notified when we verify the code edition and vendor bulletin for your state.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1 sm:col-span-2">
                      <label
                        htmlFor="waitlist-email"
                        className="block text-sm font-medium text-ink-primary"
                      >
                        Email
                      </label>
                      <input
                        id="waitlist-email"
                        type="email"
                        placeholder="you@example.com"
                        className="min-h-12 w-full rounded-xl border border-line-strong bg-elevated px-3.5 text-base text-ink-primary placeholder:text-ink-muted"
                        {...waitlistForm.register("email")}
                      />
                      {waitlistForm.formState.errors.email && (
                        <p role="alert" className="text-caption text-accent-crimson">
                          {waitlistForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="waitlist-state"
                        className="block text-sm font-medium text-ink-primary"
                      >
                        State (2-letter)
                      </label>
                      <input
                        id="waitlist-state"
                        type="text"
                        maxLength={2}
                        placeholder="WA"
                        className="min-h-12 w-full rounded-xl border border-line-strong bg-elevated px-3.5 font-mono text-base uppercase text-ink-primary placeholder:text-ink-muted"
                        {...waitlistForm.register("state")}
                      />
                      {waitlistForm.formState.errors.state && (
                        <p role="alert" className="text-caption text-accent-crimson">
                          {waitlistForm.formState.errors.state.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={waitlistForm.formState.isSubmitting}
                    className="btn-secondary w-full sm:w-auto"
                  >
                    {waitlistForm.formState.isSubmitting
                      ? "Saving..."
                      : "Notify me when supported"}
                  </button>

                  {waitlistResult && (
                    <p
                      role="status"
                      className={`text-sm ${
                        waitlistResult.ok
                          ? "text-accent-emerald"
                          : "text-accent-crimson"
                      }`}
                    >
                      {waitlistResult.text}
                    </p>
                  )}
                </form>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-primary w-full sm:w-auto"
              >
                Continue to License Level
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </motion.section>
        )}

        {step === 2 && (
          <motion.section
            key="step-2"
            variants={MOTION_VARIANTS.stepSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            aria-labelledby="step-2-heading"
            className="bento-card space-y-5"
          >
            <div className="space-y-1">
              <h1 id="step-2-heading" className="text-h1 text-ink-primary">
                Confirm license level
              </h1>
              <p className="text-body text-ink-secondary">
                Bendline currently focuses exclusively on the Journeyman Plumber exam.
              </p>
            </div>

            <div className="space-y-3">
              {LICENSE_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  aria-disabled={!opt.enabled}
                  className={`flex min-h-16 items-center justify-between gap-4 rounded-xl border p-4 ${
                    opt.enabled
                      ? "border-accent-cyan bg-elevated"
                      : "border-line-subtle bg-canvas/40 opacity-65"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-ink-primary">
                        {opt.title}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-caption ${
                          opt.enabled
                            ? "bg-accent-emerald/15 text-accent-emerald"
                            : "bg-elevated text-ink-secondary"
                        }`}
                      >
                        {opt.enabled ? "Selected" : "Journeyman only"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-secondary">
                      {opt.description}
                    </p>
                  </div>
                  {opt.enabled ? (
                    <ShieldCheck
                      className="h-5 w-5 shrink-0 text-accent-cyan"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  ) : (
                    <Lock
                      className="h-5 w-5 shrink-0 text-ink-muted"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn-secondary"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="btn-primary"
              >
                Review Code & Exam Facts
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </motion.section>
        )}

        {step === 3 && selectedJurisdiction && (
          <motion.section
            key="step-3"
            variants={MOTION_VARIANTS.stepSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            aria-labelledby="step-3-heading"
            className="bento-card space-y-5"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-accent-cyan/40 bg-accent-cyan/10 px-2.5 py-1 font-mono text-xs font-semibold text-accent-cyan">
                  {selectedJurisdiction.code_family} {selectedJurisdiction.edition}
                </span>
                <span className="text-caption text-ink-secondary">
                  Vendor: {selectedJurisdiction.exam_vendor}
                </span>
              </div>
              <h1 id="step-3-heading" className="text-h1 text-ink-primary">
                {selectedJurisdiction.name}
              </h1>
              <p className="text-sm text-ink-secondary">
                {selectedJurisdiction.amendments_note}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-line-subtle bg-canvas/70 p-3.5">
                <dt className="flex items-center gap-1.5 text-caption text-ink-secondary">
                  <HelpCircle className="h-3.5 w-3.5 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
                  Questions
                </dt>
                <dd className="mt-1 tabular-nums text-h2 text-ink-primary">
                  {selectedJurisdiction.question_count}
                </dd>
              </div>

              <div className="rounded-xl border border-line-subtle bg-canvas/70 p-3.5">
                <dt className="flex items-center gap-1.5 text-caption text-ink-secondary">
                  <Clock className="h-3.5 w-3.5 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
                  Time limit
                </dt>
                <dd className="mt-1 tabular-nums text-h2 text-ink-primary">
                  {selectedJurisdiction.time_limit_min}m
                </dd>
              </div>

              <div className="rounded-xl border border-line-subtle bg-canvas/70 p-3.5">
                <dt className="flex items-center gap-1.5 text-caption text-ink-secondary">
                  <ShieldCheck className="h-3.5 w-3.5 text-accent-emerald" strokeWidth={1.75} aria-hidden="true" />
                  Pass score
                </dt>
                <dd className="mt-1 tabular-nums text-h2 text-ink-primary">
                  {selectedJurisdiction.pass_pct}%
                </dd>
              </div>

              <div className="rounded-xl border border-line-subtle bg-canvas/70 p-3.5">
                <dt className="flex items-center gap-1.5 text-caption text-ink-secondary">
                  <BookOpen className="h-3.5 w-3.5 text-accent-amber" strokeWidth={1.75} aria-hidden="true" />
                  Format
                </dt>
                <dd className="mt-1 text-base font-semibold text-ink-primary">
                  {selectedJurisdiction.open_book ? "Open book" : "Closed book"}
                </dd>
              </div>
            </dl>

            {selectedJurisdiction.open_book &&
              selectedJurisdiction.allowed_refs.length > 0 && (
                <div className="rounded-xl border border-accent-cyan/40 bg-accent-cyan/5 p-3.5">
                  <p className="text-caption uppercase tracking-wider text-accent-cyan">
                    Allowed exam references
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-ink-primary">
                    {selectedJurisdiction.allowed_refs.map((ref) => (
                      <li key={ref}>{ref}</li>
                    ))}
                  </ul>
                </div>
              )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-subtle bg-canvas/60 px-4 py-3 text-sm">
              <span className="text-ink-secondary">
                Last verified{" "}
                <strong className="font-medium text-ink-primary">
                  {formatVerifiedDate(selectedJurisdiction.last_verified_at)}
                </strong>
              </span>
              {selectedJurisdiction.bulletin_url && (
                <a
                  href={selectedJurisdiction.bulletin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-12 items-center gap-1.5 font-medium text-accent-cyan hover:underline"
                >
                  Official bulletin
                  <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </a>
              )}
            </div>

            <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line-strong bg-elevated/60 p-3.5">
              <input
                type="checkbox"
                checked={confirmedCode}
                onChange={(e) => setConfirmedCode(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-line-strong accent-amber-500"
              />
              <span className="text-sm text-ink-primary">
                I confirm my journeyman exam uses{" "}
                <strong>
                  {selectedJurisdiction.code_family} {selectedJurisdiction.edition}
                </strong>{" "}
                and I will verify local amendments against my adopted code.
              </span>
            </label>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-secondary"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                disabled={!confirmedCode}
                onClick={() => setStep(4)}
                className="btn-primary"
              >
                Continue to Exam Date
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </motion.section>
        )}

        {step === 4 && selectedJurisdiction && (
          <motion.section
            key="step-4"
            variants={MOTION_VARIANTS.stepSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            aria-labelledby="step-4-heading"
            className="bento-card space-y-5"
          >
            <div className="space-y-1">
              <h1 id="step-4-heading" className="text-h1 text-ink-primary">
                Optional exam date
              </h1>
              <p className="text-body text-ink-secondary">
                Add your scheduled exam date to unlock a live countdown on your Home dashboard, or skip for now.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="onboarding-exam-date"
                className="flex items-center gap-2 text-sm font-medium text-ink-primary"
              >
                <Calendar className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
                Exam date (optional)
              </label>
              <input
                id="onboarding-exam-date"
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-line-strong bg-elevated px-4 text-base text-ink-primary"
              />
              <p className="text-sm text-ink-secondary tabular-nums">
                {daysUntilExam !== null
                  ? `${daysUntilExam} days remaining until exam`
                  : "No exam date scheduled yet."}
              </p>
            </div>

            <div className="rounded-xl border border-line-subtle bg-canvas/70 p-4 text-sm text-ink-secondary">
              <p className="font-medium text-ink-primary">
                Diagnostic baseline ready ({selectedJurisdiction.state} ·{" "}
                {selectedJurisdiction.code_family} {selectedJurisdiction.edition})
              </p>
              <p className="mt-1">
                Readiness stays hidden (<code className="font-mono">null</code>) until you complete 15 questions in each of the 10 plumbing topics.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="btn-secondary"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleStartDiagnostic}
                className="btn-primary"
              >
                {isSaving ? "Saving setup..." : "Start Diagnostic"}
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
