import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazy, Suspense } from "react";
import { FaApple, FaGoogle } from "react-icons/fa";
import { FiKey, FiX } from "react-icons/fi";
import { TbNfc, TbScan } from "react-icons/tb";

import { NfcCardPrompt } from "#/components/nfc-card-prompt";
import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { Input } from "#/components/ui/input";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { ApprovalPending, ApprovalRejected } from "./auth-states";
import { type UseSignInOptions, useSignIn } from "./use-sign-in";

const EncryptedPaperWalletImportForm = lazy(() =>
  import("#/components/encrypted-paper-wallet-import-form").then((module) => ({
    default: module.EncryptedPaperWalletImportForm,
  })),
);

export type SignInPanelProps = UseSignInOptions & {
  onCancel?: () => void;
};

export function SignInPanel({ onCancel, ...options }: SignInPanelProps) {
  const { t } = useLingui();
  const createAccountReplace = options.createAccountReplace ?? false;
  const {
    panelState,
    retryAction,
    approvalBusy,
    connecting,
    cardRead,
    error,
    passkey: { available, provider, label: providerLabel },
    nfcSupported,
    nfcScan,
    nfcProblem,
    showNfc,
    showScanner,
    showAdvanced,
    showPkInput,
    pkInput,
    setPkInput,
    encryptedPaperWallet,
    accountNotFoundOpen,
    createAccountSearch,
    signInWithPasskey,
    startNfc,
    closeNfc,
    handlePkSubmit,
    handleKeyScanned,
    onEncryptedDecrypted,
    routeToSignup,
    closeAccountNotFound,
    openScanner,
    closeScanner,
    openPrivateKey,
    closePrivateKey,
    closeEncrypted,
    toggleAdvanced,
  } = useSignIn(options);
  const ProviderIcon = provider === "apple" ? FaApple : FaGoogle;

  if (panelState === "approvalPending") {
    return <ApprovalPending onRetry={retryAction ?? undefined} busy={approvalBusy} />;
  }

  if (panelState === "approvalRejected") {
    return <ApprovalRejected />;
  }

  // An error belongs to whichever method raised it: inside its sheet while one
  // is open, above the methods otherwise.
  const sheetOpen =
    !connecting && (showScanner || showNfc || showPkInput || encryptedPaperWallet !== null);
  const errorAlert = error ? (
    <p role="alert" className="text-destructive text-xs">
      {error}
    </p>
  ) : null;

  return (
    <div className="flex flex-1 flex-col gap-3">
      {sheetOpen ? null : errorAlert}

      {connecting ? (
        <div
          className="flex h-11 items-center gap-3 border border-border bg-card px-3"
          aria-live="polite"
        >
          <Spinner className="text-muted-foreground" />
          <span className="font-medium text-sm">
            {cardRead ? <Trans>Card read — signing in</Trans> : <Trans>Connecting…</Trans>}
          </span>
        </div>
      ) : (
        <>
          {/* One way in leads: the passkey where the device has one, else the card. */}
          {available ? (
            <Button tap className="w-full" onClick={() => void signInWithPasskey()}>
              <ProviderIcon className="me-2 size-4" />
              {t`Continue with ${providerLabel}`}
            </Button>
          ) : (
            <Button tap className="w-full" onClick={openScanner}>
              <TbScan className="me-2 size-4" />
              <Trans>Continue with Paper Wallet</Trans>
            </Button>
          )}

          {available || nfcSupported ? (
            <div className="border border-border bg-card">
              {available ? (
                <ActionRow
                  icon={<TbScan className="size-4" aria-hidden="true" />}
                  label={t`Continue with Paper Wallet`}
                  onClick={openScanner}
                />
              ) : null}
              {nfcSupported ? (
                <ActionRow
                  icon={<TbNfc className="size-4" aria-hidden="true" />}
                  label={t`Tap NFC card`}
                  onClick={startNfc}
                />
              ) : null}
            </div>
          ) : null}

          <Button
            variant="link"
            tap
            className="w-full text-muted-foreground hover:text-foreground"
            aria-expanded={showAdvanced}
            onClick={toggleAdvanced}
          >
            <Trans>Advanced options</Trans>
          </Button>

          {showAdvanced ? (
            <div className="border border-border bg-card">
              <ActionRow
                icon={<FiKey className="size-4" aria-hidden="true" />}
                label={t`Private key`}
                onClick={openPrivateKey}
              />
            </div>
          ) : null}
        </>
      )}

      {onCancel ? (
        <Button variant="ghost" tap className="w-full" onClick={onCancel}>
          <Trans>Cancel</Trans>
        </Button>
      ) : null}

      <p className="mt-auto pt-3 text-center text-muted-foreground text-xs">
        <Trans>New to CLC?</Trans>{" "}
        <Link
          to="/onboarding"
          search={createAccountSearch}
          replace={createAccountReplace}
          className="font-medium text-foreground underline underline-offset-4"
        >
          <Trans>Create an account</Trans>
        </Link>
      </p>

      <MethodSheet open={showScanner && !connecting} onClose={closeScanner} title={t`Paper Wallet`}>
        <div className="space-y-3">
          <PaperWalletScanner onKeyDecoded={handleKeyScanned} onCancel={closeScanner} />
          {errorAlert}
        </div>
      </MethodSheet>

      <MethodSheet open={showNfc && !connecting} onClose={closeNfc} title={t`Tap your NFC card`}>
        <NfcCardPrompt
          phase={nfcScan.phase}
          error={nfcScan.error}
          readFailed={nfcScan.readFailed}
          problem={nfcProblem}
          title={<Trans>Tap your NFC card</Trans>}
          onRetry={startNfc}
          onCancel={closeNfc}
        />
      </MethodSheet>

      <MethodSheet
        open={!!encryptedPaperWallet && !connecting}
        onClose={closeEncrypted}
        title={t`Password-protected paper wallet`}
      >
        {encryptedPaperWallet ? (
          <Suspense fallback={null}>
            <EncryptedPaperWalletImportForm
              encryptedKey={encryptedPaperWallet}
              onDecrypted={onEncryptedDecrypted}
              onCancel={closeEncrypted}
            />
          </Suspense>
        ) : null}
        {errorAlert}
      </MethodSheet>

      <MethodSheet
        open={showPkInput && !connecting}
        onClose={closePrivateKey}
        title={t`Private key`}
      >
        <form onSubmit={handlePkSubmit} className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              <Trans>Private key</Trans>
            </p>
            <Button
              variant="ghost"
              size="icon"
              tap
              aria-label={t`Close private key form`}
              onClick={closePrivateKey}
            >
              <FiX className="size-4" />
            </Button>
          </div>
          <Input
            type="password"
            autoComplete="off"
            value={pkInput}
            onChange={(e) => setPkInput(e.target.value)}
            placeholder="0x..."
            className="font-mono"
            aria-invalid={!!error}
            aria-label={t`Private key`}
          />
          {errorAlert}
          <Button type="submit" tap disabled={!pkInput.trim()} className="w-full">
            <FiKey className="me-2 size-4" />
            <Trans>Sign in with private key</Trans>
          </Button>
        </form>
      </MethodSheet>

      <SheetRoot
        open={accountNotFoundOpen}
        onOpenChange={(open) => {
          if (!open) closeAccountNotFound();
        }}
      >
        <SheetPortal>
          <SheetBackdrop />
          <SheetContent className="[&>div:first-child]:hidden">
            <SheetHeader className="px-6 pt-6">
              <SheetTitle>
                <Trans>Account not found</Trans>
              </SheetTitle>
              <p className="text-muted-foreground text-sm">
                <Trans>No CLC account was found for this sign-in.</Trans>
              </p>
            </SheetHeader>
            <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <Button tap className="w-full" onClick={routeToSignup}>
                <Trans>Create an account</Trans>
              </Button>
              <Button variant="ghost" tap className="w-full" onClick={closeAccountNotFound}>
                <Trans>Cancel</Trans>
              </Button>
            </SheetFooter>
          </SheetContent>
        </SheetPortal>
      </SheetRoot>
    </div>
  );
}

/**
 * A sign-in method's own screen, raised over the method list so the list does
 * not move. The method keeps its header and close button; the title is for
 * screen readers.
 */
function MethodSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <SheetRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent>
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
