import type { ProfileInput } from "@clc/core/features/signup/logic";
import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { connect } from "wagmi/actions";

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
import type { WalletPage } from "#/lib/onboarding-search";
import { translateRecipientError } from "#/lib/recipient-error-i18n";
import { caliburConnector, pkConnector, wagmiConfig } from "#/providers/web3-config";
import { usePaperWalletProtection } from "./use-paper-wallet-protection";
import { usePaperWalletSetupState } from "./use-paper-wallet-setup";
import { authClient } from "#/lib/api/auth";

const relayerClient = createRelayerClient(RELAYER_URL);

export type UseOnboardingWalletOptions = {
  /** Which job is on screen; one instance spans all three so nothing is lost between them. */
  page: WalletPage;
  /** A page was reached without the one before it done, after a reload or Forward. */
  onReplace: (page: Exclude<WalletPage, "link">) => void;
  profileData: ProfileInput;
  /** Chosen on the profile step; uploaded here, once a session exists. */
  avatarFile: File;
  /** Stable key owned by the onboarding flow — must not be regenerated on remount. */
  privateKey: `0x${string}`;
  backendRegistered: boolean;
  onBackendRegistered: () => void;
  /** Session verified — parent/route owns history exit. */
  onDone: () => void;
};

/**
 * The paper wallet's three jobs — protect the card, save it, then finish with
 * a passkey or the paper wallet alone — and the signup, activation and
 * connection work behind them. The phone screens and the desktop setup steps
 * render the same instance.
 */
export function useOnboardingWallet({
  page,
  onReplace,
  profileData,
  avatarFile,
  privateKey: pk,
  backendRegistered,
  onBackendRegistered,
  onDone,
}: UseOnboardingWalletOptions) {
  const { t, i18n } = useLingui();
  const queryClient = useQueryClient();

  const account = useMemo(() => privateKeyToAccount(pk), [pk]);
  const address = account.address;
  const protection = usePaperWalletProtection({ privateKey: pk });
  const { qrUrl, isReady: paperWalletReady, isEncrypting: paperWalletEncrypting } = protection;

  const [paperWalletDownloaded, setPaperWalletDownloaded] = useState(false);
  const setup = usePaperWalletSetupState({
    address,
    qrUrl,
    defaultName: profileData.name,
    downloadDisabled: !paperWalletReady || paperWalletEncrypting,
    downloaded: paperWalletDownloaded,
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
    ? t`Creating account…`
    : upgradeStep === "confirming"
      ? t`Passkey linked … confirming on-chain…`
      : isUpgrading
        ? t`Linking passkey…`
        : caliburPending
          ? t`Connecting wallet…`
          : passkeyRegistered && !linkConnectError && !sessionError
            ? t`Passkey linked`
            : delegateStep === "confirming"
              ? t`Activating on chain…`
              : isDelegating
                ? t`Activating smart wallet…`
                : connecting
                  ? t`Opening paper wallet…`
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
    } catch {
      setPendingMethod(null);
      setConnecting(false);
      // Registration failures are owned and rendered by backendSignup. They
      // are not connector failures and must not be copied into connectError.
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
  // The form stays up behind an error, so a retry that is under way shows on
  // the button that started it.
  const linkPending = pendingMethod === "passkey" && workInProgress;
  const paperPending = pendingMethod === "paper" && workInProgress;
  const pendingError =
    backendSignup.error ||
    sessionError ||
    (pendingMethod === "passkey"
      ? upgradeError || linkConnectError
      : delegateError || connectError);
  const showPendingView = pendingMethod !== null && !pendingError;

  // Each page needs the one before it. A fresh instance (after a reload or
  // Forward) has neither the password applied nor the card saved.
  useEffect(() => {
    if (page !== "card" && !paperWalletReady) onReplace("card");
    else if (page === "link" && !(paperWalletDownloaded && acked)) onReplace("save");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check only when the page changes
  }, [page]);

  const pendingPath: "passkey" | "paper" = pendingMethod === "passkey" ? "passkey" : "paper";
  const pendingPhase = isRegistering
    ? 0
    : pendingMethod === "passkey"
      ? upgradeStep === "confirming"
        ? 2
        : caliburPending || upgradeStep === "done"
          ? 3
          : 1
      : delegateStep === "confirming"
        ? 2
        : delegateStep === "done"
          ? 3
          : 1;

  // One message at a time, beside the buttons it is about: the failures are
  // situational and each names its own recovery.
  const errorMessage = backendSignup.error
    ? (translateRecipientError(backendSignup.error, i18n) ??
      (backendSignup.error instanceof BackendApiError
        ? formatBackendApiError(backendSignup.error)
        : backendSignup.error instanceof Error
          ? backendSignup.error.message
          : t`Account registration failed.`))
    : (upgradeError ?? delegateError ?? linkConnectError ?? sessionError ?? connectError);
  const canContinue = paperWalletDownloaded && acked && paperWalletReady && !paperWalletEncrypting;

  return {
    address,
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
  };
}
