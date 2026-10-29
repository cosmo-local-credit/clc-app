import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useEffectEvent, useState } from "react";
import { FaApple, FaGoogle } from "react-icons/fa";
import { RiArrowDownSLine, RiCheckLine, RiUploadLine } from "react-icons/ri";
import { TbNfc, TbScan } from "react-icons/tb";

import { ApprovalPending, ApprovalRejected } from "#/components/auth/auth-states";
import { useSignIn } from "#/components/auth/use-sign-in";
import { NfcCardPrompt } from "#/components/nfc-card-prompt";
import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { Field } from "#/components/ui/field";
import { PasswordInput } from "#/components/ui/password-input";
import { Spinner } from "#/components/ui/spinner";
import { useEncryptedPaperWalletImport } from "#/components/use-encrypted-paper-wallet-import";
import { usePaperWalletScan } from "#/components/use-paper-wallet-scan";
import { BackChevron } from "#/components/wallet/wallet-layout";
import { DeskOnboardingHeader } from "#/desktop/auth/onboarding-header";
import { DeskTitle } from "#/desktop/ui/page";
import { onboardingSearch } from "#/lib/onboarding-search";
import { cn } from "#/lib/utils";

/** The column's Back: a text control flush with the column edge. */
const BACK_CLASS = "ms-0 h-9 self-start px-0 font-semibold text-foreground text-xs";

/** A ghost text action flush with the column's start edge. */
const FLUSH_GHOST = "-ms-3 self-start";

/**
 * Sign-in on desktop. The camera fills the large area while a paper wallet is
 * being scanned or a captured card is being opened; otherwise `context` stays
 * there. The 420px column keeps the methods within reach throughout.
 */
export function SignInDesk({ redirectTo, context }: { redirectTo?: string; context: ReactNode }) {
  const { t } = useLingui();
  const signIn = useSignIn({
    redirectTo,
    // Session already invalidated in the hook; the route's exit drains history.
    onAuthenticated: () => {},
    createAccountStep: "profile",
  });
  const scanning = signIn.showScanner;
  const captured = !scanning && !signIn.connecting && signIn.encryptedPaperWallet !== null;
  // The camera lets go after each read. It stays off while that read is being
  // signed in, and comes back if the payload was refused or the sign-in failed.
  const [holding, setHolding] = useState(false);
  const scan = usePaperWalletScan({
    cameraActive: scanning && !holding,
    onCameraDecoded: (text) => {
      setHolding(true);
      signIn.handleKeyScanned(text);
    },
    onImageDecoded: signIn.handleKeyScanned,
  });

  useEffect(() => {
    if (holding && !signIn.connecting) setHolding(false);
  }, [holding, signIn.connecting]);

  function closeScanner() {
    scan.cancel();
    signIn.closeScanner();
  }

  // Esc stops the camera, or drops a captured card and scans again.
  const onEscape = useEffectEvent(() => {
    if (scanning) closeScanner();
    else signIn.resumeScanner();
  });
  useEffect(() => {
    if (!scanning && !captured) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onEscape();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scanning, captured]);

  const scanError = scan.error?.message ?? (scanning ? signIn.error : null);

  return (
    <SignInSplit
      left={
        scanning || captured ? (
          <div className="relative grid min-h-0 place-items-center overflow-hidden bg-neutral-900">
            {scanning ? (
              <video
                ref={scan.videoRef}
                className="absolute inset-0 size-full object-cover"
                muted
                playsInline
                aria-hidden
              />
            ) : null}
            <div
              className={cn(
                "relative grid size-55 place-items-center shadow-[0_0_0_9999px_rgb(0_0_0/0.35)] outline-2",
                captured ? "outline-primary" : "outline-white",
              )}
            >
              {captured ? (
                <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground">
                  <RiCheckLine className="size-6" aria-hidden="true" />
                </span>
              ) : scan.cameraStarting ? (
                <Spinner className="size-6 text-white/80" />
              ) : null}
            </div>
            {scanning ? (
              <div className="absolute inset-x-6 bottom-6 grid justify-items-center gap-1 text-center">
                {scanError ? (
                  <p role="alert" className="bg-destructive px-2 py-1 text-white text-xs">
                    {scanError}
                  </p>
                ) : null}
                <p className="text-sm text-white">
                  <Trans>Hold your sign-in card's QR code up to the camera</Trans>
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          context
        )
      }
      right={
        <SignInColumn
          signIn={signIn}
          scanning={scanning}
          captured={captured}
          onCloseScanner={closeScanner}
          onUpload={() => scan.fileInputRef.current?.click()}
          upload={
            <input
              ref={scan.fileInputRef}
              type="file"
              accept="image/*"
              onChange={scan.handleFileUpload}
              className="hidden"
              aria-label={t`Upload card image`}
            />
          }
        />
      }
    />
  );
}

/** The welcome and sign-in split, under the onboarding header: the large area, and the 420px white column. */
export function SignInSplit({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <DeskOnboardingHeader />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px]">
        {left}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-border border-s bg-card px-10 py-12">
          {right}
        </div>
      </div>
    </div>
  );
}

type SignIn = ReturnType<typeof useSignIn>;

function SignInColumn({
  signIn,
  scanning,
  captured,
  onCloseScanner,
  onUpload,
  upload,
}: {
  signIn: SignIn;
  scanning: boolean;
  captured: boolean;
  onCloseScanner: () => void;
  onUpload: () => void;
  upload: ReactNode;
}) {
  const { t } = useLingui();
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
    showAdvanced,
    pkInput,
    setPkInput,
    createAccountSearch,
  } = signIn;
  const ProviderIcon = provider === "apple" ? FaApple : FaGoogle;

  // The state's own heading is a section heading, so the page keeps its h1.
  if (panelState === "approvalPending" || panelState === "approvalRejected") {
    return (
      <>
        <DeskTitle>
          <Trans>Welcome back</Trans>
        </DeskTitle>
        {panelState === "approvalPending" ? (
          <ApprovalPending onRetry={retryAction ?? undefined} busy={approvalBusy} />
        ) : (
          <ApprovalRejected />
        )}
      </>
    );
  }

  if (captured && signIn.encryptedPaperWallet) {
    return (
      <CardPassword
        encryptedKey={signIn.encryptedPaperWallet}
        onDecrypted={signIn.onEncryptedDecrypted}
        onBack={signIn.resumeScanner}
        onCancel={signIn.closeEncrypted}
        error={error}
      />
    );
  }

  const errorAlert = error ? (
    <p role="alert" className="text-destructive text-xs">
      {error}
    </p>
  ) : null;

  return (
    <>
      {scanning ? null : (
        <BackChevron
          label={t`Back`}
          to="/onboarding"
          search={onboardingSearch("welcome", signIn.currentRedirect)}
          className={BACK_CLASS}
        />
      )}
      <DeskTitle>
        <Trans>Welcome back</Trans>
      </DeskTitle>
      {scanning || showAdvanced ? null : errorAlert}
      {connecting ? (
        <div
          className="flex h-9 items-center gap-3 border border-border bg-card px-3"
          aria-live="polite"
        >
          <Spinner className="text-muted-foreground" />
          <span className="font-medium text-sm">
            {cardRead ? <Trans>Card read — signing in</Trans> : <Trans>Connecting…</Trans>}
          </span>
        </div>
      ) : (
        <>
          {available ? (
            <Button
              variant={scanning ? "outline" : "default"}
              className="w-full"
              onClick={() => {
                if (scanning) onCloseScanner();
                void signIn.signInWithPasskey();
              }}
            >
              <ProviderIcon aria-hidden="true" />
              {t`Continue with ${providerLabel}`}
            </Button>
          ) : null}
          <Button
            variant={scanning || !available ? "default" : "outline"}
            className="w-full"
            aria-pressed={scanning}
            onClick={signIn.openScanner}
          >
            <TbScan aria-hidden="true" />
            <Trans>Sign in with QR card</Trans>
          </Button>
          {scanning ? (
            <Button variant="outline" className="w-full" onClick={onUpload}>
              <RiUploadLine aria-hidden="true" />
              <Trans>Upload card image</Trans>
            </Button>
          ) : null}
          {upload}
          {nfcSupported ? (
            <Button variant="outline" className="w-full" onClick={signIn.startNfc}>
              <TbNfc aria-hidden="true" />
              <Trans>Tap NFC card</Trans>
            </Button>
          ) : null}
        </>
      )}
      {showNfc && !connecting ? (
        <NfcCardPrompt
          phase={nfcScan.phase}
          error={nfcScan.error}
          readFailed={nfcScan.readFailed}
          problem={nfcProblem}
          title={<Trans>Tap your NFC card</Trans>}
          onRetry={signIn.startNfc}
          onCancel={signIn.closeNfc}
        />
      ) : null}
      <div className={cn("mt-2 border-border border-t", scanning && "border-b")}>
        <button
          type="button"
          className="flex h-11 w-full items-center justify-between gap-3 text-start font-semibold text-sm outline-none focus-visible:outline-2 focus-visible:outline-ring"
          aria-expanded={showAdvanced}
          onClick={() => {
            signIn.toggleAdvanced();
            setPkInput("");
          }}
        >
          <Trans>Advanced options</Trans>
          <RiArrowDownSLine
            className={cn("size-4 shrink-0 transition-transform", showAdvanced && "rotate-180")}
            aria-hidden="true"
          />
        </button>
        {showAdvanced ? (
          <form onSubmit={signIn.handlePkSubmit} className="flex flex-col gap-3 pt-1 pb-4">
            <Field label={t`Private key`} htmlFor="desk-private-key">
              <PasswordInput
                id="desk-private-key"
                autoComplete="off"
                showLabel={t`Show private key`}
                hideLabel={t`Hide private key`}
                value={pkInput}
                onChange={(e) => setPkInput(e.target.value)}
                placeholder="0x..."
                className="font-mono"
                aria-invalid={!!error}
                disabled={connecting}
              />
            </Field>
            {errorAlert}
            <Button
              type="submit"
              variant="outline"
              disabled={!pkInput.trim() || connecting}
              className="w-full"
            >
              <Trans>Sign in with private key</Trans>
            </Button>
          </form>
        ) : null}
      </div>
      {scanning ? (
        <Button variant="ghost" className={FLUSH_GHOST} onClick={onCloseScanner}>
          <Trans>Cancel</Trans>
        </Button>
      ) : (
        <p className="mt-2 border-border border-t pt-4 text-muted-foreground text-xs">
          <Trans>New to CLC?</Trans>{" "}
          <Link
            to="/onboarding"
            search={createAccountSearch}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            <Trans>Create an account</Trans>
          </Link>
        </p>
      )}
      {signIn.accountNotFoundOpen ? (
        <AccountNotFoundDialog
          onCancel={signIn.closeAccountNotFound}
          onCreate={signIn.routeToSignup}
        />
      ) : null}
    </>
  );
}

/** A captured protected card: the password for it, beside the frozen viewfinder. */
function CardPassword({
  encryptedKey,
  onDecrypted,
  onBack,
  onCancel,
  error: signInError,
}: {
  encryptedKey: string;
  onDecrypted: (key: `0x${string}`) => Promise<void>;
  onBack: () => void;
  onCancel: () => void;
  error: string | null;
}) {
  const { t } = useLingui();
  const { passphrase, setPassphrase, error, decrypting, handleSubmit } =
    useEncryptedPaperWalletImport({ encryptedKey, onDecrypted });
  const shown = error ?? signInError;

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <BackChevron label={t`Back`} onClick={onBack} className={BACK_CLASS} />
      <DeskTitle>
        <Trans>Enter card password</Trans>
      </DeskTitle>
      <Field label={t`Password`} htmlFor="desk-card-password">
        <PasswordInput
          id="desk-card-password"
          autoComplete="current-password"
          className="font-mono"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          aria-invalid={!!shown}
          disabled={decrypting}
        />
      </Field>
      {shown ? (
        <p role="alert" className="text-destructive text-xs">
          {shown}
        </p>
      ) : null}
      <Button type="submit" className="w-full" pending={decrypting}>
        {decrypting ? t`Opening sign-in card…` : t`Continue`}
      </Button>
      <Button variant="ghost" className={FLUSH_GHOST} onClick={onCancel} disabled={decrypting}>
        <Trans>Cancel</Trans>
      </Button>
    </form>
  );
}

function AccountNotFoundDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: () => void;
}) {
  return (
    <DialogRoot
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent className="grid w-110 max-w-[calc(100vw-3rem)] gap-3 rounded-none bg-card p-5 shadow-none">
          <DialogTitle>
            <Trans>Account not found</Trans>
          </DialogTitle>
          <p className="text-muted-foreground text-sm">
            <Trans>No CLC account was found for this sign-in.</Trans>
          </p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onCancel}>
              <Trans>Cancel</Trans>
            </Button>
            <Button onClick={onCreate}>
              <Trans>Create an account</Trans>
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
