import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { lazy, Suspense, useEffect, useState } from "react";
import { FaApple, FaGoogle } from "react-icons/fa";
import { FiKey, FiLoader, FiX } from "react-icons/fi";
import { TbScan } from "react-icons/tb";
import { useConnect } from "wagmi";
import { connect as connectAction } from "wagmi/actions";

import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { clearPrivateKey, storePrivateKey } from "#/connectors/privateKey";
import { BackendApiError, formatBackendApiError } from "#/features/auth/api/client";
import {
  useBackendPrivateKeySignin,
  useBackendWalletSignin,
} from "#/features/auth/hooks/use-backend-auth";
import {
  authSessionQueryKey,
  canSignSiwe,
  useAuthStatus,
} from "#/features/auth/hooks/use-auth-status";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
import { useCaliburRecovery } from "#/features/webauthn/hooks/use-calibur-recovery";
import { usePlatformPasskeyLabel } from "#/features/webauthn/hooks/use-platform-passkey-label";
import { RELAYER_URL } from "#/lib/backend-config";
import { parsePaperWalletImportPayload } from "#/lib/paper-wallet-import";
import { caliburConnector, pkConnector, wagmiConfig } from "#/providers/web3-config";
import { ApprovalPending, ApprovalRejected, SessionUnavailable } from "./auth-states";
import { sanitizeInternalRedirect } from "./redirect";

const relayerClient = createRelayerClient(RELAYER_URL);

const EncryptedPaperWalletImportForm = lazy(() =>
  import("#/components/encrypted-paper-wallet-import-form").then((module) => ({
    default: module.EncryptedPaperWalletImportForm,
  })),
);

type AuthPanelState = "form" | "approvalPending" | "approvalRejected" | "sessionUnavailable";

export type SignInPanelProps = {
  onAuthenticated: () => void;
  onCancel?: () => void;
  redirectTo?: string;
};

export function SignInPanel({ onAuthenticated, onCancel, redirectTo }: SignInPanelProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { connect: wagmiConnect } = useConnect();
  const auth = useAuthStatus();
  const backendSignin = useBackendPrivateKeySignin();
  const backendWalletSignin = useBackendWalletSignin(auth.address, auth.chainId);
  const [panelState, setPanelState] = useState<AuthPanelState>("form");
  const [showScanner, setShowScanner] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPkInput, setShowPkInput] = useState(false);
  const [pkInput, setPkInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pkConnecting, setPkConnecting] = useState(false);
  const [encryptedPaperWallet, setEncryptedPaperWallet] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const { available, provider, label: providerLabel } = usePlatformPasskeyLabel();
  const ProviderIcon = provider === "apple" ? FaApple : FaGoogle;
  const {
    step: recoveryStep,
    outcome,
    error: recoveryError,
    recover,
  } = useCaliburRecovery(relayerClient);

  const isRecovering = ["challenging", "asserting", "verifying"].includes(recoveryStep);
  const connecting = isRecovering || pkConnecting || backendSignin.isPending;
  const currentRedirect =
    sanitizeInternalRedirect(redirectTo) ??
    sanitizeInternalRedirect(`${location.pathname}${location.searchStr}${location.hash}`);

  useEffect(() => {
    if (recoveryStep === "done") {
      wagmiConnect({ connector: caliburConnector });
      setPanelState("sessionUnavailable");
    }
  }, [recoveryStep, wagmiConnect]);

  function routeToSignup() {
    void navigate({
      to: "/onboarding",
      search: currentRedirect ? { redirect: currentRedirect } : {},
    });
  }

  function handleBackendError(err: unknown, retry?: () => void) {
    if (err instanceof BackendApiError) {
      if (err.status === 404) {
        routeToSignup();
        return;
      }
      if (err.status === 403) {
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
    await queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
    onAuthenticated();
  }

  async function connectWithKey(key: `0x${string}`): Promise<boolean> {
    setPkConnecting(true);
    setError(null);
    const retry = () => {
      void connectWithKey(key);
    };
    try {
      await backendSignin.mutateAsync({ privateKey: key });
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

  async function reauthenticateConnectedWallet() {
    if (!auth.address) return;
    setError(null);
    const retry = () => {
      void reauthenticateConnectedWallet();
    };
    try {
      await backendWalletSignin.mutateAsync();
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
    return <ApprovalPending onRetry={retryAction ?? undefined} busy={backendSignin.isPending} />;
  }

  if (panelState === "approvalRejected") {
    return <ApprovalRejected />;
  }

  if (panelState === "sessionUnavailable") {
    return (
      <div className="space-y-3">
        <SessionUnavailable />
        <Button className="h-11 w-full" onClick={() => setPanelState("form")}>
          <Trans>Use another sign-in method</Trans>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {auth.needsBackendSignin && auth.address && canSignSiwe(auth.connectorId) ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="font-medium text-sm">
            <Trans>Wallet connected</Trans>
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            <Trans>Sign once to refresh your app session.</Trans>
          </p>
          <Button
            className="mt-3 h-11 w-full"
            onClick={() => void reauthenticateConnectedWallet()}
            disabled={backendWalletSignin.isPending}
          >
            {backendWalletSignin.isPending ? t`Re-authenticating...` : t`Re-authenticate`}
          </Button>
        </div>
      ) : null}

      {auth.needsBackendSignin && auth.connectorId === "calibur-webauthn" ? (
        <SessionUnavailable />
      ) : null}

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

      {outcome === "not_found" ? (
        <div className="space-y-1 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">
            <Trans>No passkey found</Trans>
          </p>
          <p className="text-muted-foreground text-xs">
            <Trans>No passkey is registered on this device.</Trans>{" "}
            <button
              type="button"
              className="font-medium text-foreground underline-offset-4 hover:underline"
              onClick={routeToSignup}
            >
              <Trans>Create an account</Trans>
            </button>
          </p>
        </div>
      ) : recoveryError ? (
        <p className="text-destructive text-xs">{recoveryError}</p>
      ) : null}

      {!showScanner && !showPkInput && !encryptedPaperWallet && !connecting ? (
        <>
          {available ? (
            <Button
              className="h-11 w-full"
              onClick={() => recover.mutate()}
              disabled={isRecovering}
            >
              {isRecovering ? null : <ProviderIcon className="mr-2 size-4" />}
              {isRecovering ? t`Connecting...` : t`Continue with ${providerLabel}`}
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
          search={currentRedirect ? { redirect: currentRedirect } : {}}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          <Trans>Create an account</Trans>
        </Link>
      </p>
    </div>
  );
}
