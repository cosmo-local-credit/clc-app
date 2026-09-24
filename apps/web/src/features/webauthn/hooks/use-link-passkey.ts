import {
  pollTrackingCompletion,
  type WebAuthnCredentialsResult,
} from "@clc/api/features/auth/client";
import { authKeys, webAuthnCredentialsQueryOptions } from "@clc/api/features/auth/queries";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { useConnection } from "wagmi";
import { connect, disconnect, getConnection } from "wagmi/actions";

import { CALIBUR_WEBAUTHN_CONNECTOR_ID } from "#/connectors/calibur-webauthn";
import { getStoredKey, PRIVATE_KEY_CONNECTOR_ID } from "#/connectors/privateKey";
import { clearIdentitySecrets } from "#/features/auth/api/identity-reset";
import { authSessionQueryKey, useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import {
  derivePasskeyAccountStatus,
  type PasskeyAccountStatus,
} from "#/features/webauthn/api/passkey-link-status";
import {
  type PasskeyRegistration,
  type PasskeyRegistrationStep,
  registerPasskey,
} from "#/features/webauthn/api/register-passkey";
import { getWebAuthnSupportError } from "#/features/webauthn/hooks/browser-support";
import { usePlatformPasskeyLabel } from "#/features/webauthn/hooks/use-platform-passkey-label";
import { authClient } from "#/lib/api/auth";
import { RELAYER_URL } from "#/lib/relayer-config";
import { beginWalletSwitch } from "#/lib/wallet-session";
import { getWebAuthnCredential, storeWebAuthnCredential } from "#/lib/webauthn-storage";
import { caliburConnector, wagmiConfig } from "#/providers/web3-config";

const relayerClient = createRelayerClient(RELAYER_URL);

/** How often a pending registration's backend state is re-read. */
const PENDING_POLL_MS = 4_000;

export type LinkPasskeyStep =
  | "idle"
  | PasskeyRegistrationStep
  | "confirming"
  | "connecting"
  | "done";

/**
 * Why a link attempt stopped. The component turns these into copy; none of them
 * leaves the paper-wallet session changed.
 *
 * - `missing-key`       this device does not hold the paper key for the wallet.
 * - `identity-mismatch` connected wallet, session and paper key disagree.
 * - `cancelled`         the platform prompt was dismissed.
 * - `failed`            the relayer refused the registration or it reverted.
 * - `unconfirmed`       accepted, but no outcome yet; the pending row covers it.
 * - `connection-failed` linked, but the switch to the passkey did not complete;
 *                       retry the connection, never the registration.
 */
type LinkPasskeyErrorKind =
  | "missing-key"
  | "identity-mismatch"
  | "cancelled"
  | "failed"
  | "unconfirmed"
  | "connection-failed";

class LinkPasskeyError extends Error {
  constructor(
    public readonly kind: LinkPasskeyErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "LinkPasskeyError";
  }
}

/** Sign-out or a wallet switch won the race; the attempt ends without a word. */
class LinkAbortedError extends Error {}

type PasskeyLinkState = { kind: "loading" } | { kind: "unavailable" } | PasskeyAccountStatus;

/**
 * Settings' passkey row: the account's passkey status, and linking the first
 * one from a paper-wallet session.
 *
 * Status is clc-core's record for the session's address. It is read only for an
 * authenticated session whose address matches the connected wallet, and a
 * failed read is `unavailable` — never inferred as "not linked".
 *
 * Linking reuses the onboarding registration and then moves the connection to
 * the passkey connector for the **same** address. It never generates a key:
 * the paper key must already be on the device and match both the wallet and
 * the session before the platform prompt opens. The attempt holds the wallet
 * switch signal, so sign-out or an account switch aborts it before anything is
 * stored for the previous address.
 */
export function useLinkPasskey(address: `0x${string}` | undefined) {
  const queryClient = useQueryClient();
  const auth = useAuthStatus();
  const { connector } = useConnection();
  const platform = usePlatformPasskeyLabel();
  const [step, setStep] = useState<LinkPasskeyStep>("idle");
  const inFlight = useRef(false);
  /**
   * A registration accepted this session whose outcome was still unknown when
   * the attempt returned. Memory only — it holds public key material and an id,
   * nothing secret — so that if the pending row turns active while Settings is
   * open, this device can store the credential it just created and offer the
   * switch. After a reload it is gone, and a passkey sign-in restores it.
   */
  const [unconfirmed, setUnconfirmed] = useState<PasskeyRegistration | null>(null);

  const sessionAddress = auth.isAuthenticated ? address : undefined;
  const credentialsQuery = useQuery({
    ...webAuthnCredentialsQueryOptions(authClient, sessionAddress ?? "none"),
    enabled: Boolean(sessionAddress),
    retry: 1,
    refetchInterval: (query) =>
      query.state.data?.credentials.some((credential) => credential.state === "pending")
        ? PENDING_POLL_MS
        : false,
  });

  const connectorId = connector?.id;
  const isPaperSession = connectorId === PRIVATE_KEY_CONNECTOR_ID;
  const isPasskeySession = connectorId === CALIBUR_WEBAUTHN_CONNECTOR_ID;
  const supported = platform.available && getWebAuthnSupportError("create") === null;

  let state: PasskeyLinkState;
  if (!sessionAddress) {
    state = { kind: "loading" };
  } else if (credentialsQuery.isPending) {
    state = { kind: "loading" };
  } else if (credentialsQuery.isError || !matchesAddress(credentialsQuery.data, sessionAddress)) {
    state = { kind: "unavailable" };
  } else {
    state = derivePasskeyAccountStatus(
      sessionAddress,
      credentialsQuery.data.credentials,
      getWebAuthnCredential(),
    );
  }

  const credentialsKey = sessionAddress ? authKeys.webAuthnCredentials(sessionAddress) : null;
  const credentials = credentialsQuery.data;

  useEffect(() => {
    if (!unconfirmed || !sessionAddress || !matchesAddress(credentials, sessionAddress)) return;
    if (unconfirmed.address.toLowerCase() !== sessionAddress.toLowerCase()) {
      setUnconfirmed(null);
      return;
    }
    const row = credentials.credentials.find((c) => c.credentialId === unconfirmed.credentialId);
    if (row?.state === "active") {
      storeWebAuthnCredential({
        credentialId: unconfirmed.credentialId,
        keyHash: unconfirmed.keyHash,
        publicKeyX: unconfirmed.publicKeyX,
        publicKeyY: unconfirmed.publicKeyY,
        address: unconfirmed.address,
      });
      setUnconfirmed(null);
    } else if (row?.state !== "pending") {
      setUnconfirmed(null);
    }
  }, [credentials, sessionAddress, unconfirmed]);

  async function readCredentials(expected: `0x${string}`): Promise<WebAuthnCredentialsResult> {
    const result = await queryClient.fetchQuery({
      ...webAuthnCredentialsQueryOptions(authClient, expected),
      staleTime: 0,
    });
    if (!matchesAddress(result, expected)) {
      throw new LinkPasskeyError("identity-mismatch", "Session changed while linking.");
    }
    return result;
  }

  async function assertSession(expected: `0x${string}`): Promise<void> {
    const session = await authClient.getSession();
    if (!session || session.address.toLowerCase() !== expected.toLowerCase()) {
      throw new LinkPasskeyError("identity-mismatch", "Session does not match this wallet.");
    }
  }

  /**
   * Moves the wallet onto the passkey connector without ever leaving it
   * disconnected, and restores the paper-wallet connection on any failure.
   *
   * The same retain/abort/restore shape as `handleConfirmSwitch` in
   * `routes/__root.tsx`, adapted to a switch that keeps the account: the passkey
   * connection is added beside the paper one and verified — same address, same
   * backend session — before the paper connection and its stored key are
   * dropped. On failure the passkey connection is removed, which clears its
   * stored credential, so the credential is written back for Retry connection.
   * `relayCaliburBatch` signs through the active connector, so a credential on
   * disk cannot change how the restored session signs.
   */
  async function switchToPasskey(expected: `0x${string}`, signal: AbortSignal): Promise<void> {
    const credential = getWebAuthnCredential();
    if (!credential || credential.address.toLowerCase() !== expected.toLowerCase()) {
      throw new LinkPasskeyError("connection-failed", "No passkey is stored for this wallet.");
    }
    const paperConnection = getConnection(wagmiConfig);
    if (paperConnection.connector?.id !== PRIVATE_KEY_CONNECTOR_ID) {
      throw new LinkPasskeyError(
        "identity-mismatch",
        "This wallet is not signed in with its paper wallet.",
      );
    }
    const paperConnector = paperConnection.connector;

    setStep("connecting");
    try {
      await connect(wagmiConfig, { connector: caliburConnector });
      if (signal.aborted) throw new LinkAbortedError();
      const passkeyConnection = getConnection(wagmiConfig);
      if (passkeyConnection.address?.toLowerCase() !== expected.toLowerCase()) {
        throw new Error("The passkey connected a different wallet.");
      }
      await assertSession(expected);
      if (signal.aborted) throw new LinkAbortedError();
    } catch (err) {
      if (signal.aborted || err instanceof LinkAbortedError) {
        // Sign-out or a newer switch won: no credential for this address may
        // survive, and neither connection may linger behind it.
        clearIdentitySecrets("none");
        await disconnectAll();
        throw new LinkAbortedError();
      }
      const current = getConnection(wagmiConfig).connector;
      if (current?.id === CALIBUR_WEBAUTHN_CONNECTOR_ID) {
        try {
          await disconnect(wagmiConfig, { connector: current });
        } catch {
          // wagmi falls back to the remaining paper connection either way.
        }
      }
      storeWebAuthnCredential({
        credentialId: credential.credentialId,
        keyHash: credential.keyHash,
        publicKeyX: credential.publicKeyX,
        publicKeyY: credential.publicKeyY,
        address: credential.address,
      });
      throw new LinkPasskeyError(
        "connection-failed",
        err instanceof Error ? err.message : "Passkey linked, but the wallet did not switch to it.",
      );
    }

    // Verified: the passkey now owns the session, so the paper key leaves the
    // device. The card itself remains the recovery method.
    try {
      await disconnect(wagmiConfig, { connector: paperConnector });
    } catch {
      // The clear below is what matters.
    }
    clearIdentitySecrets("webauthn");
    await queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
  }

  const link = useMutation({
    mutationFn: async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      const signal = beginWalletSwitch();
      try {
        const expected = requireAddress(address);
        if (!isPaperSession) {
          throw new LinkPasskeyError(
            "identity-mismatch",
            "Sign in with your paper wallet to link a passkey.",
          );
        }
        const privateKey = getStoredKey();
        if (!privateKey) {
          throw new LinkPasskeyError("missing-key", "The paper wallet key is not on this device.");
        }
        if (privateKeyToAccount(privateKey).address.toLowerCase() !== expected.toLowerCase()) {
          throw new LinkPasskeyError(
            "identity-mismatch",
            "The stored paper wallet is a different wallet.",
          );
        }
        if (getConnection(wagmiConfig).address?.toLowerCase() !== expected.toLowerCase()) {
          throw new LinkPasskeyError("identity-mismatch", "The connected wallet changed.");
        }
        await assertSession(expected);
        const before = await readCredentials(expected);
        if (derivePasskeyAccountStatus(expected, before.credentials, null).kind !== "available") {
          // Another tab or device linked or started linking meanwhile.
          throw new LinkPasskeyError(
            "failed",
            "This account already has a passkey or one pending.",
          );
        }
        if (signal.aborted) throw new LinkAbortedError();

        let registration: Awaited<ReturnType<typeof registerPasskey>>;
        try {
          registration = await registerPasskey(privateKey, relayerClient, setStep);
        } catch (err) {
          if (err instanceof DOMException && err.name === "NotAllowedError") {
            throw new LinkPasskeyError("cancelled", "Passkey creation was cancelled.");
          }
          throw new LinkPasskeyError(
            "failed",
            err instanceof Error ? err.message : "Linking failed.",
          );
        }

        // Accepted: clc-core now holds a pending row, which is what a reload
        // resumes from. Nothing below may submit another registration.
        setStep("confirming");
        await queryClient.invalidateQueries({ queryKey: authKeys.webAuthnCredentials(expected) });
        try {
          await pollTrackingCompletion(
            async () => (await relayerClient.trackRelay(registration.trackingId)).result,
            { pendingWhileNotFound: true },
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "";
          if (/not confirmed/i.test(message)) {
            setUnconfirmed(registration);
            throw new LinkPasskeyError("unconfirmed", message);
          }
          throw new LinkPasskeyError("failed", message || "The registration did not confirm.");
        }

        const after = await readCredentials(expected);
        const row = after.credentials.find((c) => c.credentialId === registration.credentialId);
        if (row?.state === "pending") {
          // The receipt is in but clc-core has not applied it yet.
          setUnconfirmed(registration);
          throw new LinkPasskeyError("unconfirmed", "The passkey is not active yet.");
        }
        if (row?.state !== "active") {
          throw new LinkPasskeyError("failed", "The passkey registration did not take effect.");
        }
        if (signal.aborted) throw new LinkAbortedError();

        storeWebAuthnCredential({
          credentialId: registration.credentialId,
          keyHash: registration.keyHash,
          publicKeyX: registration.publicKeyX,
          publicKeyY: registration.publicKeyY,
          address: registration.address,
        });
        await switchToPasskey(expected, signal);
        setStep("done");
      } finally {
        inFlight.current = false;
      }
    },
    onError: (err) => {
      setStep("idle");
      if (err instanceof LinkAbortedError) return;
      if (credentialsKey) void queryClient.invalidateQueries({ queryKey: credentialsKey });
    },
  });

  /** Switches to a passkey already linked and stored here. Never re-registers. */
  const retryConnection = useMutation({
    mutationFn: async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      const signal = beginWalletSwitch();
      try {
        const expected = requireAddress(address);
        const after = await readCredentials(expected);
        const status = derivePasskeyAccountStatus(
          expected,
          after.credentials,
          getWebAuthnCredential(),
        );
        if (status.kind !== "linked-here") {
          throw new LinkPasskeyError(
            "connection-failed",
            "No active passkey is stored on this device.",
          );
        }
        await switchToPasskey(expected, signal);
        setStep("done");
      } finally {
        inFlight.current = false;
      }
    },
    onError: () => setStep("idle"),
  });

  const error = link.error ?? retryConnection.error;

  return {
    state,
    step,
    busy: link.isPending || retryConnection.isPending,
    isPaperSession,
    isPasskeySession,
    supported,
    platformLabel: platform.label,
    error: error instanceof LinkPasskeyError ? error : null,
    retryStatus: () => void credentialsQuery.refetch(),
    link: () => link.mutate(),
    retryConnection: () => retryConnection.mutate(),
  };
}

function matchesAddress(
  result: WebAuthnCredentialsResult | undefined,
  address: `0x${string}`,
): result is WebAuthnCredentialsResult {
  return result?.address.toLowerCase() === address.toLowerCase();
}

function requireAddress(address: `0x${string}` | undefined): `0x${string}` {
  if (!address) throw new LinkPasskeyError("identity-mismatch", "No wallet is connected.");
  return address;
}

async function disconnectAll(): Promise<void> {
  // A snapshot: disconnect() deletes from the live map as it goes.
  for (const { connector } of Array.from(wagmiConfig.state.connections.values())) {
    try {
      await disconnect(wagmiConfig, { connector });
    } catch {
      // Credentials are already cleared; a dead connector must not block the rest.
    }
  }
}
