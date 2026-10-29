import { isSupportedLocale, LOCALE_OPTIONS } from "@clc/i18n/locales";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { RiExternalLinkLine, RiFileCopyLine } from "react-icons/ri";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { useIntroductionReplay } from "#/components/introduction/introduction-provider";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger } from "#/components/ui/popover";
import { RadioGroup, RadioGroupRow } from "#/components/ui/radio-group";
import { SettingsSheetAlert } from "#/components/ui/settings-sheet";
import { Switch } from "#/components/ui/switch";
import { EllipsizedAddress } from "#/components/wallet/wallet-address";
import { useShortcutHelp } from "#/desktop/shell/shortcut-help";
import { useCharacterShortcuts } from "#/desktop/shell/shortcut-state";
import { DeskSegment, DeskSegmentItem } from "#/desktop/ui/segment";
import { DeskCanvas, DeskSection, DeskTitle } from "#/desktop/ui/page";
import { BUILD_INFO } from "#/features/app-updates/build-info";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useSignOut } from "#/features/home/hooks/use-sign-out";
import {
  useNotificationCuePreferences,
  useNotificationSettings,
} from "#/features/home/hooks/use-notification-settings";
import { usePasskeySettings } from "#/features/home/hooks/use-passkey-settings";
import { useInstallStore } from "#/features/install/install-store";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { PLATFORM_ABOUT_URL } from "#/lib/legal";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { useHydratedTheme } from "#/providers/theme";
import { useLocale } from "#/providers/i18n";

/**
 * Settings on a wide screen: five short groups on one page, every row one
 * shape — label, value, action — so values and actions line up across groups.
 */
export function SettingsDesk({ address }: { address?: `0x${string}` }) {
  const { t } = useLingui();
  const connection = useConnection();
  const auth = useAuthStatus();
  const wallet = address ?? connection.address;
  const locationOwner = auth.isAuthenticated && wallet ? wallet.toLowerCase() : GUEST_STORAGE_OWNER;
  const { signOut, isSigningOut } = useSignOut(locationOwner);
  const installed = useInstallStore((state) => state.installed);
  const replayIntroduction = useIntroductionReplay();
  const [confirming, setConfirming] = useState(false);

  return (
    <DeskCanvas width="read" className="grid-cols-[minmax(0,760px)]">
      <DeskTitle>
        <Trans>Settings</Trans>
      </DeskTitle>

      <DeskSection title={t`Account`}>
        <SetRows>
          <AccountRow />
        </SetRows>
      </DeskSection>

      <DeskSection title={t`Preferences`}>
        <SetRows>
          <LanguageRow />
          <ThemeRow />
          <NotificationsRow walletAddress={wallet} />
          <ShortcutsRow />
        </SetRows>
      </DeskSection>

      <DeskSection title={t`Sign-in`}>
        <SetRows>
          <PasskeyRow address={wallet} isSigningOut={isSigningOut} />
          <WalletSessionRow address={wallet} />
        </SetRows>
      </DeskSection>

      <DeskSection title={t`App`}>
        <SetRows>
          {replayIntroduction ? (
            <SetRow
              label={t({ id: "intro.replay", message: "How to use CLC" })}
              action={
                <Button variant="ghost" onClick={replayIntroduction}>
                  <Trans>Replay</Trans>
                </Button>
              }
            />
          ) : null}
          <SetRow
            label={installed ? t`Share CLC` : t`Install CLC`}
            action={
              <Button asChild variant="ghost">
                <Link to="/install" search={{ from: "settings" }}>
                  {installed ? <Trans>Share</Trans> : <Trans>Install</Trans>}
                </Link>
              </Button>
            }
          />
          <SetRow
            label={t`About Cosmo-Local Credit`}
            action={
              <Button asChild variant="ghost" size="icon" aria-label={t`About Cosmo-Local Credit`}>
                <a href={PLATFORM_ABOUT_URL} target="_blank" rel="noopener noreferrer">
                  <RiExternalLinkLine className="rtl:-scale-x-100" aria-hidden="true" />
                </a>
              </Button>
            }
          />
          <SetRow
            label={t`App version`}
            value={
              <span dir="ltr" className="font-mono text-muted-foreground">
                {BUILD_INFO.version} · {BUILD_INFO.buildNumber} · {BUILD_INFO.gitSha.slice(0, 7)}
                {BUILD_INFO.dirty ? "*" : ""}
              </span>
            }
          />
        </SetRows>
      </DeskSection>

      <DeskSection title={t`Session`}>
        <SetRows>
          <SetRow
            label={isSigningOut ? t`Signing out…` : t`Sign out`}
            action={
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                pending={isSigningOut}
                onClick={() => setConfirming(true)}
              >
                <Trans>Sign out</Trans>
              </Button>
            }
          />
        </SetRows>
      </DeskSection>

      <DialogRoot open={confirming} onOpenChange={setConfirming}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogContent className="rounded-none border border-border bg-card shadow-none">
            <DialogTitle>
              <Trans>Sign out?</Trans>
            </DialogTitle>
            <p className="mt-3 text-sm">
              <Trans>You’ll need your sign-in card or passkey to sign back in.</Trans>
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
                <Trans>Sign out</Trans>
              </Button>
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </DeskCanvas>
  );
}

const NOTIFICATIONS_ANCHOR = "notifications";

const ROW_GRID =
  "grid min-h-14 grid-cols-[220px_minmax(0,1fr)_auto] items-center gap-4 ps-4 pe-2.5";

function SetRows({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col border border-border bg-card [&>*+*]:border-border [&>*+*]:border-t">
      {children}
    </div>
  );
}

function SetRow({
  id,
  label,
  value,
  action,
}: {
  /** An anchor other pages link to, as the top bar's notification settings do. */
  id?: string;
  label: ReactNode;
  value?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div id={id} className={ROW_GRID}>
      <span className="min-w-0 truncate text-sm font-semibold">{label}</span>
      <div className="flex min-w-0 items-center gap-2 text-xs">{value}</div>
      <div className="flex shrink-0 items-center justify-end">{action}</div>
    </div>
  );
}

function AccountRow() {
  const { t } = useLingui();
  const profileQuery = useAuthProfile();
  const name = profileQuery.data?.name?.trim();
  const phone = profileQuery.data?.phone?.trim();
  const email = profileQuery.data?.email?.trim();
  // The signup placeholder email is not a contact detail.
  const realEmail = email && !email.endsWith("@clc.local") ? email : "";
  const contact = [realEmail, phone].filter(Boolean);

  return (
    <SetRow
      label={
        profileQuery.isPending ? (
          <span aria-busy="true" className="block h-3 w-32 bg-muted" />
        ) : (
          <span dir="auto">{name || t`Your profile`}</span>
        )
      }
      value={
        profileQuery.isPending ? null : (
          <span className="min-w-0 truncate text-muted-foreground">
            {contact.length > 0 ? (
              contact.map((entry, index) => (
                <span key={entry}>
                  {index > 0 ? " · " : null}
                  <bdi dir="ltr">{entry}</bdi>
                </span>
              ))
            ) : (
              <Trans>Add your contact details</Trans>
            )}
          </span>
        )
      }
      action={
        <Button asChild variant="outline">
          <Link to="/settings/profile">
            <Trans>Edit profile</Trans>
          </Link>
        </Button>
      }
    />
  );
}

/**
 * The language list in a popover anchored to its row. A choice loads its
 * catalog before it applies, so the popover stays open on that row's spinner
 * and closes once the catalog is active, or stays on the error.
 */
function LanguageRow() {
  const { t } = useLingui();
  const { locale, setLocale, loading, error } = useLocale();
  const [open, setOpen] = useState(false);
  const [awaitingLoad, setAwaitingLoad] = useState(false);
  const loadStarted = useRef(false);
  const current = LOCALE_OPTIONS.find((option) => option.code === locale);

  useEffect(() => {
    if (!awaitingLoad) return;
    if (loading) {
      loadStarted.current = true;
      return;
    }
    if (!loadStarted.current) return;
    setAwaitingLoad(false);
    if (!error) setOpen(false);
  }, [awaitingLoad, loading, error]);

  return (
    <SetRow
      label={t`Language`}
      value={
        current ? (
          <bdi dir={current.direction} lang={current.code}>
            {current.nativeLabel}
          </bdi>
        ) : null
      }
      action={
        <PopoverRoot open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button variant="ghost" />}>
            <Trans>Change</Trans>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3 p-0">
            {error ? (
              <div className="px-3 pt-3">
                <SettingsSheetAlert>{t`Unable to load language. Reverted to English.`}</SettingsSheetAlert>
              </div>
            ) : null}
            <RadioGroup
              aria-label={t`Language`}
              value={locale}
              onValueChange={(next) => {
                if (typeof next !== "string" || !isSupportedLocale(next)) return;
                loadStarted.current = false;
                setAwaitingLoad(true);
                setLocale(next);
              }}
              className="gap-0"
            >
              {LOCALE_OPTIONS.map((option) => (
                <RadioGroupRow
                  key={option.code}
                  value={option.code}
                  label={
                    <bdi dir={option.direction} lang={option.code}>
                      {option.nativeLabel}
                    </bdi>
                  }
                  busy={loading && option.code === locale}
                  disabled={loading && option.code !== locale}
                />
              ))}
            </RadioGroup>
          </PopoverContent>
        </PopoverRoot>
      }
    />
  );
}

function ThemeRow() {
  const { t } = useLingui();
  const { theme, setTheme } = useHydratedTheme();

  return (
    <SetRow
      label={t`Theme`}
      action={
        <DeskSegment label={t`Theme`}>
          <DeskSegmentItem active={theme !== "dark"}>
            <button type="button" onClick={() => setTheme("light")}>
              <Trans>Light</Trans>
            </button>
          </DeskSegmentItem>
          <DeskSegmentItem active={theme === "dark"}>
            <button type="button" onClick={() => setTheme("dark")}>
              <Trans>Dark</Trans>
            </button>
          </DeskSegmentItem>
        </DeskSegment>
      }
    />
  );
}

/**
 * Push notifications, with Sound and Vibration beside them in one popover:
 * the realtime cue runs for every signed-in wallet, with or without push
 * permission. Checking and On have nothing to explain, so the popover then
 * holds the cue switches alone, and a wallet-less, detail-less row has none.
 */
function NotificationsRow({ walletAddress }: { walletAddress?: `0x${string}` }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const { presentation, hasDetail, enabling, enable } = useNotificationSettings(walletAddress);
  const hasPopover = hasDetail || Boolean(walletAddress);
  if (open && !hasPopover) setOpen(false);

  // The top bar links here (`#notifications`): bring the row into view, and
  // open its preferences once there is something to open.
  const requested = useRouterState({
    select: (state) => state.location.hash.replace(/^#/, "") === NOTIFICATIONS_ANCHOR,
  });
  const arrived = useRef(false);
  useEffect(() => {
    if (!requested) return;
    document.getElementById(NOTIFICATIONS_ANCHOR)?.scrollIntoView?.({ block: "center" });
  }, [requested]);
  useEffect(() => {
    if (!requested || !hasPopover || arrived.current) return;
    arrived.current = true;
    setOpen(true);
  }, [requested, hasPopover]);

  return (
    <SetRow
      id={NOTIFICATIONS_ANCHOR}
      label={t`Notifications`}
      value={presentation.status}
      action={
        hasPopover ? (
          <PopoverRoot open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<Button variant="ghost" />}>
              <Trans>Manage</Trans>
            </PopoverTrigger>
            <PopoverContent align="end" className="grid w-80 gap-3">
              {hasDetail ? (
                <>
                  <PopoverTitle className="font-heading text-sm font-semibold">
                    {presentation.title}
                  </PopoverTitle>
                  {presentation.description ? (
                    <p className="text-muted-foreground text-sm">{presentation.description}</p>
                  ) : null}
                  {presentation.alert ? (
                    <SettingsSheetAlert>{presentation.alert}</SettingsSheetAlert>
                  ) : null}
                  {presentation.canEnable ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      pending={enabling}
                      onClick={() => {
                        void enable();
                      }}
                    >
                      {enabling ? (
                        <Trans>Enabling notifications…</Trans>
                      ) : (
                        <Trans>Enable notifications</Trans>
                      )}
                    </Button>
                  ) : null}
                </>
              ) : (
                <PopoverTitle className="sr-only">{t`Notifications`}</PopoverTitle>
              )}
              {walletAddress ? <NotificationCueSwitches separated={hasDetail} /> : null}
            </PopoverContent>
          </PopoverRoot>
        ) : null
      }
    />
  );
}

/**
 * The shortcut list, and the switch for the single-key shortcuts. Ctrl/⌘ K and
 * Escape are not character keys and stay on.
 */
function ShortcutsRow() {
  const { t } = useLingui();
  const { enabled, setEnabled } = useCharacterShortcuts();
  const setHelpOpen = useShortcutHelp((state) => state.setOpen);
  return (
    <SetRow
      label={t`Keyboard shortcuts`}
      value={
        <span className="text-muted-foreground">
          {enabled ? (
            <Trans>Single-key shortcuts on</Trans>
          ) : (
            <Trans>Single-key shortcuts off</Trans>
          )}
        </span>
      }
      action={
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label={t`Single-key shortcuts`}
          />
          <Button variant="ghost" onClick={() => setHelpOpen(true)}>
            <Trans>View</Trans>
          </Button>
        </div>
      }
    />
  );
}

function NotificationCueSwitches({ separated }: { separated: boolean }) {
  const { t } = useLingui();
  const { sound, vibration, setSound, setVibration, canVibrate } = useNotificationCuePreferences();

  return (
    <div className={separated ? "-mx-4 border-t border-border px-4 pt-1" : "-my-1"}>
      <CueSwitch label={t`Sound`} checked={sound} onCheckedChange={setSound} />
      {canVibrate ? (
        <CueSwitch label={t`Vibration`} checked={vibration} onCheckedChange={setVibration} />
      ) : null}
    </div>
  );
}

function CueSwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex h-10 items-center justify-between gap-3 text-sm font-medium">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

/**
 * The passkey's status as a badge, and its explanation, error and actions in a
 * popover. Loading, and a passkey linked here in a passkey session, have
 * nothing to add, so neither offers Manage.
 */
function PasskeyRow({ address, isSigningOut }: { address?: `0x${string}`; isSigningOut: boolean }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const {
    passkey,
    badge,
    errorText,
    shownDescription,
    hasDetail,
    canLink,
    canSwitch,
    canRetryStatus,
  } = usePasskeySettings(address);
  if (open && !hasDetail) setOpen(false);

  return (
    <SetRow
      label={t`Passkey`}
      value={
        badge ? (
          <Badge variant={badge.linked ? "primary" : "muted"} size="sm" caps>
            {badge.label}
          </Badge>
        ) : null
      }
      action={
        hasDetail ? (
          <PopoverRoot open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<Button variant="ghost" />}>
              <Trans>Manage</Trans>
            </PopoverTrigger>
            <PopoverContent align="end" className="grid w-80 gap-3">
              <PopoverTitle className="font-heading text-sm font-semibold">
                {t`Passkey`}
              </PopoverTitle>
              <p className="text-muted-foreground text-sm empty:hidden" aria-live="polite">
                {shownDescription}
              </p>
              {errorText ? <SettingsSheetAlert>{errorText}</SettingsSheetAlert> : null}
              {canRetryStatus ? (
                <Button
                  variant="outline"
                  className="w-full"
                  pending={passkey.retryingStatus}
                  onClick={passkey.retryStatus}
                >
                  <Trans>Try again</Trans>
                </Button>
              ) : null}
              {canLink ? (
                <Button
                  className="w-full"
                  onClick={passkey.link}
                  disabled={isSigningOut}
                  pending={passkey.busy}
                >
                  {passkey.busy ? <Trans>Linking passkey…</Trans> : <Trans>Link a passkey</Trans>}
                </Button>
              ) : null}
              {canSwitch ? (
                <Button
                  className="w-full"
                  onClick={passkey.retryConnection}
                  disabled={isSigningOut}
                  pending={passkey.busy}
                >
                  {passkey.busy ? <Trans>Connecting…</Trans> : <Trans>Retry connection</Trans>}
                </Button>
              ) : null}
            </PopoverContent>
          </PopoverRoot>
        ) : null
      }
    />
  );
}

function WalletSessionRow({ address }: { address?: `0x${string}` }) {
  const { t } = useLingui();
  const delegation = useCaliburDelegation(address);
  const delegated = delegation === "delegated";

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
    <SetRow
      label={t`Wallet session`}
      value={
        <>
          {address ? <EllipsizedAddress address={address} className="text-foreground" /> : null}
          <span className="min-w-0 truncate">
            {address ? "· " : null}
            <Trans>Delegated to Calibur</Trans>
          </span>
          <Badge variant={delegated ? "primary" : "muted"} size="sm" caps>
            {delegated ? t`Active` : delegation === "checking" ? t`Checking…` : t`Inactive`}
          </Badge>
        </>
      }
      action={
        address ? (
          <Button variant="ghost" size="icon" aria-label={t`Copy address`} onClick={copyAddress}>
            <RiFileCopyLine aria-hidden="true" />
          </Button>
        ) : null
      }
    />
  );
}
