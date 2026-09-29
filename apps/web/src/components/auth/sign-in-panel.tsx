import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { lazy, Suspense, useState } from "react";
import { FaApple, FaGoogle } from "react-icons/fa";
import { FiKey, FiLoader, FiX } from "react-icons/fi";
import { TbScan } from "react-icons/tb";
import { useConnection, useDisconnect } from "wagmi";
import { connect as connectAction } from "wagmi/actions";

import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { Button } from "#/components/ui/button";
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
import { CALIBUR_WEBAUTHN_CONNECTOR_ID } from "#/connectors/calibur-webauthn";
import { clearPrivateKey, storePrivateKey } from "#/connectors/privateKey";
import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import { clearIdentitySecrets } from "#/features/auth/api/identity-reset";
import { useBackendPrivateKeySignin } from "#/features/auth/hooks/use-backend-auth";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { onboardingSearch } from "#/lib/onboarding-search";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { useCaliburSignin } from "#/features/webauthn/hooks/use-calibur-signin";
import { usePlatformPasskeyLabel } from "#/features/webauthn/hooks/use-platform-passkey-label";
import { RELAYER_URL } from "#/lib/relayer-config";
import { parsePaperWalletImportPayload } from "@clc/core/features/wallet/paper-wallet";
import { caliburConnector, pkConnector, wagmiConfig } from "#/providers/web3-config";
import { ApprovalPending, ApprovalRejected } from "./auth-states";
import { sanitizeInternalRedirect } from "./redirect";

const relayerClient = createRelayerClient(RELAYER_URL);

const EncryptedPaperWalletImportForm = lazy(() =>
  import("#/components/encrypted-paper-wallet-import-form").then((module) => ({
    default: module.EncryptedPaperWalletImportForm,
  })),
);

type AuthPanelState = "form" | "approvalPending" | "approvalRejected";

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
};

export function SignInPanel({
  onAuthenticated,
  onCancel,
  redirectTo,
  createAccountStep = "profile",
  createAccountReplace = false,
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

  return (
    <div className="space-y-3">
      {connecting ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <FiLoader className="size-6 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">
            <Trans>Connecting...</Trans>
          </p>
        </div>
      ) : null}

      {showScanner && !connecting ? (
        <PaperWalletScanner
          onKeyDecoded={handleKeyScanned}
          onCancel={() => {
            setShowScanner(false);
            setError(null);
          }}
        />
      ) : null}

      {encryptedPaperWallet && !connecting ? (
        <div className="space-y-3">
          <Suspense fallback={null}>
            <EncryptedPaperWalletImportForm
              encryptedKey={encryptedPaperWallet}
              onDecrypted={async (key) => {
                const connected = await connectWithKey(key);
                if (connected) setEncryptedPaperWallet(null);
              }}
              onCancel={() => {
                setEncryptedPaperWallet(null);
                setError(null);
              }}
            />
          </Suspense>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      {!showScanner && !showPkInput && !encryptedPaperWallet && !connecting ? (
        <>
          {available ? (
            <Button
              className="h-11 w-full"
              onClick={() => void signInWithPasskey()}
              disabled={isSigningIn}
            >
              {isSigningIn ? null : <ProviderIcon className="mr-2 size-4" />}
              {isSigningIn ? t`Connecting...` : t`Continue with ${providerLabel}`}
            </Button>
          ) : null}

          <Button
            className="h-11 w-full"
            onClick={() => {
              setShowScanner(true);
              setError(null);
            }}
          >
            <TbScan className="mr-2 size-4" />
            <Trans>Continue with Paper Wallet</Trans>
          </Button>

          <button
            type="button"
            className="w-full pt-1 text-center text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => {
              setShowAdvanced((current) => !current);
              setShowPkInput(false);
              setError(null);
            }}
          >
            <Trans>Advanced options</Trans>
          </button>

          {showAdvanced ? (
            <Button
              variant="outline"
              className="h-11 w-full"
              onClick={() => {
                setShowPkInput(true);
                setError(null);
              }}
            >
              <FiKey className="mr-2 size-4" />
              <Trans>Private key</Trans>
            </Button>
          ) : null}
        </>
      ) : null}

      {showPkInput && !connecting ? (
        <form onSubmit={handlePkSubmit} className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              <Trans>Private key</Trans>
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t`Close private key form`}
              onClick={() => {
                setShowPkInput(false);
                setPkInput("");
                setError(null);
              }}
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
          <Button type="submit" disabled={!pkInput.trim()} className="h-11 w-full">
            <FiKey className="mr-2 size-4" />
            <Trans>Sign in with private key</Trans>
          </Button>
        </form>
      ) : null}

      {onCancel ? (
        <Button variant="ghost" className="h-11 w-full" onClick={onCancel}>
          <Trans>Cancel</Trans>
        </Button>
      ) : null}

      <p className="text-center text-muted-foreground text-xs">
        <Trans>New to CLC?</Trans>{" "}
        <Link
          to="/onboarding"
          search={createAccountSearch}
          replace={createAccountReplace}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          <Trans>Create an account</Trans>
        </Link>
      </p>

      <SheetRoot open={accountNotFoundOpen} onOpenChange={setAccountNotFoundOpen}>
        <SheetPortal>
          <SheetBackdrop />
          <SheetContent className="rounded-none border-t border-border bg-background shadow-none [&>div:first-child]:hidden">
            <SheetHeader className="px-6 pt-6">
              <SheetTitle className="font-heading text-[1.375rem] font-semibold leading-tight">
                <Trans>Account not found</Trans>
              </SheetTitle>
              <p className="text-muted-foreground text-sm">
                <Trans>No CLC account was found for this sign-in.</Trans>
              </p>
            </SheetHeader>
            <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <Button className="h-11 w-full" onClick={routeToSignup}>
                <Trans>Create an account</Trans>
              </Button>
            </SheetFooter>
          </SheetContent>
        </SheetPortal>
      </SheetRoot>
    </div>
  );
}
