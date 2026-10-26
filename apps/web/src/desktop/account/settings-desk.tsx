import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { RiExternalLinkLine, RiLogoutBoxRLine } from "react-icons/ri";
import { useConnection } from "wagmi";

import {
  IntroductionReplayButton,
  useIntroductionReplay,
} from "#/components/introduction/introduction-provider";
import { LanguageSettingsRow } from "#/components/language-selector";
import { ThemeSettingsRow } from "#/components/theme-selector";
import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { DeskCanvas, DeskPanel, DeskSection, DeskTitle } from "#/desktop/ui/page";
import { BUILD_INFO } from "#/features/app-updates/build-info";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useSignOut } from "#/features/home/hooks/use-sign-out";
import { AccountSettingsSection } from "#/features/home/ui/account-settings-section";
import { NotificationSettingsSection } from "#/features/home/ui/notification-settings-section";
import { PasskeySettingsSection } from "#/features/home/ui/passkey-settings-section";
import { WalletSessionRow } from "#/features/home/ui/settings-page";
import { useInstallStore } from "#/features/install/install-store";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { PLATFORM_ABOUT_URL } from "#/lib/legal";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";

export function SettingsDesk({ address }: { address?: `0x${string}` }) {
  const { t } = useLingui();
  const connection = useConnection();
  const auth = useAuthStatus();
  const wallet = address ?? connection.address;
  const locationOwner = auth.isAuthenticated && wallet ? wallet.toLowerCase() : GUEST_STORAGE_OWNER;
  const { signOut, isSigningOut } = useSignOut(locationOwner);
  const delegationStatus = useCaliburDelegation(wallet);
  const installed = useInstallStore((state) => state.installed);
  const replayIntroduction = useIntroductionReplay();
  const [confirming, setConfirming] = useState(false);

  return (
    <DeskCanvas width="read">
      <DeskTitle>
        <Trans>Settings</Trans>
      </DeskTitle>

      <div className="mt-8 space-y-8">
        <DeskSection title={t`Account`}>
          <DeskPanel className="p-0">
            <AccountSettingsSection />
          </DeskPanel>
        </DeskSection>

        <DeskSection title={t`Preferences`}>
          <DeskPanel className="p-0">
            <SettingControl label={<Trans>Language</Trans>}>
              <LanguageSettingsRow />
            </SettingControl>
            <SettingControl label={<Trans>Theme</Trans>}>
              <ThemeSettingsRow />
            </SettingControl>
            <NotificationSettingsSection walletAddress={wallet} />
          </DeskPanel>
        </DeskSection>

        <DeskSection title={t`Sign-in`}>
          <DeskPanel className="p-0">
            <SettingControl label={<Trans>Passkey</Trans>}>
              <PasskeySettingsSection address={wallet} isSigningOut={isSigningOut} />
            </SettingControl>
            <SettingControl label={<Trans>Wallet session</Trans>}>
              <WalletSessionRow address={wallet} delegationStatus={delegationStatus} />
            </SettingControl>
          </DeskPanel>
        </DeskSection>

        <DeskSection title={t`App`}>
          <DeskPanel className="p-0">
            {replayIntroduction ? (
              <SettingControl label={t({ id: "intro.replay", message: "How to use CLC" })}>
                <IntroductionReplayButton />
              </SettingControl>
            ) : null}
            <SettingRow
              label={installed ? t`Share CLC` : t`Install CLC`}
              action={
                <Button asChild variant="outline">
                  <Link to="/install" search={{ from: "settings" }}>
                    {installed ? <Trans>Share CLC</Trans> : <Trans>Install CLC</Trans>}
                  </Link>
                </Button>
              }
            />
            <SettingRow
              label={<Trans>About Cosmo-Local Credit</Trans>}
              action={
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  aria-label={t`About Cosmo-Local Credit`}
                >
                  <a href={PLATFORM_ABOUT_URL} target="_blank" rel="noopener noreferrer">
                    <RiExternalLinkLine className="rtl:-scale-x-100" aria-hidden="true" />
                  </a>
                </Button>
              }
            />
            <SettingRow
              label={<Trans>App version</Trans>}
              value={
                <span dir="ltr" className="font-mono">
                  {BUILD_INFO.version} ({BUILD_INFO.buildNumber}) · {BUILD_INFO.gitSha.slice(0, 7)}
                  {BUILD_INFO.dirty ? "*" : ""}
                </span>
              }
            />
          </DeskPanel>
        </DeskSection>

        <DeskSection title={t`Session`}>
          <DeskPanel className="p-0">
            <SettingRow
              label={isSigningOut ? t`Signing out…` : t`Sign out`}
              action={
                <Button
                  variant="destructive"
                  pending={isSigningOut}
                  onClick={() => setConfirming(true)}
                >
                  <RiLogoutBoxRLine aria-hidden="true" />
                  <Trans>Sign out</Trans>
                </Button>
              }
            />
          </DeskPanel>
        </DeskSection>
      </div>

      <DialogRoot open={confirming} onOpenChange={setConfirming}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogContent className="rounded-none border border-border bg-card shadow-none">
            <DialogTitle>
              <Trans>Sign out?</Trans>
            </DialogTitle>
            <p className="mt-3 text-sm">
              <Trans>You’ll need your paper card or passkey to sign back in.</Trans>
            </p>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)}>
                <Trans>Cancel</Trans>
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  setConfirming(false);
                  void signOut();
                }}
              >
                <RiLogoutBoxRLine aria-hidden="true" />
                <Trans>Sign out</Trans>
              </Button>
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </DeskCanvas>
  );
}

function SettingRow({
  label,
  value,
  action,
}: {
  label: ReactNode;
  value?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-4 border-b border-border px-4 last:border-b-0">
      <div className="w-[220px] shrink-0 text-sm font-medium">{label}</div>
      <div className="min-w-0 flex-1 truncate text-sm">{value}</div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function SettingControl({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-stretch border-b border-border last:border-b-0">
      <div className="flex w-[220px] shrink-0 items-center px-4 text-sm font-medium">{label}</div>
      <div className="min-w-0 flex-1 [&_[class*='flex-1']]:hidden">{children}</div>
    </div>
  );
}
