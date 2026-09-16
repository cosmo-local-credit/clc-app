import { Trans, useLingui } from "@lingui/react/macro";
import { RiCheckboxCircleLine, RiLogoutBoxRLine, RiShieldFlashLine } from "react-icons/ri";

import { LanguageSelector } from "#/components/language-selector";
import { InstallAppLink } from "#/components/install-app-link";
import { ThemeSelector } from "#/components/theme-selector";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import type { CaliburDelegationStatus } from "#/features/webauthn/hooks/use-calibur-delegation";
import { AccountSettingsSection } from "./account-settings-section";
import { NotificationSettingsSection } from "./notification-settings-section";

export function SettingsPage({
  address,
  delegationStatus,
  isSigningOut,
  onSignOut,
}: {
  address?: `0x${string}`;
  delegationStatus: CaliburDelegationStatus;
  isSigningOut: boolean;
  onSignOut: () => void;
}) {
  const { t } = useLingui();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1>
          <Trans>Settings</Trans>
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans>Manage your wallet session and app preferences.</Trans>
        </p>
      </div>

      <AccountSettingsSection />

      <InstallAppLink />

      <section aria-labelledby="preferences-title" className="space-y-3">
        <h2 id="preferences-title">
          <Trans>Preferences</Trans>
        </h2>
        <div className="border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              <Trans>Choose the app display language.</Trans>
            </p>
            <LanguageSelector />
          </div>
          <div className="-mx-4 my-3 h-px bg-border" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              <Trans>Choose between light and dark mode.</Trans>
            </p>
            <ThemeSelector />
          </div>
        </div>
      </section>

      <NotificationSettingsSection walletAddress={address} />

      <section aria-labelledby="wallet-session-title" className="space-y-3">
        <h2 id="wallet-session-title">
          <Trans>Wallet session</Trans>
        </h2>
        <div className="border border-border bg-card p-4">
          <div className="flex flex-col">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center bg-muted text-foreground">
                <RiCheckboxCircleLine className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  <Trans>Connected address</Trans>
                </p>
                <p className="mt-1 truncate font-mono text-muted-foreground text-xs">
                  {address ?? t`No address available`}
                </p>
              </div>
            </div>

            <div className="-mx-4 my-3 h-px bg-border" />

            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center bg-muted text-foreground">
                  <RiShieldFlashLine className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">
                    <Trans>Delegated to Calibur</Trans>
                  </p>
                </div>
              </div>
              <CaliburDelegationBadge status={delegationStatus} />
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          className="h-11 w-full border-destructive text-destructive hover:bg-destructive/10"
          onClick={onSignOut}
          disabled={isSigningOut}
        >
          <RiLogoutBoxRLine className="mr-2 size-4" aria-hidden="true" />
          {isSigningOut ? <Trans>Signing out...</Trans> : <Trans>Sign out</Trans>}
        </Button>
      </section>
    </div>
  );
}

function CaliburDelegationBadge({ status }: { status: CaliburDelegationStatus }) {
  const { t } = useLingui();

  const isDelegated = status === "delegated";
  const label = isDelegated ? t`Active` : status === "checking" ? t`Checking…` : t`Inactive`;

  return (
    <Badge variant={isDelegated ? "primary" : "muted"} className="self-center">
      {label}
    </Badge>
  );
}
