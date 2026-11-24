"use client";

import { useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  CreditCard,
  Download,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { useAppState } from "@/components/providers/app-state-provider";
import { BILLING_PLANS, type CheckoutPlanId } from "@/lib/billing/plans";
import { AFFILIATION_DISCLAIMER } from "@/lib/legal/constants";
import type { GlobalModalId } from "./types";

export function AccountBillingContent({
  inModal = false,
  onSwitchModal,
  onDeleted,
}: {
  inModal?: boolean;
  onSwitchModal?: (id: GlobalModalId) => void;
  onDeleted?: () => void;
}) {
  const {
    authMode,
    userEmail,
    activeJurisdiction,
    entitlement,
    isOnline,
    pendingOutboxCount,
    lastSyncedAt,
    questionPackSyncedAt,
    servableQuestionsForJurisdiction,
    flushOutbox,
    refreshEntitlement,
    syncQuestionPack,
    exportAccountData,
    deleteAccount,
  } = useAppState();

  const [billingMessage, setBillingMessage] = useState<{
    tone: "info" | "warn" | "ok";
    text: string;
  } | null>(null);
  const [busyPlan, setBusyPlan] = useState<CheckoutPlanId | "portal" | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (authMode === "logged_out") {
    if (inModal) {
      return (
        <div className="space-y-5">
          <div className="space-y-1">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-accent-cyan">
              Account &amp; Billing
            </span>
            <h2 className="text-h2 text-ink-primary">
              Sign in to manage plans, sync &amp; data
            </h2>
            <p className="text-sm text-ink-secondary">
              Access your Stripe subscription, jurisdiction packs, JSON export, and account deletion controls.
            </p>
          </div>
          <AuthCard compact primarySubmit={false} />
        </div>
      );
    }

    return (
      <main className="blueprint-grid-bg flex min-h-dvh items-center justify-center px-4 py-10">
        <AuthCard />
      </main>
    );
  }

  async function handleCheckout(plan: CheckoutPlanId) {
    setBusyPlan(plan);
    setBillingMessage(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as {
        mode?: string;
        url?: string;
        message?: string;
      };
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setBillingMessage({
        tone: res.ok ? "ok" : "warn",
        text:
          data.message ??
          "Stripe Checkout could not be started in this environment.",
      });
    } catch {
      setBillingMessage({
        tone: "warn",
        text: "Network unavailable. Connect to the internet to start Stripe Checkout.",
      });
    } finally {
      setBusyPlan(null);
    }
  }

  async function handleOpenPortal() {
    setBusyPlan("portal");
    setBillingMessage(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json()) as {
        url?: string;
        message?: string;
      };
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setBillingMessage({
        tone: "warn",
        text:
          data.message ??
          "Stripe Customer Portal could not be opened in this environment.",
      });
    } catch {
      setBillingMessage({
        tone: "warn",
        text: "Network unavailable. Connect to the internet to open the Customer Portal.",
      });
    } finally {
      setBusyPlan(null);
    }
  }

  async function handleManualSync() {
    setSyncMessage(null);
    const [outboxRes] = await Promise.all([
      flushOutbox(),
      syncQuestionPack(activeJurisdiction),
      refreshEntitlement(),
    ]);
    if (!outboxRes) {
      setSyncMessage("Currently offline — items remain queued safely on device.");
    } else {
      setSyncMessage(
        `Replayed ${outboxRes.synced} queued item(s). Pending: ${outboxRes.remainingPending}.`
      );
    }
  }

  async function handleExportJson() {
    setExportStatus(null);
    const bundle = await exportAccountData();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bendline-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setExportStatus("Downloaded JSON export of your study history and local drafts.");
  }

  async function handleConfirmDelete() {
    if (deleteConfirmText !== "DELETE") {
      setDeleteError('Type "DELETE" exactly to confirm permanent deletion.');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteAccount("DELETE");
    if (!res.ok) {
      setDeleteError(res.message ?? "Could not delete account.");
      setDeleting(false);
      return;
    }
    setDeleteDialogOpen(false);
    setDeleting(false);
    onDeleted?.();
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-accent-cyan">
            Account, Billing &amp; Offline Sync
          </span>
          <h2 className="text-h1 text-ink-primary">Subscription &amp; Data Controls</h2>
          <p className="text-sm text-ink-secondary">
            Signed in as{" "}
            <span className="font-mono text-ink-primary">
              {userEmail ?? "local preview user"}
            </span>{" "}
            · Active pack: {activeJurisdiction.state} {activeJurisdiction.code_family}{" "}
            {activeJurisdiction.edition}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleOpenPortal()}
          disabled={busyPlan === "portal"}
          className="btn-secondary min-h-12 text-sm"
        >
          <CreditCard className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
          {busyPlan === "portal" ? "Opening Portal..." : "Manage Billing (Customer Portal)"}
          <ExternalLink className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </section>

      {/* Server-authoritative entitlement status + 3-day grace banner */}
      <section
        aria-labelledby="entitlement-heading"
        className="space-y-3 rounded-2xl border border-ink/[0.08] bg-canvas p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="entitlement-heading" className="text-h2 text-ink-primary">
              Server Entitlement Status
            </h3>
            <p className="text-sm text-ink-secondary">
              Effective tier:{" "}
              <span className="font-mono font-semibold text-accent-cyan">
                {entitlement.effectivePlan}
              </span>{" "}
              · Billing state:{" "}
              <span className="font-mono text-ink-primary">{entitlement.status}</span>
              {entitlement.dailyPracticeLimit !== null
                ? ` · ${entitlement.dailyPracticeLimit} scored questions/day`
                : " · Unlimited daily practice & full mock exams"}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption font-semibold ${
              entitlement.hasProAccess
                ? "border-accent-emerald/50 bg-accent-emerald/15 text-accent-emerald"
                : "border-ink/[0.12] bg-card text-ink-secondary"
            }`}
          >
            <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {entitlement.hasProAccess ? "Pro Active" : "Free Tier"}
          </span>
        </div>

        {entitlement.inGracePeriod && entitlement.graceEndsAt && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-accent-amber/60 bg-accent-amber/15 p-3.5 text-sm text-ink-primary"
          >
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-accent-amber"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold text-accent-amber">
                3-Day Failed Payment Grace Window Active
              </p>
              <p className="mt-0.5 text-ink-secondary">
                Your recent renewal charge failed, so your Pro entitlement stays open until{" "}
                <span className="font-mono text-ink-primary">
                  {new Date(entitlement.graceEndsAt).toLocaleString()}
                </span>{" "}
                (~{entitlement.graceHoursRemaining}h remaining). Update your card in the Stripe Customer Portal to avoid reverting to Free.
              </p>
            </div>
          </div>
        )}

        {billingMessage && (
          <div
            role="status"
            className={`rounded-xl border p-3.5 text-sm ${
              billingMessage.tone === "warn"
                ? "border-accent-amber/60 bg-accent-amber/10 text-ink-primary"
                : "border-accent-cyan/50 bg-accent-cyan/10 text-ink-primary"
            }`}
          >
            {billingMessage.text}
          </div>
        )}
      </section>

      {/* Plan cards */}
      <section aria-labelledby="plans-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="plans-heading" className="text-h2 text-ink-primary">
            Plans &amp; Stripe Checkout
          </h3>
          <p className="text-caption text-ink-muted">
            Price IDs load exclusively from server environment variables.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {BILLING_PLANS.map((plan) => {
            const isCurrent = entitlement.effectivePlan === plan.id;
            return (
              <article
                key={plan.id}
                data-testid={`plan-card-${plan.id}`}
                className={`flex min-w-0 flex-col justify-between gap-4 rounded-2xl border bg-canvas p-5 ${
                  plan.id === "pro_exam_pass"
                    ? "border-accent-amber/50"
                    : "border-ink/[0.08]"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-h3 text-ink-primary">{plan.name}</h4>
                      <p className="text-caption text-ink-secondary">{plan.tagline}</p>
                    </div>
                    {isCurrent && (
                      <span className="shrink-0 rounded-full border border-accent-emerald/50 bg-accent-emerald/15 px-2.5 py-0.5 text-caption font-semibold text-accent-emerald">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="rounded-xl border border-ink/[0.08] bg-card p-2.5 text-caption text-ink-secondary">
                    <p className="font-mono font-medium text-ink-primary">
                      {plan.durationNote}
                    </p>
                    <p className="mt-0.5 text-ink-muted">{plan.pricingStatusNote}</p>
                  </div>

                  <ul className="space-y-2 text-sm text-ink-secondary">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0 text-accent-emerald"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {plan.id === "free" ? (
                  <div className="inline-flex min-h-12 items-center justify-center rounded-xl border border-ink/[0.08] bg-card px-4 text-sm font-medium text-ink-secondary">
                    {isCurrent ? "Active Base Tier" : "Included Always"}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busyPlan !== null}
                    onClick={() =>
                      void handleCheckout(plan.id as CheckoutPlanId)
                    }
                    className={
                      plan.id === "pro_exam_pass"
                        ? inModal
                          ? "btn-solid w-full"
                          : "btn-primary w-full"
                        : "btn-secondary w-full"
                    }
                  >
                    {busyPlan === plan.id
                      ? "Starting Checkout..."
                      : `Start ${plan.name}`}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* Offline Outbox & Jurisdiction Pack Sync */}
      <section
        aria-labelledby="offline-sync-heading"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <article className="space-y-3 rounded-2xl border border-ink/[0.08] bg-canvas p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 id="offline-sync-heading" className="text-h2 text-ink-primary">
              Offline Cache &amp; Outbox
            </h3>
            <span className="inline-flex items-center gap-1.5 font-mono text-caption text-ink-secondary">
              {isOnline ? (
                <CloudUpload className="h-4 w-4 text-accent-emerald" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <WifiOff className="h-4 w-4 text-accent-amber" strokeWidth={1.75} aria-hidden="true" />
              )}
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-ink/[0.08] bg-card p-3 text-sm">
            <div>
              <dt className="text-caption text-ink-muted">Jurisdiction Pack</dt>
              <dd className="font-mono font-semibold text-ink-primary">
                {servableQuestionsForJurisdiction.length} servable items
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Pending Outbox</dt>
              <dd
                data-testid="account-pending-outbox"
                className="font-mono font-semibold text-accent-cyan"
              >
                {pendingOutboxCount} queued
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Pack Cached At</dt>
              <dd className="font-mono text-caption text-ink-secondary">
                {questionPackSyncedAt
                  ? new Date(questionPackSyncedAt).toLocaleTimeString()
                  : "In memory"}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Last Replay</dt>
              <dd className="font-mono text-caption text-ink-secondary">
                {lastSyncedAt
                  ? new Date(lastSyncedAt).toLocaleTimeString()
                  : "Idle"}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => void handleManualSync()}
            className="btn-secondary min-h-12 w-full text-sm"
          >
            <RefreshCw className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
            Sync Outbox &amp; Refresh Question Pack
          </button>

          {syncMessage && (
            <p role="status" className="text-caption text-accent-emerald">
              {syncMessage}
            </p>
          )}
        </article>

        {/* Data Export & Account Deletion */}
        <article
          aria-labelledby="privacy-controls-heading"
          className="space-y-3 rounded-2xl border border-ink/[0.08] bg-canvas p-5"
        >
          <h3 id="privacy-controls-heading" className="text-h2 text-ink-primary">
            Your Data &amp; Account Deletion
          </h3>
          <p className="text-sm text-ink-secondary">
            Export your complete study log, SRS schedule, and drawing drafts as portable JSON, or permanently delete your account and clear local offline storage.
          </p>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleExportJson()}
              className="btn-secondary min-h-12 flex-1 text-sm"
            >
              <Download className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} aria-hidden="true" />
              Export My Data (JSON)
            </button>

            <Dialog.Root
              open={deleteDialogOpen}
              onOpenChange={(open) => {
                setDeleteDialogOpen(open);
                if (!open) {
                  setDeleteConfirmText("");
                  setDeleteError(null);
                }
              }}
            >
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-accent-crimson/60 bg-accent-crimson/10 px-4 text-sm font-semibold text-ink-primary transition-colors hover:bg-accent-crimson/20"
                >
                  <Trash2
                    className="h-4 w-4 text-accent-crimson"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  Delete Account
                </button>
              </Dialog.Trigger>

              <Dialog.Portal>
                <Dialog.Overlay
                  onClick={() => setDeleteDialogOpen(false)}
                  className="fixed inset-0 z-[65] cursor-pointer bg-black/75 backdrop-blur-sm"
                />
                <Dialog.Content
                  onPointerDownOutside={() => setDeleteDialogOpen(false)}
                  className="fixed left-1/2 top-1/2 z-[65] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-2xl border border-ink/[0.12] bg-card p-6 shadow-2xl focus:outline-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Dialog.Title className="text-h2 text-ink-primary">
                      Confirm Account Deletion
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label="Close deletion dialog"
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-ink/[0.12] bg-elevated text-ink-secondary hover:text-ink-primary"
                      >
                        <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </Dialog.Close>
                  </div>

                  <Dialog.Description className="text-sm text-ink-secondary">
                    This clears all local study records, drawing drafts, and cached session data, and permanently deletes your server account data. Type{" "}
                    <span className="font-mono font-bold text-ink-primary">DELETE</span>{" "}
                    to confirm.
                  </Dialog.Description>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="confirm-delete-input"
                      className="block text-caption font-medium text-ink-primary"
                    >
                      Confirmation phrase
                    </label>
                    <input
                      id="confirm-delete-input"
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="DELETE"
                      className="min-h-12 w-full rounded-xl border border-ink/[0.15] bg-canvas px-3 font-mono text-sm text-ink-primary focus:border-accent-cyan focus:outline-none"
                    />
                  </div>

                  {deleteError && (
                    <p role="alert" className="text-sm text-accent-crimson">
                      {deleteError}
                    </p>
                  )}

                  <div className="flex flex-wrap justify-end gap-2">
                    <Dialog.Close asChild>
                      <button type="button" className="btn-secondary min-h-11 px-4 text-sm">
                        Cancel
                      </button>
                    </Dialog.Close>
                    <button
                      type="button"
                      disabled={deleting || deleteConfirmText !== "DELETE"}
                      onClick={() => void handleConfirmDelete()}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-accent-crimson bg-accent-crimson/20 px-4 text-sm font-semibold text-ink-primary disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4 text-accent-crimson" strokeWidth={1.75} aria-hidden="true" />
                      {deleting ? "Deleting..." : "Permanently Delete"}
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>

          {exportStatus && (
            <p role="status" className="text-caption text-accent-emerald">
              {exportStatus}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-ink/[0.08] pt-3 text-caption text-ink-muted">
            <span>{AFFILIATION_DISCLAIMER}</span>
            {inModal && onSwitchModal ? (
              <>
                <button
                  type="button"
                  onClick={() => onSwitchModal("terms")}
                  className="text-accent-cyan hover:underline"
                >
                  Terms
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchModal("privacy")}
                  className="text-accent-cyan hover:underline"
                >
                  Privacy
                </button>
              </>
            ) : (
              <>
                <Link href="/legal/terms" className="text-accent-cyan hover:underline">
                  Terms
                </Link>
                <Link href="/legal/privacy" className="text-accent-cyan hover:underline">
                  Privacy
                </Link>
              </>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
