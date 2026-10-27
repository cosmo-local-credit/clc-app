import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { FaApple, FaGoogle } from "react-icons/fa";
import { FiLock } from "react-icons/fi";
import { RiCheckLine, RiEdit2Line, RiErrorWarningLine } from "react-icons/ri";

import { GuideArt } from "#/components/introduction/guide-art";
import { OnboardingScreen, OnboardingTitle } from "#/components/onboarding-screen";
import { TermsAcceptanceField } from "#/components/terms-acceptance-field";
import { AgreementField } from "#/components/ui/agreement-field";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { SettingsSheet } from "#/components/ui/settings-sheet";
import { Spinner } from "#/components/ui/spinner";
import { StepProgress } from "#/components/ui/step-progress";
import { BackChevron } from "#/components/wallet/wallet-layout";
import {
  type UseOnboardingWalletOptions,
  useOnboardingWallet,
} from "#/features/onboarding/hooks/use-onboarding-wallet";
import { onboardingSearch, type WalletPage } from "#/lib/onboarding-search";
import { cn } from "#/lib/utils";
import { PaperWalletCustomizer } from "./paper-wallet-customizer";
import { PaperWalletProtectionControls } from "./paper-wallet-protection";
import { PaperWalletPreview, PaperWalletSaveActions } from "./paper-wallet-setup";

/** Where each wallet page sits in the whole signup, after the profile's three. */
const PAGE_STEP: Record<WalletPage, number> = { card: 4, save: 5, link: 6 };

type Props = UseOnboardingWalletOptions & {
  /** Moves to the next page. */
  onPage: (page: Exclude<WalletPage, "card">) => void;
  redirectTo?: string;
  progressTotal: number;
  /** The device can store a passkey: the last page offers it beside the paper wallet. */
  linkPasskey: boolean;
};

/**
 * The paper wallet, as three jobs in the order the code enforces them: protect
 * the card with a password, save it, then finish. Finishing offers a passkey
 * beside the paper wallet where the device can store one; otherwise the terms
 * and Continue to wallet sit on the save page.
 */
export function OnboardingWalletStep({
  onPage,
  redirectTo,
  progressTotal,
  linkPasskey,
  ...options
}: Props) {
  const { page } = options;
  const { t } = useLingui();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const {
    provider,
    providerLabel,
    protection,
    setup,
    paperWalletDownloaded,
    canContinue,
    acked,
    setAcked,
    acceptedTerms,
    setAcceptedTerms,
    passkeyRegistered,
    linkConnectError,
    sessionError,
    linkFailed,
    linkBusy,
    paperBusy,
    linkPending,
    paperPending,
    statusText,
    errorMessage,
    showPendingView,
    pendingPath,
    pendingPhase,
    handleLinkPasskey,
    handleContinue,
  } = useOnboardingWallet(options);
  const {
    isReady: paperWalletReady,
    isEncrypting: paperWalletEncrypting,
    needsPassword,
    protect,
  } = protection;
  const ProviderIcon = provider === "apple" ? FaApple : FaGoogle;

  if (showPendingView) {
    return <OnboardingWalletPending path={pendingPath} phase={pendingPhase} status={statusText} />;
  }

  const finishing = (
    <>
      {errorMessage ? (
        <p role="alert" className="text-destructive text-xs">
          {errorMessage}
        </p>
      ) : null}
      {statusText ? <p className="text-muted-foreground text-xs">{statusText}</p> : null}
    </>
  );

  const back = page === "link" ? "save" : page === "save" ? "card" : "location";

  if (page === "card") {
    return (
      <OnboardingScreen
        start={
          <BackChevron
            label={t`Back`}
            to="/onboarding"
            search={onboardingSearch(back, redirectTo)}
          />
        }
        footer={
          needsPassword ? (
            <Button
              tap
              className="w-full"
              pending={paperWalletEncrypting}
              onClick={() => void protect()}
            >
              <FiLock className="size-4" />
              {paperWalletEncrypting ? t`Protecting paper wallet…` : t`Protect paper wallet`}
            </Button>
          ) : (
            <Button tap className="w-full" onClick={() => onPage("save")}>
              <Trans>Continue</Trans>
            </Button>
          )
        }
      >
        <StepProgress step={PAGE_STEP.card} total={progressTotal} className="" />
        <OnboardingTitle>
          <Trans>Your paper wallet</Trans>
        </OnboardingTitle>
        <div className="flex items-start gap-2.5 border border-border bg-card p-3 text-sm">
          <RiErrorWarningLine
            className="mt-0.5 size-4 shrink-0 text-warning-foreground"
            aria-hidden="true"
          />
          <p>
            <Trans>
              Save this card securely. If you use a password, keep it separately. Anyone with an
              unprotected QR code can access the wallet.
            </Trans>
          </p>
        </div>
        <PaperWalletProtectionControls protection={protection} />
      </OnboardingScreen>
    );
  }

  if (page === "save") {
    return (
      <OnboardingScreen
        start={
          <BackChevron
            label={t`Back`}
            to="/onboarding"
            search={onboardingSearch(back, redirectTo)}
          />
        }
        footer={
          <>
            {!paperWalletDownloaded ? (
              <p className="text-muted-foreground text-xs">
                <Trans>Download your paper wallet before continuing.</Trans>
              </p>
            ) : null}
            {linkPasskey ? (
              <Button tap className="w-full" disabled={!canContinue} onClick={() => onPage("link")}>
                <Trans>Continue</Trans>
              </Button>
            ) : (
              <>
                {finishing}
                <Button
                  tap
                  className="w-full"
                  onClick={() => void handleContinue()}
                  disabled={paperBusy}
                  pending={paperPending}
                >
                  <Trans>Continue to wallet</Trans>
                </Button>
              </>
            )}
          </>
        }
      >
        <StepProgress step={PAGE_STEP.save} total={progressTotal} className="" />
        <div className="flex items-start justify-between gap-3">
          <OnboardingTitle>
            <Trans>Save your card</Trans>
          </OnboardingTitle>
          <Button
            variant="outline"
            tap
            className="mt-0.5 shrink-0"
            aria-haspopup="dialog"
            onClick={() => setCustomizeOpen(true)}
          >
            <RiEdit2Line className="size-4" aria-hidden="true" />
            <Trans>Customize</Trans>
          </Button>
        </div>
        <PaperWalletPreview setup={setup} />
        <PaperWalletSaveActions setup={setup} />
        <AgreementField
          id="signup-saved-key"
          checked={acked}
          onCheckedChange={setAcked}
          disabled={!paperWalletReady || paperWalletEncrypting}
        >
          <Trans>I have saved this key. If lost, my wallet cannot be recovered.</Trans>
        </AgreementField>
        {linkPasskey ? null : (
          <TermsAcceptanceField
            id="signup-terms"
            checked={acceptedTerms}
            onCheckedChange={setAcceptedTerms}
          />
        )}
        <SettingsSheet
          open={customizeOpen}
          onOpenChange={setCustomizeOpen}
          title={t`Customize`}
          footer={
            <Button tap className="w-full" onClick={() => setCustomizeOpen(false)}>
              <Trans>Done</Trans>
            </Button>
          }
        >
          <PaperWalletCustomizer value={setup.customization} onChange={setup.setCustomization} />
        </SettingsSheet>
      </OnboardingScreen>
    );
  }

  return (
    <OnboardingScreen
      start={
        <BackChevron label={t`Back`} to="/onboarding" search={onboardingSearch(back, redirectTo)} />
      }
      footer={
        <>
          {finishing}
          <Button
            variant={linkFailed ? "outline" : "default"}
            tap
            className="w-full"
            onClick={() => void handleLinkPasskey()}
            disabled={linkBusy}
            pending={linkPending}
          >
            <ProviderIcon className="size-4" />
            {passkeyRegistered && (linkConnectError || sessionError)
              ? t`Retry ${providerLabel} connection`
              : t`Link wallet to ${providerLabel}`}
          </Button>
          <Button
            variant={linkFailed ? "default" : "outline"}
            tap
            className="w-full"
            onClick={() => void handleContinue()}
            disabled={paperBusy}
            pending={paperPending}
          >
            <Trans>Continue with paper wallet</Trans>
          </Button>
        </>
      }
    >
      <StepProgress step={PAGE_STEP.link} total={progressTotal} className="" />
      <OnboardingTitle>{t`Link ${providerLabel}?`}</OnboardingTitle>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {t`Every account gets a paper wallet. Linking ${providerLabel} adds another way to sign in.`}
      </p>
      <GuideArt name="link" className="min-h-26 max-h-48 flex-1" />
      <TermsAcceptanceField
        id="signup-terms"
        checked={acceptedTerms}
        onCheckedChange={setAcceptedTerms}
      />
    </OnboardingScreen>
  );
}

type PendingPath = "passkey" | "paper";

/**
 * Setting up, as the four things it waits for: the account, the passkey or
 * the smart wallet, the network's confirmation, and the wallet connection.
 * The line under them is the step's own status, as before.
 */
function OnboardingWalletPending({
  path,
  phase,
  status,
}: {
  path: PendingPath;
  phase: number;
  status: string | null;
}) {
  const { t } = useLingui();
  const labels =
    path === "passkey"
      ? [t`Account`, t`Passkey`, t`Network`, t`Wallet`]
      : [t`Account`, t`Paper wallet`, t`Network`, t`Wallet`];

  return (
    <OnboardingScreen start={<CLCLogo className="size-9" sharp />}>
      <OnboardingTitle>
        <Trans>Setting up your wallet…</Trans>
      </OnboardingTitle>
      <ol className="border border-border bg-card" aria-live="polite">
        {labels.map((label, index) => {
          const done = index < phase;
          const active = index === phase;
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className="flex h-11 items-center gap-3 border-border border-b px-3 last:border-b-0"
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full",
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "text-warning-foreground"
                      : "border-[1.5px] border-border",
                )}
                aria-hidden="true"
              >
                {done ? (
                  <RiCheckLine className="size-3" />
                ) : active ? (
                  <Spinner className="size-5" />
                ) : null}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-medium text-sm",
                  !done && !active && "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {done ? (
                <span className="font-medium text-primary text-xs">
                  <Trans>Done</Trans>
                </span>
              ) : active ? (
                <span className="font-medium text-warning-foreground text-xs">
                  {index === 2 ? <Trans>Confirming</Trans> : <Trans>Pending</Trans>}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="text-muted-foreground text-xs">
        {status ?? <Trans>Waiting for blockchain confirmation…</Trans>}
      </p>
    </OnboardingScreen>
  );
}
