import type { ProfileInput } from "@clc/core/features/signup/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FaApple, FaGoogle } from "react-icons/fa";
import { privateKeyToAccount } from "viem/accounts";
import { connect } from "wagmi/actions";

import { OnboardingMenu } from "#/components/language-selector";
import { TermsAcceptanceField } from "#/components/terms-acceptance-field";
import { Button } from "#/components/ui/button";
import { StepProgress } from "#/components/ui/step-progress";
import { BackChevron } from "#/components/wallet/wallet-layout";
import { PendingClock, StatusPill } from "#/components/wallet/wallet-status";
import { clearPrivateKey, storePrivateKey } from "#/connectors/privateKey";
import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";

import { clearIdentitySecrets } from "#/features/auth/api/identity-reset";
import { useBackendSignup } from "#/features/auth/hooks/use-backend-auth";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { useCaliburDelegateFromPk } from "#/features/webauthn/hooks/use-calibur-delegate-from-pk";
import { useCaliburFromPk } from "#/features/webauthn/hooks/use-calibur-from-pk";
import { pickPasskeyProvider } from "#/features/webauthn/hooks/use-platform-passkey-label";
import { RELAYER_URL } from "#/lib/relayer-config";
import { onboardingSearch } from "#/lib/onboarding-search";
import { caliburConnector, pkConnector, wagmiConfig } from "#/providers/web3-config";
import { usePaperWalletProtection } from "./paper-wallet-protection";
import { usePaperWalletSetup } from "./paper-wallet-setup";
import { authClient } from "#/lib/api/auth";

const relayerClient = createRelayerClient(RELAYER_URL);

type Props = {
  profileData: ProfileInput;
  /** Chosen on the profile step; uploaded here, once a session exists. */
  avatarFile: File;
  /** Stable key owned by OnboardingFlow — must not be regenerated on remount. */
  privateKey: `0x${string}`;
  backendRegistered: boolean;
  onBackendRegistered: () => void;
  redirectTo?: string;
  progressStep: number;
  progressTotal: number;
  /** When true, primary CTA links a platform passkey; paper continue stays available. */
  linkPasskey: boolean;
  /** Session verified — parent/route owns history exit. */
  onDone: () => void;
};

export function OnboardingWalletStep({
  profileData,
  avatarFile,
  privateKey: pk,
  backendRegistered,
  onBackendRegistered,
  redirectTo,
  progressStep,
  progressTotal,
  linkPasskey,
  onDone,
}: Props) {
  const { t } = useLingui();
  const queryClient = useQueryClient();

  const account = useMemo(() => privateKeyToAccount(pk), [pk]);
  const address = account.address;
  const {
    qrUrl,
    controls: protectionControls,
    isReady: paperWalletReady,
    isEncrypting: paperWalletEncrypting,
  } = usePaperWalletProtection({ privateKey: pk });

  const [paperWalletDownloaded, setPaperWalletDownloaded] = useState(false);
  const { card, controls, downloadButton } = usePaperWalletSetup({
    address,
    qrUrl,
    defaultName: profileData.name,
    downloadDisabled: !paperWalletReady || paperWalletEncrypting,
    onDownloaded: () => setPaperWalletDownloaded(true),
  });

  const [acked, setAcked] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [caliburConnecting, setCaliburConnecting] = useState(false);
  const [pendingMethod, setPendingMethod] = useState<"passkey" | "paper" | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [linkConnectError, setLinkConnectError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  /** True once passkey registration finished; link CTA retries connect only. */
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);
  /** Only set after connector + session verification both succeed. */
  const finishingRef = useRef(false);
  /**
   * Tracks which connector already succeeded so session-verification recovery
   * does not call connect again (ConnectorAlreadyConnectedError) or clear the
   * stored private key after a successful paper connect.
   */
  const connectorReadyRef = useRef<"none" | "calibur" | "pk">("none");
  /** Prevent the confirmed paper activation effect from reconnecting on rerender. */
  const paperConnectStartedRef = useRef(false);
  const backendSignup = useBackendSignup();
  const {
    step: delegateStep,
    error: delegateError,
    mutateAsync: activatePaperWallet,
    isPending: isDelegating,
  } = useCaliburDelegateFromPk(relayerClient);

  const provider = pickPasskeyProvider();
  const ProviderIcon = provider === "apple" ? FaApple : FaGoogle;
  const providerLabel = provider === "apple" ? "Apple ID" : "Google";

  const {
    step: upgradeStep,
    error: upgradeError,
    upgradeAndLink,
  } = useCaliburFromPk(pk, relayerClient);

  const isUpgrading = ["authorizing", "creating-passkey", "registering", "confirming"].includes(
    upgradeStep,
  );
  const isRegistering = backendSignup.isPending;
  const linkFailed = Boolean(upgradeError || linkConnectError || sessionError);

  // Derive pending Calibur work from upgrade step so the first paint after
  // "done" does not briefly enable paper continue before the effect runs.
  const caliburPending =
    caliburConnecting || (upgradeStep === "done" && !linkConnectError && !sessionError);

  const statusText = isRegistering
    ? t`Creating account...`
    : upgradeStep === "confirming"
      ? t`Passkey linked ... confirming on-chain...`
      : isUpgrading
        ? t`Linking passkey...`
        : caliburPending
          ? t`Connecting wallet...`
          : passkeyRegistered && !linkConnectError && !sessionError
            ? t`Passkey linked`
            : delegateStep === "confirming"
              ? t`Activating on chain...`
              : isDelegating
                ? t`Activating smart wallet...`
                : connecting
                  ? t`Opening paper wallet...`
                  : null;

  useEffect(() => {
    if (!paperWalletReady || paperWalletEncrypting) {
      setAcked(false);
      setPaperWalletDownloaded(false);
    }
  }, [paperWalletReady, paperWalletEncrypting]);

  /**
   * Confirm the backend session matches this address before releasing the UI
   * or latching finishingRef. Route exit only runs when isAuthenticated is true.
   */
  async function verifySession(): Promise<void> {
    const session = await queryClient.fetchQuery({
      queryKey: [...authSessionQueryKey, address.toLowerCase()],
      queryFn: () => authClient.getSession(),
    });
    if (!session || session.address.toLowerCase() !== address.toLowerCase()) {
      throw new Error(t`Session could not be verified. Try again.`);
    }
    await queryClient.invalidateQueries({
      queryKey: authSessionQueryKey,
      refetchType: "all",
    });
  }

  function isAlreadyConnectedError(err: unknown): boolean {
    return (
      err instanceof Error &&
      (err.name === "ConnectorAlreadyConnectedError" || /already connected/i.test(err.message))
    );
  }

  async function ensureCaliburConnected(): Promise<void> {
    if (connectorReadyRef.current === "calibur") return;
    try {
      await connect(wagmiConfig, { connector: caliburConnector });
      connectorReadyRef.current = "calibur";
    } catch (err: unknown) {
      if (isAlreadyConnectedError(err)) {
        connectorReadyRef.current = "calibur";
        return;
      }
      throw err;
    }
  }

  async function ensurePkConnected(): Promise<void> {
    if (connectorReadyRef.current === "pk") return;
    // A new account brings no credentials of its own, but the device may still
    // hold the previous user's — and this flow never calls `disconnect()`, so it
    // is the one path where nothing is inherited from a connector's teardown.
    clearIdentitySecrets("none");
    storePrivateKey(pk);
    try {
      await connect(wagmiConfig, { connector: pkConnector });
      connectorReadyRef.current = "pk";
    } catch (err: unknown) {
      if (isAlreadyConnectedError(err)) {
        connectorReadyRef.current = "pk";
        return;
      }
      clearPrivateKey();
      throw err;
    }
  }

  async function connectCaliburAndFinish() {
    if (finishingRef.current) return;
    // The passkey has already been registered by `useCaliburFromPk` at this
    // point, so the credential to keep is the webauthn one; anything else on the
    // device belongs to someone else.
    clearIdentitySecrets("webauthn");
    setCaliburConnecting(true);
    setLinkConnectError(null);
    setSessionError(null);
    try {
      await ensureCaliburConnected();
      // Session-only retries skip connect when connectorReadyRef is set.
      await verifySession();
      finishingRef.current = true;
      onDone();
    } catch (err: unknown) {
      finishingRef.current = false;
      const message =
        err instanceof Error ? err.message : t`Passkey linked, but wallet connection failed.`;
      // Distinguish connector vs session failures for clearer recovery.
      if (/session/i.test(message)) {
        setSessionError(message);
      } else {
        setLinkConnectError(message);
      }
    } finally {
      setCaliburConnecting(false);
    }
  }

  // Mark connecting before paint when upgrade completes so paper stays disabled.
  useLayoutEffect(() => {
    if (upgradeStep === "done" && !linkConnectError && !sessionError) {
      setPasskeyRegistered(true);
      setCaliburConnecting(true);
    }
  }, [upgradeStep, linkConnectError, sessionError]);

  // Auto-connect Calibur once passkey registration completes.
  useEffect(() => {
    if (upgradeStep !== "done") return;
    if (linkConnectError || sessionError) return;
    if (finishingRef.current) return;
    void connectCaliburAndFinish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only fire on upgrade completion / clear errors
  }, [upgradeStep]);

  // Paper-wallet activation resolves its mutation when the relayer accepts the
  // job. Wait for the separately tracked on-chain confirmation before opening
  // the wallet, which can take two or more blocks on Gnosis.
  useEffect(() => {
    if (pendingMethod !== "paper") return;
    if (delegateStep === "error") {
      setConnecting(false);
      return;
    }
    if (delegateStep !== "done" || paperConnectStartedRef.current) return;
    paperConnectStartedRef.current = true;
    void connectPaperWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react only to tracked activation outcome
  }, [delegateStep, pendingMethod]);

  async function connectPaperWallet() {
    if (finishingRef.current || caliburPending) return;
    setConnectError(null);
    setSessionError(null);
    try {
      await ensurePkConnected();
      // If the connector already succeeded and only session failed, this path
      // retries verification without reconnecting or clearing the stored key.
      await verifySession();
      finishingRef.current = true;
      onDone();
    } catch (err) {
      finishingRef.current = false;
      const message = err instanceof Error ? err.message : t`Connection failed.`;
      if (/session/i.test(message)) {
        setSessionError(message);
      } else {
        setConnectError(message);
      }
      setConnecting(false);
    }
  }

  async function ensureBackendSignup() {
    if (backendRegistered) return;
    await backendSignup.mutateAsync({ profile: profileData, privateKey: pk, avatarFile });
    onBackendRegistered();
  }

  async function handleLinkPasskey() {
    setPendingMethod("passkey");
    setConnectError(null);
    setLinkConnectError(null);
    setSessionError(null);
    // After passkey registration: retry connect (if needed) + session only.
    if (passkeyRegistered || upgradeStep === "done" || connectorReadyRef.current === "calibur") {
      void connectCaliburAndFinish();
      return;
    }
    try {
      await ensureBackendSignup();
      upgradeAndLink.mutate();
    } catch {
      setPendingMethod(null);
      // backendSignup.error is rendered below.
    }
  }

  async function handleContinue() {
    if (finishingRef.current || caliburPending) return;
    setPendingMethod("paper");
    setConnecting(true);
    setConnectError(null);
    setSessionError(null);
    try {
      await ensureBackendSignup();
    } catch (err) {
      clearPrivateKey();
      if (err instanceof BackendApiError) {
        setConnectError(formatBackendApiError(err));
      } else {
        setConnectError(err instanceof Error ? err.message : t`Connection failed.`);
      }
      setPendingMethod(null);
      setConnecting(false);
      return;
    }

    // Activation already reached chain confirmation and only connector/session
    // recovery remains. Do not submit another delegation transaction.
    if (delegateStep === "done" || paperConnectStartedRef.current) {
      paperConnectStartedRef.current = true;
      await connectPaperWallet();
      return;
    }

    try {
      await activatePaperWallet({ privateKey: pk });
    } catch {
      setConnecting(false);
    }
  }

  const formBlocked =
    !acked ||
    !acceptedTerms ||
    !paperWalletDownloaded ||
    !paperWalletReady ||
    paperWalletEncrypting;
  const workInProgress =
    isRegistering || isUpgrading || connecting || isDelegating || caliburPending;
  const linkBusy =
    formBlocked ||
    workInProgress ||
    (passkeyRegistered && !linkConnectError && !sessionError && !caliburPending);
  const paperBusy = formBlocked || workInProgress;
  const pendingError =
    backendSignup.error ||
    sessionError ||
    (pendingMethod === "passkey"
      ? upgradeError || linkConnectError
      : delegateError || connectError);
  const showPendingView = pendingMethod !== null && !pendingError;

  if (showPendingView) {
    return <OnboardingWalletPending status={statusText} />;
  }

  return (
    <div className="relative flex min-h-[100svh] flex-col bg-background">
      <OnboardingMenu />
      <div className="flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <BackChevron
          label={t`Back`}
          to="/onboarding"
          search={onboardingSearch(linkPasskey ? "method" : "profile", redirectTo)}
          className="mb-4 self-start"
        />

        <StepProgress step={progressStep} total={progressTotal} />

        <div className="mb-5 space-y-1">
          <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
            <Trans>Your paper wallet</Trans>
          </h1>
          <p className="text-muted-foreground text-sm">
            <Trans>
              Save this card securely. If you use a password, keep it separately. Anyone with an
              unprotected QR code can access the wallet.
            </Trans>
          </p>
        </div>

        {card}

        {protectionControls}

        {downloadButton}

        {controls}

        <label className="mt-6 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            aria-label={t`I have saved this key`}
            checked={acked}
            disabled={!paperWalletReady || paperWalletEncrypting}
            onChange={(e) => setAcked(e.target.checked)}
            className="mt-0.5 size-4 cursor-pointer accent-primary"
          />
          <span className="text-muted-foreground text-sm">
            <Trans>I have saved this key. If lost, my wallet cannot be recovered.</Trans>
          </span>
        </label>
        {!paperWalletDownloaded ? (
          <p className="mt-2 text-muted-foreground text-xs">
            <Trans>Download your paper wallet before continuing.</Trans>
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          <TermsAcceptanceField
            id="signup-terms"
            checked={acceptedTerms}
            onCheckedChange={setAcceptedTerms}
          />

          {backendSignup.error ? (
            <p className="text-destructive text-xs">
              {backendSignup.error instanceof BackendApiError
                ? formatBackendApiError(backendSignup.error)
                : backendSignup.error instanceof Error
                  ? backendSignup.error.message
                  : t`Account registration failed.`}
            </p>
          ) : null}
          {upgradeError ? <p className="text-destructive text-xs">{upgradeError}</p> : null}
          {delegateError ? <p className="text-destructive text-xs">{delegateError}</p> : null}
          {linkConnectError ? <p className="text-destructive text-xs">{linkConnectError}</p> : null}
          {sessionError ? (
            <p role="alert" className="text-destructive text-xs">
              {sessionError}
            </p>
          ) : null}
          {connectError ? <p className="text-destructive text-xs">{connectError}</p> : null}
          {statusText ? <p className="text-muted-foreground text-xs">{statusText}</p> : null}

          {linkPasskey ? (
            <>
              <Button
                className="h-11 w-full"
                onClick={() => void handleLinkPasskey()}
                disabled={linkBusy}
              >
                <ProviderIcon className="me-2 size-4" />
                {passkeyRegistered && (linkConnectError || sessionError)
                  ? t`Retry ${providerLabel} connection`
                  : t`Link wallet to ${providerLabel}`}
              </Button>
              <Button
                variant={linkFailed ? "default" : "outline"}
                className="h-11 w-full"
                onClick={() => void handleContinue()}
                disabled={paperBusy}
              >
                <Trans>Continue with paper wallet</Trans>
              </Button>
            </>
          ) : (
            <Button
              className="h-11 w-full"
              onClick={() => void handleContinue()}
              disabled={paperBusy}
            >
              <Trans>Continue to wallet</Trans>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function OnboardingWalletPending({ status }: { status: string | null }) {
  return (
    <div
      className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      aria-live="polite"
    >
      <div className="flex flex-col items-center text-center">
        <PendingClock />
        <h1 className="mt-3.5 font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>Setting up your wallet...</Trans>
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          {status ?? <Trans>Waiting for blockchain confirmation...</Trans>}
        </p>
        <div className="mt-3">
          <StatusPill tone="pending" label={<Trans>Pending</Trans>} />
        </div>
      </div>
    </div>
  );
}
