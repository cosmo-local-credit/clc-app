import type { AuthClient, WebAuthnCredentialSummary } from "@clc/api/features/auth/client";
import { RelayerError, type RelayerClient } from "@clc/api/features/relayer/client";
import { encodeRegisterCalldata } from "@clc/core/features/webauthn/index";
import { privateKeyToAccount } from "viem/accounts";

import { waitForOwnershipRelay } from "#/features/ownership/api/wait-for-ownership-relay";
import { readCaliburDelegation } from "#/features/webauthn/api/calibur-delegation";
import { signCaliburBatchWithAccount } from "#/features/webauthn/api/relay-calibur-batch";

import { relayIdempotently } from "./relay-idempotently";

/** States a key rotation leaves for the new wallet's root key to register. */
const RELINKABLE: ReadonlySet<WebAuthnCredentialSummary["state"]> = new Set(["moved", "failed"]);

/**
 * Brings every passkey that came with the account onto the new card's wallet,
 * from clc-core's record rather than from memory, so it can run again after
 * anything: a registration already confirmed is skipped, one still settling is
 * followed to its end instead of relayed again, and one that never took is
 * registered. Each passkey is tried; the first failure is reported after all
 * have had their turn.
 */
export async function relinkMovedPasskeys(input: {
  auth: AuthClient;
  relayer: RelayerClient;
  newKey: `0x${string}`;
}): Promise<void> {
  const { credentials } = await input.auth.getWebAuthnCredentials();
  let failure: unknown = null;
  for (const credential of credentials) {
    try {
      if (credential.state === "pending" && credential.trackingId) {
        await waitForOwnershipRelay(input.relayer, credential.trackingId);
      } else if (
        RELINKABLE.has(credential.state) &&
        credential.publicKeyX &&
        credential.publicKeyY
      ) {
        await relinkPasskey({
          credentialId: credential.credentialId,
          publicKeyX: credential.publicKeyX,
          publicKeyY: credential.publicKeyY,
          newKey: input.newKey,
          relayer: input.relayer,
        });
      }
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
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
        await waitForOwnershipRelay(relayer, pending);
        return;
      }
    }
    throw error;
  }
  await waitForOwnershipRelay(relayer, trackingId);
}
