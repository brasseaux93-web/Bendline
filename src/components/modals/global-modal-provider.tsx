"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import {
  BookOpenCheck,
  CreditCard,
  LockKeyhole,
  ShieldCheck,
  X,
} from "lucide-react";
import { AFFILIATION_DISCLAIMER } from "@/lib/legal/constants";
import { EASE_SNAPPY, MOTION_DURATION, MOTION_SPRING } from "@/lib/motion";
import { AccountBillingContent } from "./account-billing-content";
import { AccuracyLedgerContent } from "./accuracy-ledger-content";
import { PrivacyContent } from "./privacy-content";
import { TermsContent } from "./terms-content";
import type { GlobalModalId } from "./types";

interface GlobalModalContextValue {
  activeModal: GlobalModalId | null;
  openModal: (id: GlobalModalId) => void;
  closeModal: () => void;
}

const GlobalModalContext = createContext<GlobalModalContextValue | null>(null);

const MODAL_TABS: ReadonlyArray<{
  id: GlobalModalId;
  label: string;
  description: string;
}> = [
  {
    id: "account",
    label: "Account & Billing",
    description: "Manage subscription plans, offline sync, data export, and account settings.",
  },
  {
    id: "accuracy",
    label: "Accuracy Ledger",
    description: "Inspect item-by-item 8-point licensed plumber reviews, version history, and errata.",
  },
  {
    id: "terms",
    label: "Terms of Service",
    description: "Educational purpose, subscription billing grace policy, and content integrity terms.",
  },
  {
    id: "privacy",
    label: "Privacy Policy",
    description: "Local storage, Stripe billing privacy, and account export or deletion controls.",
  },
];

export function GlobalModalProvider({ children }: { children: ReactNode }) {
  const [activeModal, setActiveModal] = useState<GlobalModalId | null>(null);

  const openModal = useCallback((id: GlobalModalId) => {
    setActiveModal(id);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  const value = useMemo<GlobalModalContextValue>(
    () => ({ activeModal, openModal, closeModal }),
    [activeModal, openModal, closeModal]
  );

  const activeMeta =
    MODAL_TABS.find((t) => t.id === activeModal) ?? MODAL_TABS[0];

  const widthClass =
    activeModal === "accuracy"
      ? "max-w-5xl"
      : activeModal === "account"
        ? "max-w-4xl"
        : "max-w-2xl";

  return (
    <GlobalModalContext.Provider value={value}>
      {children}

      <Dialog.Root
        open={activeModal !== null}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      >
        <AnimatePresence>
          {activeModal && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: MOTION_DURATION.fast, ease: EASE_SNAPPY }}
                  onClick={closeModal}
                  className="fixed inset-0 z-[55] cursor-pointer bg-black/75 backdrop-blur-md"
                />
              </Dialog.Overlay>

              <div
                onClick={(e) => {
                  if (e.target === e.currentTarget) closeModal();
                }}
                className="fixed inset-0 z-[55] flex cursor-pointer items-center justify-center p-3 sm:p-6"
              >
                <Dialog.Content
                  asChild
                  onPointerDownOutside={() => closeModal()}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 4 }}
                    transition={{ duration: 0.15, ease: EASE_SNAPPY }}
                    className={`pointer-events-auto flex max-h-[88dvh] w-full cursor-default flex-col overflow-hidden rounded-2xl border border-ink/[0.1] bg-card shadow-[0_32px_90px_rgba(0,0,0,0.65)] focus:outline-none ${widthClass}`}
                  >
                    <Dialog.Title className="sr-only">
                      {activeMeta.label}
                    </Dialog.Title>
                    <Dialog.Description className="sr-only">
                      {activeMeta.description}
                    </Dialog.Description>

                    {/* Snappy Sticky Header with Tab Switcher */}
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-ink/[0.08] bg-card/95 px-3 py-2.5 sm:px-6 sm:py-3">
                      <div
                        role="tablist"
                        aria-label="Workspace & legal dialogs"
                        className="flex min-w-0 items-center gap-1 overflow-x-auto"
                      >
                        {MODAL_TABS.map((tab) => {
                          const selected = tab.id === activeModal;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              role="tab"
                              aria-selected={selected}
                              onClick={() => openModal(tab.id)}
                              className={`relative inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan sm:px-3 sm:text-sm ${
                                selected
                                  ? "bg-elevated text-ink-primary"
                                  : "text-ink-secondary hover:bg-elevated/60 hover:text-ink-primary"
                              }`}
                            >
                              {tab.id === "account" ? (
                                <CreditCard
                                  className={`h-3.5 w-3.5 ${
                                    selected ? "text-accent-cyan" : "text-ink-muted"
                                  }`}
                                  strokeWidth={1.75}
                                  aria-hidden="true"
                                />
                              ) : tab.id === "accuracy" ? (
                                <BookOpenCheck
                                  className={`h-3.5 w-3.5 ${
                                    selected ? "text-accent-cyan" : "text-ink-muted"
                                  }`}
                                  strokeWidth={1.75}
                                  aria-hidden="true"
                                />
                              ) : tab.id === "terms" ? (
                                <ShieldCheck
                                  className={`h-3.5 w-3.5 ${
                                    selected ? "text-accent-emerald" : "text-ink-muted"
                                  }`}
                                  strokeWidth={1.75}
                                  aria-hidden="true"
                                />
                              ) : (
                                <LockKeyhole
                                  className={`h-3.5 w-3.5 ${
                                    selected ? "text-accent-cyan" : "text-ink-muted"
                                  }`}
                                  strokeWidth={1.75}
                                  aria-hidden="true"
                                />
                              )}
                              <span>{tab.label}</span>
                              {selected && (
                                <motion.span
                                  layoutId="global-modal-tab-indicator"
                                  transition={MOTION_SPRING.snappy}
                                  className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent-cyan"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <Dialog.Close asChild>
                        <button
                          type="button"
                          aria-label="Close modal"
                          className="inline-flex h-10 w-10 min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-lg border border-ink/[0.1] bg-canvas text-ink-secondary transition-colors duration-150 hover:border-ink/25 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
                        >
                          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      </Dialog.Close>
                    </div>

                    {/* Scrollable Snappy Animated Body */}
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={activeModal}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -3 }}
                          transition={{ duration: 0.11, ease: EASE_SNAPPY }}
                        >
                          {activeModal === "account" && (
                            <AccountBillingContent
                              inModal
                              onSwitchModal={openModal}
                              onDeleted={closeModal}
                            />
                          )}
                          {activeModal === "accuracy" && (
                            <AccuracyLedgerContent inModal />
                          )}
                          {activeModal === "terms" && (
                            <TermsContent onSwitchModal={openModal} />
                          )}
                          {activeModal === "privacy" && (
                            <PrivacyContent onSwitchModal={openModal} />
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    {/* Sticky Footer */}
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-ink/[0.08] bg-card/95 px-5 py-3 text-xs text-ink-muted sm:px-6">
                      <span className="min-w-0 truncate">{AFFILIATION_DISCLAIMER}</span>
                      <Dialog.Close asChild>
                        <button
                          type="button"
                          className="btn-secondary min-h-[38px] px-4 py-1.5 text-xs font-semibold"
                        >
                          Done
                        </button>
                      </Dialog.Close>
                    </div>
                  </motion.div>
                </Dialog.Content>
              </div>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </GlobalModalContext.Provider>
  );
}

export function useGlobalModal(): GlobalModalContextValue {
  const ctx = useContext(GlobalModalContext);
  if (!ctx) {
    throw new Error("useGlobalModal must be used inside GlobalModalProvider");
  }
  return ctx;
}
