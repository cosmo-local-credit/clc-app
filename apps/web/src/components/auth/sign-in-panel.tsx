import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { FormEvent, ReactNode } from "react";
import { createContext, lazy, Suspense, useContext, useEffect, useState } from "react";
import { FaApple, FaGoogle } from "react-icons/fa";
import { FiKey, FiX } from "react-icons/fi";
import { RiArrowDownSLine } from "react-icons/ri";
import { TbNfc, TbScan } from "react-icons/tb";
import { useConnection, useDisconnect } from "wagmi";
import { connect as connectAction } from "wagmi/actions";

import { NfcCardPrompt, type NfcCardProblem } from "#/components/nfc-card-prompt";
import { OnboardingTitle } from "#/components/onboarding-screen";
import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { Field } from "#/components/ui/field";
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
import { BackChevron } from "#/components/wallet/wallet-layout";
import { CALIBUR_WEBAUTHN_CONNECTOR_ID } from "#/connectors/calibur-webauthn";
import { clearPrivateKey, storePrivateKey } from "#/connectors/privateKey";
import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import { clearIdentitySecrets } from "#/features/auth/api/identity-reset";
import { useBackendPrivateKeySignin } from "#/features/auth/hooks/use-backend-auth";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { onboardingSearch } from "#/lib/onboarding-search";
import { cn } from "#/lib/utils";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { useCaliburSignin } from "#/features/webauthn/hooks/use-calibur-signin";
import { usePlatformPasskeyLabel } from "#/features/webauthn/hooks/use-platform-passkey-label";
import { markNfc } from "#/lib/nfc/metrics";
import { useWebNfcSupported } from "#/lib/nfc/ndef-adapter";
import { useNfcScan } from "#/lib/nfc/use-nfc-scan";
import { RELAYER_URL } from "#/lib/relayer-config";
import { readNfcCardContent } from "@clc/core/features/nfc/logic";
import { parsePaperWalletImportPayload } from "@clc/core/features/wallet/paper-wallet";
import { caliburConnector, pkConnector, wagmiConfig } from "#/providers/web3-config";
import { ApprovalPending, ApprovalRejected } from "./auth-states";
import { sanitizeInternalRedirect } from "./redirect";

const relayerClient = createRelayerClient(RELAYER_URL);

/** The desktop column's Back: a ghost text control flush with the column edge. */
const DESK_BACK_CLASS = "ms-0 h-9 self-start px-0 font-semibold text-foreground text-xs";

const EncryptedPaperWalletImportForm = lazy(() =>
  import("#/components/encrypted-paper-wallet-import-form").then((module) => ({
    default: module.EncryptedPaperWalletImportForm,
  })),
);

type AuthPanelState = "form" | "approvalPending" | "approvalRejected";

type SignInCanvasMode = "concept" | "scanner" | "captured";

export type SignInCanvasStage = {
  mode: SignInCanvasMode;
  error: string | null;
};

/** Latest scan handlers. The desktop split reads this while it paints the left column. */
export type SignInCanvasApi = {
  onKeyDecoded: (raw: string) => void;
  closeScanner: () => void;
  closeEncrypted: () => void;
  /** Drops a captured card and opens the camera again. */
  resumeScanner: () => void;
};

type SignInCanvasHost = {
  setStage: (stage: SignInCanvasStage) => void;
  api: { current: SignInCanvasApi | null };
};

const SignInCanvasContext = createContext<SignInCanvasHost | null>(null);

export function SignInCanvasProvider({
  children,
  host,
}: {
  children: ReactNode;
  host: SignInCanvasHost;
}) {
  return <SignInCanvasContext.Provider value={host}>{children}</SignInCanvasContext.Provider>;
}

export type SignInPanelProps = {
  onAuthenticated: () => void;
  onCancel?: () => void;
  redirectTo?: string;
  /**
   * Onboarding step used by the "Create an account" affordances (footer link
   * and account-not-found sheet). Defaults to `profile` so the user lands on
   * the form rather than the welcome fork.
   */
  createAccountStep?: "welcome" | "profile";
  /** When true, create-account navigation replaces the current history entry. */
  createAccountReplace?: boolean;
  /**
   * Keep sign-in inside the page instead of a sheet. Off by default, so the
   * phone sheets stay as they are. With a canvas host, the scanner and the
   * captured card go to that host and this column keeps the methods.
   */
  embedded?: boolean;
};

export function SignInPanel({
  onAuthenticated,
  onCancel,
  redirectTo,
  createAccountStep = "profile",
  createAccountReplace = false,
  embedded = false,
}: SignInPanelProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { isConnected, connector } = useConnection();
  const { mutateAsync: disconnect } = useDisconnect();
  const backendSignin = useBackendPrivateKeySignin();
  const [panelState, setPanelState] = useState<AuthPanelState>("form");
  const [showScanner, setShowScanner] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPkInput, setShowPkInput] = useState(false);
  const [pkInput, setPkInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pkConnecting, setPkConnecting] = useState(false);
  const [encryptedPaperWallet, setEncryptedPaperWallet] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [accountNotFoundOpen, setAccountNotFoundOpen] = useState(false);
  const [showNfc, setShowNfc] = useState(false);
  const [nfcProblem, setNfcProblem] = useState<NfcCardProblem | null>(null);
  const [cardRead, setCardRead] = useState(false);
  const nfcSupported = useWebNfcSupported();
  const { available, provider, label: providerLabel } = usePlatformPasskeyLabel();
  const ProviderIcon = provider === "apple" ? FaApple : FaGoogle;
  const { step: signinStep, signin } = useCaliburSignin(relayerClient);

  const isSigningIn = signinStep === "asserting" || signinStep === "verifying";
  const connecting = isSigningIn || pkConnecting || backendSignin.isPending;
  const currentRedirect =
    sanitizeInternalRedirect(redirectTo) ??
    sanitizeInternalRedirect(`${location.pathname}${location.searchStr}${location.hash}`);
  const createAccountSearch = onboardingSearch(createAccountStep, currentRedirect);

  function routeToSignup() {
    setAccountNotFoundOpen(false);
    void navigate({
      to: "/onboarding",
      search: createAccountSearch,
      replace: createAccountReplace,
    });
  }

  function handleBackendError(err: unknown, retry?: () => void) {
    if (err instanceof BackendApiError) {
      if (err.kind === "not-found") {
        setAccountNotFoundOpen(true);
        return;
      }
      if (err.kind === "forbidden") {
        setRetryAction(() => retry ?? null);
        if (/reject/i.test(err.description) || err.code === "REJECTED") {
          setPanelState("approvalRejected");
        } else {
          setPanelState("approvalPending");
        }
        return;
      }
      setError(formatBackendApiError(err));
      return;
    }
    setError(err instanceof Error ? err.message : t`Connection failed.`);
  }

  async function finishAuthenticated() {
    // refetchType "all" also refetches an inactive session query that was
    // cached as null before the cookie existed (returning auto-reconnected
    // user), so the destination renders authenticated without a guest flash.
    await queryClient.invalidateQueries({ queryKey: authSessionQueryKey, refetchType: "all" });
    onAuthenticated();
  }

  // Drop any wallet that is already connected before connecting a new one.
  // A returning user is often auto-reconnected into connectedNoSession, and
  // wagmi throws ConnectorAlreadyConnectedError if you connect over an active
  // connector. Disconnecting also clears that connector's stored secret, so
  // private-key storage must be (re)written after this runs.
  async function dropActiveConnection() {
    if (isConnected) await disconnect();
  }

  async function connectWithKey(key: `0x${string}`): Promise<boolean> {
    setPkConnecting(true);
    setError(null);
    const retry = () => {
      void connectWithKey(key);
    };
    try {
      await backendSignin.mutateAsync({ privateKey: key });
      // Before the disconnect, matching the passkey branch below and sign-out.
      // `dropActiveConnection` clears only the outgoing connector's own slot, so
      // this is what removes the other kind — a passkey the previous user
      // registered during a paper-wallet session, which would otherwise let the
      // next person sign in as them. Sequenced after the await, a rejecting
      // connector skipped it entirely and the catch below clears only the
      // private key, so the leak survived exactly when teardown mattered most.
      clearIdentitySecrets("none");
      try {
        await dropActiveConnection();
      } catch {
        // Swallowed so it cannot skip the clear above. wagmi may still hold the
        // old connector, in which case `connectAction` rejects with
        // ConnectorAlreadyConnected and the catch surfaces that to the user —
        // a visible failed sign-in, not a silently inherited credential.
      }
      // After the clear, which would otherwise wipe the slot being written.
      storePrivateKey(key);
      await connectAction(wagmiConfig, { connector: pkConnector });
      setPkInput("");
      setShowPkInput(false);
      setShowScanner(false);
      await finishAuthenticated();
      return true;
    } catch (err) {
      clearPrivateKey();
      handleBackendError(err, retry);
      return false;
    } finally {
      setPkConnecting(false);
    }
  }

  // Passkey sign-in: the assertion authenticates the user and the backend
  // issues the session cookie, so there is no SIWE step. Connect the Calibur
  // connector afterwards so chain interactions use the recovered wallet.
  async function signInWithPasskey() {
    setError(null);
    const retry = () => {
      void signInWithPasskey();
    };
    try {
      await signin.mutateAsync();
      // After the mutation, not before: `useCaliburSignin` writes the credential
      // inside it, so clearing earlier would delete the one just minted. Outside
      // the branch below, because the already-on-Calibur path never disconnects
      // and would otherwise leave a previous user's `clc_pk_raw` untouched. Only
      // on success, so a failed assertion never destroys the incumbent's key.
      clearIdentitySecrets("webauthn");
      // Already on the passkey connector (e.g. expired-cookie re-auth): the
      // fresh assertion refreshed the session, no reconnect needed. Otherwise
      // drop any other active connector and connect Calibur.
      if (connector?.id !== CALIBUR_WEBAUTHN_CONNECTOR_ID) {
        await dropActiveConnection();
        await connectAction(wagmiConfig, { connector: caliburConnector });
      }
      await finishAuthenticated();
    } catch (err) {
      handleBackendError(err, retry);
    }
  }

  const canvas = useContext(SignInCanvasContext);
  const hosted = embedded && canvas !== null;
  useEffect(() => {
    if (!canvas || !embedded) return;
    canvas.setStage({
      mode: showScanner ? "scanner" : encryptedPaperWallet ? "captured" : "concept",
      error: showScanner ? error : null,
    });
  }, [canvas, embedded, showScanner, encryptedPaperWallet, error]);
  useEffect(() => {
    if (!canvas || !embedded) return;
    return () => canvas.setStage({ mode: "concept", error: null });
  }, [canvas, embedded]);

  // A login scan ends after one valid card. Like the QR scanner, tapping the
  // card is already the choice to import it, so a raw card signs in without a
  // further confirmation and an encrypted one goes to the password step.
  const nfcScan = useNfcScan({
    onTag: (reading) => {
      const operationId = crypto.randomUUID();
      markNfc(operationId, "event");
      const content = readNfcCardContent(reading);
      if (content.kind !== "credential") {
        setNfcProblem(content.kind);
        return "continue";
      }
      markNfc(operationId, "decoded");
      setNfcProblem(null);
      setShowNfc(false);
      if (content.credential.type === "encrypted") {
        setEncryptedPaperWallet(content.credential.encryptedKey);
        return "done";
      }
      setCardRead(true);
      markNfc(operationId, "login-started");
      void connectWithKey(content.credential.key).then((connected) => {
        setCardRead(false);
        if (connected) markNfc(operationId, "login-completed");
      });
      return "done";
    },
  });

  function startNfc() {
    setError(null);
    setNfcProblem(null);
    setShowNfc(true);
    nfcScan.start();
  }

  function closeNfc() {
    nfcScan.stop();
    setShowNfc(false);
    setNfcProblem(null);
  }

  function handlePkSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const result = parsePaperWalletImportPayload(pkInput);
    if (result.type === "raw") {
      void connectWithKey(result.key);
      return;
    }
    if (result.type === "encrypted") {
      setShowPkInput(false);
      setPkInput("");
      setEncryptedPaperWallet(result.encryptedKey);
      return;
    }
    setError(t`Enter a valid private key or paper wallet.`);
  }

  function handleKeyScanned(raw: string) {
    setError(null);
    const result = parsePaperWalletImportPayload(raw);
    if (result.type === "raw") {
      void connectWithKey(result.key);
      return;
    }
    if (result.type === "encrypted") {
      setEncryptedPaperWallet(result.encryptedKey);
      setShowScanner(false);
      return;
    }
    setError(t`This QR code does not contain a valid private key.`);
  }

  if (panelState === "approvalPending") {
    return (
      <ApprovalPending
        onRetry={retryAction ?? undefined}
        busy={backendSignin.isPending || signin.isPending}
      />
    );
  }

  if (panelState === "approvalRejected") {
    return <ApprovalRejected />;
  }

  function closeScanner() {
    setShowScanner(false);
    setError(null);
  }

  function closePrivateKey() {
    setShowPkInput(false);
    setPkInput("");
    setError(null);
  }

  function closeEncrypted() {
    setEncryptedPaperWallet(null);
    setError(null);
  }

  function resumeScanner() {
    setEncryptedPaperWallet(null);
    setShowScanner(true);
    setError(null);
  }

  function openScanner() {
    setShowScanner(true);
    setError(null);
  }

  if (canvas) {
    canvas.api.current = {
      onKeyDecoded: handleKeyScanned,
      closeScanner,
      closeEncrypted,
      resumeScanner,
    };
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
  if (hosted) {
    const passwordStep = !connecting && encryptedPaperWallet !== null;
    if (passwordStep) {
      return (
        <div className="flex flex-col gap-3">
          <BackChevron label={t`Back`} onClick={resumeScanner} className={DESK_BACK_CLASS} />
          <OnboardingTitle>
            <Trans>Password-protected paper wallet</Trans>
          </OnboardingTitle>
          <Suspense fallback={null}>
            <EncryptedPaperWalletImportForm
              encryptedKey={encryptedPaperWallet}
              onDecrypted={async (key) => {
                const connected = await connectWithKey(key);
                if (connected) setEncryptedPaperWallet(null);
              }}
              onCancel={resumeScanner}
              className="border-0 p-0 [&>div:first-child]:hidden"
            />
          </Suspense>
          {errorAlert}
          <Button variant="ghost" tap className="-ms-3.5 self-start" onClick={closeEncrypted}>
            <Trans>Cancel</Trans>
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        {showScanner ? null : (
          <BackChevron
            label={t`Back`}
            to="/onboarding"
            search={onboardingSearch("welcome", currentRedirect)}
            className={DESK_BACK_CLASS}
          />
        )}
        <OnboardingTitle>
          <Trans>Welcome back</Trans>
        </OnboardingTitle>
        {showScanner || showAdvanced ? null : errorAlert}
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
                variant={showScanner ? "outline" : "default"}
                tap
                className="w-full"
                onClick={() => {
                  setShowScanner(false);
                  void signInWithPasskey();
                }}
              >
                <ProviderIcon className="size-4" aria-hidden="true" />
                {t`Continue with ${providerLabel}`}
              </Button>
            ) : null}
            <Button
              variant={showScanner || !available ? "default" : "outline"}
              tap
              className="w-full"
              aria-pressed={showScanner}
              onClick={openScanner}
            >
              <TbScan className="size-4" aria-hidden="true" />
              <Trans>Continue with Paper Wallet</Trans>
            </Button>
            {nfcSupported ? (
              <Button variant="outline" tap className="w-full" onClick={startNfc}>
                <TbNfc className="size-4" aria-hidden="true" />
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
            onRetry={startNfc}
            onCancel={closeNfc}
          />
        ) : null}
        <div className={cn("mt-2 border-border border-t", showScanner && "border-b")}>
          <button
            type="button"
            className="flex h-11 w-full items-center justify-between gap-3 text-start font-semibold text-sm outline-none focus-visible:outline-2 focus-visible:outline-ring"
            aria-expanded={showAdvanced}
            onClick={() => {
              setShowAdvanced((current) => !current);
              setShowPkInput(false);
              setPkInput("");
              setError(null);
            }}
          >
            <Trans>Advanced options</Trans>
            <RiArrowDownSLine
              className={cn("size-4 shrink-0 transition-transform", showAdvanced && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          {showAdvanced ? (
            <form onSubmit={handlePkSubmit} className="flex flex-col gap-3 pt-1">
              <Field label={t`Private key`} htmlFor="desk-private-key">
                <Input
                  id="desk-private-key"
                  type="password"
                  autoComplete="off"
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
                tap
                disabled={!pkInput.trim() || connecting}
                className="w-full"
              >
                <Trans>Sign in with private key</Trans>
              </Button>
            </form>
          ) : null}
        </div>
        {showScanner ? (
          <Button variant="ghost" tap className="-ms-3.5 self-start" onClick={closeScanner}>
            <Trans>Cancel</Trans>
          </Button>
        ) : null}
        {onCancel ? (
          <Button variant="ghost" tap className="-ms-3.5 self-start" onClick={onCancel}>
            <Trans>Cancel</Trans>
          </Button>
        ) : null}
        <p className="mt-2 border-border border-t pt-4 text-muted-foreground text-xs">
          <Trans>New to CLC?</Trans>{" "}
          <Link
            to="/onboarding"
            search={createAccountSearch}
            replace={createAccountReplace}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            <Trans>Create an account</Trans>
          </Link>
        </p>
        {accountNotFoundOpen ? (
          <AccountNotFoundDialog
            onCancel={() => setAccountNotFoundOpen(false)}
            onCreate={routeToSignup}
          />
        ) : null}
      </div>
    );
  }

  if (embedded && !hosted && (accountNotFoundOpen || sheetOpen)) {
    return (
      <div className="flex flex-1 flex-col gap-3">
        {accountNotFoundOpen ? (
          <>
            <h2 className="font-heading text-base font-semibold">
              <Trans>Account not found</Trans>
            </h2>
            <p className="text-muted-foreground text-sm">
              <Trans>No CLC account was found for this sign-in.</Trans>
            </p>
            <Button tap className="w-full" onClick={routeToSignup}>
              <Trans>Create an account</Trans>
            </Button>
            <Button
              variant="ghost"
              tap
              className="w-full"
              onClick={() => setAccountNotFoundOpen(false)}
            >
              <Trans>Cancel</Trans>
            </Button>
          </>
        ) : showScanner ? (
          <div className="space-y-3">
            <PaperWalletScanner onKeyDecoded={handleKeyScanned} onCancel={closeScanner} />
            {errorAlert}
          </div>
        ) : showNfc ? (
          <NfcCardPrompt
            phase={nfcScan.phase}
            error={nfcScan.error}
            readFailed={nfcScan.readFailed}
            problem={nfcProblem}
            title={<Trans>Tap your NFC card</Trans>}
            onRetry={startNfc}
            onCancel={closeNfc}
          />
        ) : encryptedPaperWallet ? (
          <>
            <Suspense fallback={null}>
              <EncryptedPaperWalletImportForm
                encryptedKey={encryptedPaperWallet}
                onDecrypted={async (key) => {
                  const connected = await connectWithKey(key);
                  if (connected) setEncryptedPaperWallet(null);
                }}
                onCancel={closeEncrypted}
              />
            </Suspense>
            {errorAlert}
          </>
        ) : (
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
        )}
      </div>
    );
  }

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
            onClick={() => {
              setShowAdvanced((current) => !current);
              setShowPkInput(false);
              setError(null);
            }}
          >
            <Trans>Advanced options</Trans>
          </Button>

          {showAdvanced ? (
            <div className="border border-border bg-card">
              <ActionRow
                icon={<FiKey className="size-4" aria-hidden="true" />}
                label={t`Private key`}
                onClick={() => {
                  setShowPkInput(true);
                  setError(null);
                }}
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

      {embedded ? null : (
        <>
          <MethodSheet
            open={showScanner && !connecting}
            onClose={closeScanner}
            title={t`Paper Wallet`}
          >
            <div className="space-y-3">
              <PaperWalletScanner onKeyDecoded={handleKeyScanned} onCancel={closeScanner} />
              {errorAlert}
            </div>
          </MethodSheet>

          <MethodSheet
            open={showNfc && !connecting}
            onClose={closeNfc}
            title={t`Tap your NFC card`}
          >
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
                  onDecrypted={async (key) => {
                    const connected = await connectWithKey(key);
                    if (connected) setEncryptedPaperWallet(null);
                  }}
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

          <SheetRoot open={accountNotFoundOpen} onOpenChange={setAccountNotFoundOpen}>
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
                  <Button
                    variant="ghost"
                    tap
                    className="w-full"
                    onClick={() => setAccountNotFoundOpen(false)}
                  >
                    <Trans>Cancel</Trans>
                  </Button>
                </SheetFooter>
              </SheetContent>
            </SheetPortal>
          </SheetRoot>
        </>
      )}
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
            <Button variant="outline" tap onClick={onCancel}>
              <Trans>Cancel</Trans>
            </Button>
            <Button tap onClick={onCreate}>
              <Trans>Create an account</Trans>
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
