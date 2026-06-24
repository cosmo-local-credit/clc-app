import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { FiKey, FiLoader, FiUserPlus, FiX } from "react-icons/fi";
import { TbScan } from "react-icons/tb";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { FaApple, FaGoogle } from "react-icons/fa";
import { useConnect } from "wagmi";
import { connect as connectAction } from "wagmi/actions";

import { EncryptedPaperWalletImportForm } from "#/components/encrypted-paper-wallet-import-form";
import { OnboardingMenu } from "#/components/language-selector";
import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { Input } from "#/components/ui/input";
import { normalizePrivateKey } from "#/connectors/normalize-private-key";
import { clearPrivateKey, storePrivateKey } from "#/connectors/privateKey";
import { useBackendPrivateKeySignin } from "#/features/auth/hooks/use-backend-auth";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
import { useCaliburRecovery } from "#/features/webauthn/hooks/use-calibur-recovery";
import { usePlatformPasskeyLabel } from "#/features/webauthn/hooks/use-platform-passkey-label";
import { RELAYER_URL } from "#/lib/backend-config";
import { parsePaperWalletImportPayload } from "#/lib/paper-wallet-import";
import { caliburConnector, pkConnector, wagmiConfig } from "#/providers/web3-config";

const relayerClient = createRelayerClient(RELAYER_URL);

export function LandingPage() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { connect: wagmiConnect } = useConnect();
  const backendSignin = useBackendPrivateKeySignin();
  const [showScanner, setShowScanner] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPkInput, setShowPkInput] = useState(false);
  const [pkInput, setPkInput] = useState("");
  const [pkError, setPkError] = useState<string | null>(null);
  const [pkConnecting, setPkConnecting] = useState(false);
  const [encryptedPaperWallet, setEncryptedPaperWallet] = useState<string | null>(null);

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

  useEffect(() => {
    if (recoveryStep === "done") {
      wagmiConnect({ connector: caliburConnector });
    }
  }, [recoveryStep, wagmiConnect]);

  async function connectWithKey(key: `0x${string}`): Promise<boolean> {
    setPkConnecting(true);
    setPkError(null);
    try {
      await backendSignin.mutateAsync({ privateKey: key });
      storePrivateKey(key);
      await connectAction(wagmiConfig, { connector: pkConnector });
      setPkInput("");
      setShowPkInput(false);
      setShowScanner(false);
      return true;
    } catch (err) {
      clearPrivateKey();
      setPkError(err instanceof Error ? err.message : t`Connection failed.`);
      return false;
    } finally {
      setPkConnecting(false);
    }
  }

  function handlePkSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPkError(null);
    const result = normalizePrivateKey(pkInput);
    if (!result.ok) {
      setPkError(result.error);
      return;
    }
    void connectWithKey(result.key);
  }

  function handleKeyScanned(raw: string) {
    setPkError(null);
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

    if (result.type === "invalid") {
      setPkError(t`This QR code does not contain a valid private key.`);
      return;
    }
  }

  return (
    <div className="bg-background relative flex min-h-[100svh] flex-col px-6 pt-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <OnboardingMenu />
      <div className="flex flex-col items-center gap-5 text-center">
        <CLCLogo className="size-20" />
        <div className="space-y-1">
          <h1 className="font-heading text-[1.75rem] leading-tight font-bold">CLC</h1>
          <p className="text-muted-foreground text-sm">
            <Trans>Route redeemable claims across curated markets with shared standards.</Trans>
          </p>
        </div>
      </div>

      <div className="mt-auto space-y-3 pt-8 pb-2">
        {connecting ? (
          <div className="flex flex-col items-center gap-2 py-3">
            <FiLoader className="text-primary size-6 animate-spin" />
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
              setPkError(null);
            }}
          />
        ) : null}

        {encryptedPaperWallet && !connecting ? (
          <EncryptedPaperWalletImportForm
            encryptedKey={encryptedPaperWallet}
            onDecrypted={async (key) => {
              const connected = await connectWithKey(key);
              if (!connected) throw new Error(t`Connection failed.`);
              setEncryptedPaperWallet(null);
            }}
            onCancel={() => {
              setEncryptedPaperWallet(null);
              setPkError(null);
            }}
          />
        ) : null}

        {showScanner && pkError ? (
          <p role="alert" className="text-destructive text-xs">
            {pkError}
          </p>
        ) : null}

        {!showScanner && !showPkInput && !encryptedPaperWallet && !connecting ? (
          <Button
            className="bg-foreground text-background hover:bg-foreground/90 h-11 w-full"
            onClick={() => void navigate({ to: "/onboarding" })}
          >
            <FiUserPlus className="mr-2 size-4" aria-hidden="true" />
            <Trans>Create an account</Trans>
          </Button>
        ) : null}

        {outcome === "not_found" ? (
          <div className="border-border bg-card space-y-1 rounded-xl border p-4">
            <p className="text-sm font-medium">
              <Trans>No passkey found</Trans>
            </p>
            <p className="text-muted-foreground text-xs">
              <Trans>No passkey is registered on this device.</Trans>{" "}
              <Link
                to="/onboarding"
                className="text-foreground font-medium underline-offset-4 hover:underline"
              >
                <Trans>Create an account</Trans>
              </Link>{" "}
              <Trans>or</Trans>{" "}
              <button
                type="button"
                className="text-foreground font-medium underline-offset-4 hover:underline"
                onClick={() => recover.mutate()}
              >
                <Trans>try again</Trans>
              </button>
            </p>
          </div>
        ) : recoveryError ? (
          <p className="text-destructive text-xs">{recoveryError}</p>
        ) : null}

        {!showScanner && !showPkInput && !encryptedPaperWallet && !connecting ? (
          <>
            <div className="text-muted-foreground flex items-center gap-3 text-[11px] tracking-[0.24em] uppercase">
              <div className="bg-border h-px flex-1" />
              <span>
                <Trans>or</Trans>
              </span>
              <div className="bg-border h-px flex-1" />
            </div>

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
                setPkError(null);
              }}
            >
              <TbScan className="mr-2 size-4" />
              <Trans>Continue with Paper Wallet</Trans>
            </Button>

            <button
              type="button"
              className="text-muted-foreground hover:text-foreground w-full pt-1 text-center text-sm underline-offset-4 hover:underline"
              onClick={() => {
                setShowAdvanced((current) => !current);
                setShowPkInput(false);
                setPkError(null);
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
                  setPkError(null);
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
                  setPkError(null);
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
              aria-invalid={!!pkError}
              aria-label={t`Private key`}
            />
            {pkError ? (
              <p role="alert" className="text-destructive text-xs">
                {pkError}
              </p>
            ) : null}
            <Button type="submit" disabled={!pkInput.trim()} className="h-11 w-full">
              <FiKey className="mr-2 size-4" />
              <Trans>Sign in with private key</Trans>
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
