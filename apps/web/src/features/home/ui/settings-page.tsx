import { Trans, useLingui } from "@lingui/react/macro";
import {
  RiCheckboxCircleLine,
  RiExternalLinkLine,
  RiInformationLine,
  RiLogoutBoxRLine,
  RiShieldFlashLine,
} from "react-icons/ri";

import { InstallAppLink } from "#/components/install-app-link";
import { LanguageSelector } from "#/components/language-selector";
import { ThemeSelector } from "#/components/theme-selector";
import { VisibilitySelector } from "#/components/visibility-selector";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { BUILD_INFO } from "#/features/app-updates/build-info";
import type { CaliburDelegationStatus } from "#/features/webauthn/hooks/use-calibur-delegation";
import { PLATFORM_ABOUT_URL } from "#/lib/legal";
import { AccountSettingsSection } from "./account-settings-section";
import { NotificationSettingsSection } from "./notification-settings-section";
import { PasskeySettingsSection } from "./passkey-settings-section";

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

      <Button asChild variant="outline" className="h-11 w-full justify-start gap-3">
        <a href={PLATFORM_ABOUT_URL} target="_blank" rel="noopener noreferrer">
          <RiInformationLine className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-start">
            <Trans>About Cosmo-Local Credit</Trans>
          </span>
          <RiExternalLinkLine className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
        </a>
      </Button>

      <AccountSettingsSection />

      <PasskeySettingsSection address={address} isSigningOut={isSigningOut} />

      <InstallAppLink />

      <section aria-labelledby="preferences-title" className="space-y-3">
        <h2 id="preferences-title">
          <Trans>Preferences</Trans>
        </h2>
        <div className="border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              <Trans>Choose between light and dark mode.</Trans>
            </p>
            <ThemeSelector triggerClassName="w-32" />
          </div>
          <div className="-mx-4 my-3 h-px bg-border" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              <Trans>Choose the app display language.</Trans>
            </p>
            <LanguageSelector triggerClassName="w-32" />
          </div>
          <div className="-mx-4 my-3 h-px bg-border" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              <Trans>Choose how far away marketplace results can be.</Trans>
            </p>
            <VisibilitySelector triggerClassName="w-32" />
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
          <RiLogoutBoxRLine className="me-2 size-4" aria-hidden="true" />
          {isSigningOut ? <Trans>Signing out...</Trans> : <Trans>Sign out</Trans>}
        </Button>
      </section>

      {/* Support asks for this; QA matches it against /build-info.json. */}
      <div className="flex items-center justify-between gap-3 border border-border bg-card p-4">
        <p className="text-muted-foreground text-sm">
          <Trans>App version</Trans>
        </p>
        <p dir="ltr" className="font-mono text-xs">
          {BUILD_INFO.version} ({BUILD_INFO.buildNumber}) · {BUILD_INFO.gitSha.slice(0, 7)}
          {BUILD_INFO.dirty ? "*" : ""}
        </p>
      </div>
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
