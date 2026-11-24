"use client";

import { AccountBillingContent } from "@/components/modals/account-billing-content";
import { useAppState } from "@/components/providers/app-state-provider";
import { AppShell } from "@/components/shell/app-shell";

export default function AccountPage() {
  const { authMode } = useAppState();

  if (authMode === "logged_out") {
    return <AccountBillingContent inModal={false} />;
  }

  return (
    <AppShell>
      <AccountBillingContent inModal={false} />
    </AppShell>
  );
}
