import type { ProfileInput } from "@clc/core/features/signup/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FaApple, FaGoogle } from "react-icons/fa";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { connect } from "wagmi/actions";

import { OnboardingMenu } from "#/components/language-selector";
import { Button } from "#/components/ui/button";
import { clearPrivateKey, storePrivateKey } from "#/connectors/privateKey";
import { useBackendSignup } from "#/features/auth/hooks/use-backend-auth";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
import { useCaliburDelegateFromPk } from "#/features/webauthn/hooks/use-calibur-delegate-from-pk";
import { useCaliburFromPk } from "#/features/webauthn/hooks/use-calibur-from-pk";
import {
  isPasskeyPlatformAvailable,
  pickPasskeyProvider,
} from "#/features/webauthn/hooks/use-platform-passkey-label";
import { RELAYER_URL } from "#/lib/backend-config";
import { buildPaperWalletUrl } from "#/lib/paper-wallet";
import { caliburConnector, pkConnector, wagmiConfig } from "#/providers/web3-config";
import { usePaperWalletSetup } from "./paper-wallet-setup";

const relayerClient = createRelayerClient(RELAYER_URL);

type Props = {
  profileData: ProfileInput;
  onBack: () => void;
  onDone: () => void;
};

export function OnboardingWalletStep({ profileData, onBack, onDone }: Props) {
  const { t } = useLingui();
  const keyRef = useRef<`0x${string}` | null>(null);
  if (!keyRef.current) keyRef.current = generatePrivateKey();
  const pk = keyRef.current;

  const account = useMemo(() => privateKeyToAccount(pk), [pk]);
  const address = account.address;
  const qrUrl = buildPaperWalletUrl(pk);

  const { card, controls, downloadButton } = usePaperWalletSetup({
    address,
    qrUrl,
    defaultName: profileData.name,
  });

  const [acked, setAcked] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [linkConnectError, setLinkConnectError] = useState<string | null>(null);
  const [backendRegistered, setBackendRegistered] = useState(false);
  const backendSignup = useBackendSignup();
  const delegatePaperWallet = useCaliburDelegateFromPk(relayerClient);

  const available = isPasskeyPlatformAvailable();
  const provider = pickPasskeyProvider();
  const ProviderIcon = provider === "apple" ? FaApple : FaGoogle;
  const providerLabel = provider === "apple" ? "Apple ID" : "Google";

  const {
    step: upgradeStep,
    error: upgradeError,
    upgradeAndLink,
  } = useCaliburFromPk(pk, relayerClient);

  const isUpgrading = ["authorizing", "creating-passkey", "registering"].includes(upgradeStep);
  const isRegistering = backendSignup.isPending;
  const isDelegating = delegatePaperWallet.isPending;
  const isLinked = upgradeStep === "done";

  useEffect(() => {
    if (upgradeStep === "done") {
      setLinkConnectError(null);
      void connect(wagmiConfig, { connector: caliburConnector })
        .then(() => {
          onDone();
        })
        .catch((err: unknown) => {
          setLinkConnectError(
            err instanceof Error ? err.message : t`Passkey linked, but wallet connection failed.`,
          );
        });
    }
  }, [upgradeStep, onDone, t]);

  async function ensureBackendSignup() {
    if (backendRegistered) return;
    await backendSignup.mutateAsync({ profile: profileData, privateKey: pk });
    setBackendRegistered(true);
  }

  async function handleLinkPasskey() {
    setConnectError(null);
    setLinkConnectError(null);
    try {
      await ensureBackendSignup();
      upgradeAndLink.mutate();
    } catch {
      // backendSignup.error is rendered below.
    }
  }

  async function handleContinue() {
    setConnecting(true);
    setConnectError(null);
    try {
      await ensureBackendSignup();
      await delegatePaperWallet.mutateAsync({ privateKey: pk });
      storePrivateKey(pk);
      await connect(wagmiConfig, { connector: pkConnector });
      onDone();
    } catch (err) {
      clearPrivateKey();
      setConnectError(err instanceof Error ? err.message : t`Connection failed.`);
      setConnecting(false);
    }
  }

  return (
    <div className="relative flex min-h-[100svh] flex-col bg-background">
      <OnboardingMenu />
      <div className="flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 -ml-2 flex h-11 items-center gap-1.5 self-start px-2 text-muted-foreground text-sm hover:text-foreground"
          aria-label={t`Back`}
        >
          <ArrowLeft className="size-4" />
          <Trans>Back</Trans>
        </button>

        <div className="mb-5 space-y-1">
          <h1 className="font-bold font-heading text-[1.75rem] leading-tight">
            <Trans>Your paper wallet</Trans>
          </h1>
          <p className="text-muted-foreground text-sm">
            <Trans>
              Download or photograph this card. Anyone who scans the QR code will have full access
              to this wallet.
            </Trans>
          </p>
        </div>

        {card}

        {downloadButton}

        {controls}

        <label className="mt-6 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            aria-label={t`I have saved this key`}
            checked={acked}
            onChange={(e) => setAcked(e.target.checked)}
            className="mt-0.5 size-4 cursor-pointer accent-primary"
          />
          <span className="text-muted-foreground text-sm">
            <Trans>I have saved this key. If lost, my wallet cannot be recovered.</Trans>
          </span>
        </label>

        <div className="mt-4 space-y-3">
          {available ? (
            <Button
              className="h-11 w-full"
              onClick={() => void handleLinkPasskey()}
              disabled={!acked || isRegistering || isUpgrading || isLinked}
            >
              {isRegistering || isUpgrading ? (
                <LoaderCircle className="mr-2 size-4 animate-spin" />
              ) : (
                <ProviderIcon className="mr-2 size-4" />
              )}
              {isRegistering
                ? t`Creating account...`
                : isUpgrading
                  ? t`Linking passkey...`
                  : isLinked
                    ? t`Passkey linked`
                    : t`Link wallet to ${providerLabel} passkey`}
            </Button>
          ) : null}

          {backendSignup.error ? (
            <p className="text-destructive text-xs">
              {backendSignup.error instanceof Error
                ? backendSignup.error.message
                : t`Account registration failed.`}
            </p>
          ) : null}
          {upgradeError ? <p className="text-destructive text-xs">{upgradeError}</p> : null}
          {delegatePaperWallet.error ? (
            <p className="text-destructive text-xs">
              {delegatePaperWallet.error instanceof Error
                ? delegatePaperWallet.error.message
                : t`Smart wallet activation failed.`}
            </p>
          ) : null}
          {linkConnectError ? <p className="text-destructive text-xs">{linkConnectError}</p> : null}

          <button
            type="button"
            className="w-full py-2 text-center font-medium text-foreground text-sm underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
            disabled={
              !acked || connecting || isRegistering || isDelegating || isUpgrading || isLinked
            }
            onClick={handleContinue}
          >
            {connecting || isRegistering || isDelegating ? (
              <LoaderCircle className="mr-2 inline size-4 animate-spin" />
            ) : null}
            {isRegistering
              ? t`Creating account...`
              : isDelegating
                ? t`Activating smart wallet...`
                : connecting
                  ? t`Opening paper wallet...`
                  : available
                    ? t`Continue with paper wallet`
                    : t`Continue to wallet`}
          </button>
          {connectError ? <p className="text-destructive text-xs">{connectError}</p> : null}
        </div>
      </div>
    </div>
  );
}
