import type { AuthClient, WebAuthnCredentialSummary } from "@clc/api/features/auth/client";
import {
  isRelaySubmissionUncertain,
  RelayerError,
  type RelayerClient,
} from "@clc/api/features/relayer/client";
import { encodeRegisterCalldata } from "@clc/core/features/webauthn/index";
import { privateKeyToAccount } from "viem/accounts";

import {
  OwnershipSettlementError,
  waitForOwnershipRelay,
} from "#/features/ownership/api/wait-for-ownership-relay";
import { readCaliburDelegation } from "#/features/webauthn/api/calibur-delegation";
import { signCaliburBatchWithAccount } from "#/features/webauthn/api/relay-calibur-batch";

import { relayIdempotently } from "./relay-idempotently";

/**
 * A registration was submitted but its outcome is unknown. Nothing else may be
 * signed until it settles: the next registration would be signed over the same
 * Calibur nonce, and one of the two would revert.
 */
export class UnsettledRegistrationError extends Error {
  constructor(cause: unknown) {
    super("A passkey registration is still settling. Try again in a minute.", { cause });
  }
}

/**
 * The state clc-core leaves a passkey in until the new wallet registers it. A
 * registration that reverts returns it here, so this is also the retry.
 */
const MOVED: WebAuthnCredentialSummary["state"] = "moved";

/**
 * Brings every passkey that came with the account onto the new card's wallet,
 * from clc-core's record rather than from memory, so it can run again after
 * anything.
 *
 * Registrations already submitted are settled first, all of them, before
 * anything is signed: each new registration is signed over the wallet's next
 * Calibur nonce, and one still in flight holds that nonce until it lands. Only
 * then is the record read again and each passkey still `moved` registered, one
 * at a time. A passkey refused or reverted does not stop the next; one whose
 * outcome is unknown stops everything, and the next run settles it first.
 */
export async function relinkMovedPasskeys(input: {
  auth: AuthClient;
  relayer: RelayerClient;
  newKey: `0x${string}`;
}): Promise<void> {
  const before = await input.auth.getWebAuthnCredentials();
  let failure: unknown = null;
  for (const credential of before.credentials) {
    if (credential.state !== "pending") continue;
    // A pending row always carries the tracking id it waits on; one without it
    // cannot be followed, so nothing may be signed past it.
    if (!credential.trackingId) throw new UnsettledRegistrationError(null);
    try {
      await settle(input.relayer, credential.trackingId);
    } catch (error) {
      if (error instanceof UnsettledRegistrationError) throw error;
      failure ??= error;
    }
  }

  const { credentials } = await input.auth.getWebAuthnCredentials();
  for (const credential of credentials) {
    if (credential.state === "pending") throw new UnsettledRegistrationError(null);
    if (credential.state !== MOVED || !credential.publicKeyX || !credential.publicKeyY) continue;
    try {
      await relinkPasskey({
        credentialId: credential.credentialId,
        publicKeyX: credential.publicKeyX,
        publicKeyY: credential.publicKeyY,
        newKey: input.newKey,
        relayer: input.relayer,
      });
    } catch (error) {
      if (error instanceof UnsettledRegistrationError) throw error;
      failure ??= error;
    }
  }
  if (failure) throw failure;
}

/** Follows a registration to its end; an unknown end is not a failure to skip. */
async function settle(relayer: RelayerClient, trackingId: string): Promise<void> {
  try {
    await waitForOwnershipRelay(relayer, trackingId);
  } catch (error) {
    if (error instanceof OwnershipSettlementError && !error.terminal) {
      throw new UnsettledRegistrationError(error);
    }
    throw error;
  }
}

/**
 * Registers one passkey on the new card's wallet: the same P-256 key, a new
 * account. The new card's root key signs a `register()` self-call, which
 * clc-core requires before it re-arms the moved row. Resolves once the chain
 * confirms it; only then does the passkey sign in again.
 */
async function relinkPasskey(input: {
  credentialId: string;
  publicKeyX: string;
  publicKeyY: string;
  newKey: `0x${string}`;
  relayer: RelayerClient;
}): Promise<void> {
  const { relayer } = input;
  const account = privateKeyToAccount(input.newKey);
  const [delegated, health] = await Promise.all([
    readCaliburDelegation(account.address),
    relayer.getHealth(),
  ]);
  const executor = health.result.relayerAddress;
  if (!executor) throw new Error("Relayer health response is missing relayerAddress");

  const payload = await signCaliburBatchWithAccount(
    {
      account,
      senderAddress: account.address,
      calls: [
        {
          to: account.address,
          value: "0",
          data: encodeRegisterCalldata(BigInt(input.publicKeyX), BigInt(input.publicKeyY)),
        },
      ],
      includeAuthorization: !delegated,
      deadline: "0",
      executor: executor as `0x${string}`,
    },
    relayer,
  );

  let trackingId: string;
  try {
    trackingId = await relayIdempotently(
      {
        ...payload,
        credentialId: input.credentialId,
        publicKeyX: input.publicKeyX,
        publicKeyY: input.publicKeyY,
      },
      relayer,
    );
  } catch (error) {
    // The relay refuses a second registration of the same mapping and says
    // where the first one stands.
    if (error instanceof RelayerError && error.status === 409) {
      if (error.result?.state === "active") return;
      const pending = error.result?.trackingId;
      if (error.result?.state === "pending" && typeof pending === "string") {
        await settle(relayer, pending);
        return;
      }
    }
    // Resent as often as it may be and still unanswered: it may be queued.
    if (isRelaySubmissionUncertain(error)) throw new UnsettledRegistrationError(error);
    throw error;
  }
  await settle(relayer, trackingId);
}
