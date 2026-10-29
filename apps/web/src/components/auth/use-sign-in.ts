import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { useConnection, useDisconnect } from "wagmi";
import { connect as connectAction } from "wagmi/actions";

import type { NfcCardProblem } from "#/components/nfc-card-prompt";
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
import { markNfc } from "#/lib/nfc/metrics";
import { useWebNfcSupported } from "#/lib/nfc/ndef-adapter";
import { useNfcScan } from "#/lib/nfc/use-nfc-scan";
import { RELAYER_URL } from "#/lib/relayer-config";
import { readNfcCardContent } from "@clc/core/features/nfc/logic";
import { parsePaperWalletImportPayload } from "@clc/core/features/wallet/paper-wallet";
import { caliburConnector, pkConnector, wagmiConfig } from "#/providers/web3-config";
import { sanitizeInternalRedirect } from "./redirect";

const relayerClient = createRelayerClient(RELAYER_URL);

type AuthPanelState = "form" | "approvalPending" | "approvalRejected";

export type UseSignInOptions = {
  onAuthenticated: () => void;
  redirectTo?: string;
  /**
   * Onboarding step used by the "Create an account" affordances (footer link
   * and account-not-found prompt). Defaults to `profile` so the user lands on
   * the form rather than the welcome fork.
   */
  createAccountStep?: "welcome" | "profile";
  /** When true, create-account navigation replaces the current history entry. */
  createAccountReplace?: boolean;
};

/**
 * Every way back into an account — passkey, paper wallet QR, NFC card, typed
 * private key, password-protected card — and the states between them. The
 * phone panel and the desktop sign-in column render the same instance.
 */
export function useSignIn({
  onAuthenticated,
  redirectTo,
  createAccountStep = "profile",
  createAccountReplace = false,
}: UseSignInOptions) {
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
  const passkey = usePlatformPasskeyLabel();
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
    setError(t`Enter a valid private key or sign-in card.`);
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

  /** The protected card's password opened it: sign in, and drop it once that worked. */
  async function onEncryptedDecrypted(key: `0x${string}`) {
    const connected = await connectWithKey(key);
    if (connected) setEncryptedPaperWallet(null);
  }

  return {
    panelState,
    retryAction,
    approvalBusy: backendSignin.isPending || signin.isPending,
    connecting,
    cardRead,
    error,
    passkey,
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
    currentRedirect,
    createAccountSearch,
    signInWithPasskey,
    startNfc,
    closeNfc,
    handlePkSubmit,
    handleKeyScanned,
    onEncryptedDecrypted,
    routeToSignup,
    closeAccountNotFound: () => setAccountNotFoundOpen(false),
    openScanner: () => {
      setShowScanner(true);
      setError(null);
    },
    closeScanner: () => {
      setShowScanner(false);
      setError(null);
    },
    openPrivateKey: () => {
      setShowPkInput(true);
      setError(null);
    },
    closePrivateKey: () => {
      setShowPkInput(false);
      setPkInput("");
      setError(null);
    },
    closeEncrypted: () => {
      setEncryptedPaperWallet(null);
      setError(null);
    },
    /** Drops a captured card and opens the camera again. */
    resumeScanner: () => {
      setEncryptedPaperWallet(null);
      setShowScanner(true);
      setError(null);
    },
    toggleAdvanced: () => {
      setShowAdvanced((current) => !current);
      setShowPkInput(false);
      setError(null);
    },
  };
}
