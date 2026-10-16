import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useId, useState } from "react";
import {
  RiCodeSSlashLine,
  RiDownloadLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiInformationLine,
  RiLoader4Line,
  RiLogoutBoxRLine,
  RiShareLine,
  RiShieldFlashLine,
} from "react-icons/ri";
import { toast } from "sonner";

import { LanguageSettingsRow } from "#/components/language-selector";
import { ThemeSettingsRow } from "#/components/theme-selector";
import { ActionRow } from "#/components/ui/action-row";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { SettingsSheet } from "#/components/ui/settings-sheet";
import { VisibilitySettingsRow } from "#/components/visibility-selector";
import { EllipsizedAddress, HighlightAddress } from "#/components/wallet";
import { BUILD_INFO } from "#/features/app-updates/build-info";
import { useInstallStore } from "#/features/install/install-store";
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
  const installed = useInstallStore((state) => state.installed);

  return (
    <div className="space-y-6">
      <h1>
        <Trans>Settings</Trans>
      </h1>

      <SettingsGroup label={t`Account`}>
        <AccountSettingsSection />
      </SettingsGroup>

      <SettingsGroup label={t`Preferences`}>
        <ThemeSettingsRow />
        <LanguageSettingsRow />
        <VisibilitySettingsRow />
        <NotificationSettingsSection walletAddress={address} />
      </SettingsGroup>

      <SettingsGroup label={t`Sign-in`}>
        <PasskeySettingsSection address={address} isSigningOut={isSigningOut} />
        <WalletSessionRow address={address} delegationStatus={delegationStatus} />
      </SettingsGroup>

      <SettingsGroup label={t`App`}>
        <ActionRow
          icon={
            installed ? (
              <RiShareLine className="size-4" aria-hidden="true" />
            ) : (
              <RiDownloadLine className="size-4" aria-hidden="true" />
            )
          }
          label={installed ? t`Share CLC` : t`Install CLC`}
          render={<Link to="/install" search={{ from: "settings" }} />}
        />
        <ActionRow
          icon={<RiInformationLine className="size-4" aria-hidden="true" />}
          label={t`About Cosmo-Local Credit`}
          trailingIcon={<RiExternalLinkLine className="rtl:-scale-x-100 size-4" />}
          render={<a href={PLATFORM_ABOUT_URL} target="_blank" rel="noopener noreferrer" />}
        />
        {/* Support asks for this; QA matches it against /build-info.json. */}
        <ActionRow
          icon={<RiCodeSSlashLine className="size-4" aria-hidden="true" />}
          label={t`App version`}
          value={
            <span dir="ltr" className="font-mono">
              {BUILD_INFO.version} ({BUILD_INFO.buildNumber}) · {BUILD_INFO.gitSha.slice(0, 7)}
              {BUILD_INFO.dirty ? "*" : ""}
            </span>
          }
        />
      </SettingsGroup>

      <SettingsGroup label={t`Session`}>
        <SignOutRow isSigningOut={isSigningOut} onSignOut={onSignOut} />
      </SettingsGroup>
    </div>
  );
}

/**
 * Signing out clears this device's wallet secrets, so it asks first: a
 * paper-wallet member without the card to hand cannot get back in.
 */
function SignOutRow({ isSigningOut, onSignOut }: { isSigningOut: boolean; onSignOut: () => void }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActionRow
        tone="destructive"
        icon={
          isSigningOut ? (
            <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RiLogoutBoxRLine className="size-4" aria-hidden="true" />
          )
        }
        label={isSigningOut ? t`Signing out…` : t`Sign out`}
        onClick={isSigningOut ? undefined : () => setOpen(true)}
      />
      <SettingsSheet
        open={open}
        onOpenChange={setOpen}
        title={t`Sign out?`}
        footer={
          <>
            <Button
              variant="outline"
              className="h-11 w-full border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              <RiLogoutBoxRLine aria-hidden="true" />
              <Trans>Sign out</Trans>
            </Button>
            <Button variant="outline" className="h-11 w-full" onClick={() => setOpen(false)}>
              <Trans>Cancel</Trans>
            </Button>
          </>
        }
      >
        <p className="text-sm">
          <Trans>You’ll need your paper card or passkey to sign back in.</Trans>
        </p>
      </SettingsSheet>
    </>
  );
}

/**
 * A labelled panel of rows. The label stays foreground: muted text on the
 * gray page background falls short of 4.5:1.
 */
function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2 font-heading font-semibold text-foreground text-sm">
        {label}
      </h2>
      <div className="border border-border bg-card">{children}</div>
    </section>
  );
}

function WalletSessionRow({
  address,
  delegationStatus,
}: {
  address?: `0x${string}`;
  delegationStatus: CaliburDelegationStatus;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);

  const copyAddress = () => {
    if (!address || !navigator.clipboard) {
      toast.error(t`Couldn't copy address`);
      return;
    }
    void navigator.clipboard
      .writeText(address)
      .then(() => toast.success(t`Address copied`))
      .catch(() => toast.error(t`Couldn't copy address`));
  };

  return (
    <>
      <ActionRow
        icon={<RiShieldFlashLine className="size-4" aria-hidden="true" />}
        label={t`Wallet session`}
        value={address ? <EllipsizedAddress address={address} /> : null}
        onClick={() => setOpen(true)}
      />
      <SettingsSheet open={open} onOpenChange={setOpen} title={t`Wallet session`}>
        <div className="border border-border bg-card">
          <div className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">
                <Trans>Connected address</Trans>
              </p>
              {address ? (
                <HighlightAddress
                  address={address}
                  tailLength={5}
                  className="mt-0.5 block text-foreground"
                />
              ) : (
                <p className="mt-0.5 text-sm">
                  <Trans>No address available</Trans>
                </p>
              )}
            </div>
            {address ? (
              <Button
                variant="outline"
                size="icon-lg"
                aria-label={t`Copy address`}
                onClick={copyAddress}
              >
                <RiFileCopyLine aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border p-3">
            <p className="text-sm">
              <Trans>Delegated to Calibur</Trans>
            </p>
            <CaliburDelegationBadge status={delegationStatus} />
          </div>
        </div>
      </SettingsSheet>
    </>
  );
}

function CaliburDelegationBadge({ status }: { status: CaliburDelegationStatus }) {
  const { t } = useLingui();

  const isDelegated = status === "delegated";
  const label = isDelegated ? t`Active` : status === "checking" ? t`Checking…` : t`Inactive`;

  return <Badge variant={isDelegated ? "primary" : "muted"}>{label}</Badge>;
}
