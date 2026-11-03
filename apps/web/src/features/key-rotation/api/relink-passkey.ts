import type { MovedPasskey } from "@clc/api/features/auth/client";
import type { RelayerClient } from "@clc/api/features/relayer/client";
import { encodeRegisterCalldata } from "@clc/core/features/webauthn/index";
import { privateKeyToAccount } from "viem/accounts";

import { waitForOwnershipRelay } from "#/features/ownership/api/wait-for-ownership-relay";
import { readCaliburDelegation } from "#/features/webauthn/api/calibur-delegation";
import { signCaliburBatchWithAccount } from "#/features/webauthn/api/relay-calibur-batch";

/**
 * Registers a passkey that came with the account on the new card's wallet, so
 * nobody enrols again.
 *
 * The same P-256 key, a new account: the new card's root key signs a
 * `register()` self-call, which clc-core requires before it re-arms the moved
 * row (`CheckWebAuthnRegistration`). The first registration also delegates the
 * new wallet. Resolves once the chain confirms it; only then does the passkey
 * sign in again.
 */
export async function relinkPasskey(input: {
  passkey: MovedPasskey;
  newKey: `0x${string}`;
  relayer: RelayerClient;
}): Promise<void> {
  const { passkey, relayer } = input;
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
          data: encodeRegisterCalldata(BigInt(passkey.publicKeyX), BigInt(passkey.publicKeyY)),
        },
      ],
      includeAuthorization: !delegated,
      deadline: "0",
      executor: executor as `0x${string}`,
    },
    relayer,
  );
  const {
    result: { trackingId },
  } = await relayer.relay({
    ...payload,
    credentialId: passkey.credentialId,
    publicKeyX: passkey.publicKeyX,
    publicKeyY: passkey.publicKeyY,
  });
  await waitForOwnershipRelay(relayer, trackingId);
}
