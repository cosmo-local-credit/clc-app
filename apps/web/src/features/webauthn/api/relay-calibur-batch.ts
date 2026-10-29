import { eip7702AuthMessage, type CaliburCall } from "@clc/core/features/webauthn/index";
import { encodeAbiParameters, parseSignature } from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";

import { CALIBUR_WEBAUTHN_CONNECTOR_ID } from "#/connectors/calibur-webauthn";
import { getStoredKey, PRIVATE_KEY_CONNECTOR_ID } from "#/connectors/privateKey";
import { signDigestWithPasskey } from "#/features/webauthn/api/sign-digest";
import { CHAIN_ID, CHAIN_ID_BIGINT } from "#/lib/chain";
import { CALIBUR_ADDRESS } from "#/lib/relayer-config";
import { getWebAuthnCredential } from "#/lib/webauthn-storage";
import type {
  RelayerClient,
  RelayPayload,
  RelayValuationSnapshot,
} from "@clc/api/features/relayer/client";

const ZERO_HASH = `0x${"00".repeat(32)}` as `0x${string}`;

export type RelayCaliburBatchInput = {
  senderAddress: `0x${string}`;
  /**
   * The wagmi connector the wallet is connected through (`useConnection()`),
   * which decides the signer. Required, not defaulted: guessing from whichever
   * secret is on disk is how a stored passkey could take over signing for a
   * session still connected through its paper wallet.
   */
  connectorId: string | undefined;
  calls: CaliburCall[];
  includeAuthorization?: boolean;
  deadline?: string;
};

export type RelayCaliburBatchResult = {
  trackingId: string;
  signatureType: "secp256k1" | "webauthn";
  valuationSnapshots?: RelayValuationSnapshot[];
};

export async function relayCaliburBatch(
  input: RelayCaliburBatchInput,
  client: RelayerClient,
): Promise<RelayCaliburBatchResult> {
  const batchedCall = { calls: input.calls, revertOnFailure: true };
  const {
    result: { relayerAddress },
  } = await client.getHealth();
  if (!relayerAddress) throw new Error("Relayer health response is missing relayerAddress");
  const executor = relayerAddress as `0x${string}`;
  const deadline = input.deadline ?? "0";

  // The signer follows the connector the wallet is connected through, never
  // whichever secret happens to be on disk. Linking a passkey from a paper-wallet
  // session stores the new credential before the connector switch completes; if
  // that switch fails, the session stays on the paper wallet and must keep
  // signing with it rather than silently moving to the passkey.
  const { connectorId } = input;
  if (connectorId === CALIBUR_WEBAUTHN_CONNECTOR_ID) {
    const credential = getWebAuthnCredential();
    if (!credential) throw new Error("No passkey is stored for this wallet.");
    if (credential.stale) throw new Error("Credential is stale; re-authenticate");
    if (credential.address.toLowerCase() !== input.senderAddress.toLowerCase()) {
      throw new Error("Stored passkey does not match the connected wallet.");
    }

    const preview = await client.relayPreview({
      userAddress: credential.address,
      batchedCall,
      keyHash: credential.keyHash,
      executor,
      deadline,
    });
    const signedBatch = {
      batchedCall,
      nonce: preview.result.nonce,
      keyHash: credential.keyHash,
      executor,
      deadline,
    };
    const signature = encodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes" }],
      [await signDigestWithPasskey(preview.result.digest, credential.credentialId), "0x"],
    );
    const { result } = await client.relay({
      userAddress: credential.address,
      signedBatch,
      signature,
      signatureType: "webauthn",
      authorization: undefined,
    });
    return {
      trackingId: result.trackingId,
      signatureType: "webauthn",
      ...(result.valuationSnapshots ? { valuationSnapshots: result.valuationSnapshots } : {}),
    };
  }

  if (connectorId !== PRIVATE_KEY_CONNECTOR_ID) {
    throw new Error("No wallet is connected to sign this transaction.");
  }

  const privateKey = getStoredKey();
  if (!privateKey) throw new Error("No signing key found for this wallet.");
  const payload = await signCaliburBatchWithAccount(
    {
      account: privateKeyToAccount(privateKey),
      senderAddress: input.senderAddress,
      calls: input.calls,
      includeAuthorization: input.includeAuthorization,
      deadline,
      executor,
    },
    client,
  );
  const { result } = await client.relay(payload);
  return {
    trackingId: result.trackingId,
    signatureType: "secp256k1",
    ...(result.valuationSnapshots ? { valuationSnapshots: result.valuationSnapshots } : {}),
  };
}

export type SignCaliburBatchWithAccountInput = {
  /** The signer, supplied explicitly. Never looked up from storage or the connector. */
  account: PrivateKeyAccount;
  senderAddress: `0x${string}`;
  calls: CaliburCall[];
  /** Attach an EIP-7702 authorization: the wallet is not yet delegated to Calibur. */
  includeAuthorization?: boolean;
  /** Unix seconds; "0" means no deadline. */
  deadline: string;
  executor: `0x${string}`;
};

/**
 * Previews and signs a Calibur batch with a root secp256k1 key, returning the
 * request ready for `relay()` without sending it.
 *
 * The signer is an argument, which is what lets card collection sign as the
 * payer while the collector stays connected as themselves. The connected path
 * above still chooses and validates its own signer; this never prefers
 * whichever key was most recently scanned. Both check the signer against the
 * batch's sender.
 *
 * Returning the signed request rather than relaying it lets a caller hold the
 * exact request, so an uncertain submission is resent as-is instead of signed
 * again.
 */
export async function signCaliburBatchWithAccount(
  input: SignCaliburBatchWithAccountInput,
  client: RelayerClient,
): Promise<RelayPayload> {
  const { account, executor, deadline } = input;
  if (account.address.toLowerCase() !== input.senderAddress.toLowerCase()) {
    throw new Error("Signing key does not match the sending wallet.");
  }
  const batchedCall = { calls: input.calls, revertOnFailure: true };

  const preview = await client.relayPreview({
    userAddress: account.address,
    batchedCall,
    keyHash: ZERO_HASH,
    executor,
    deadline,
  });
  const signedBatch = {
    batchedCall,
    nonce: preview.result.nonce,
    keyHash: ZERO_HASH,
    executor,
    deadline,
  };
  const rawSig = await account.sign({ hash: preview.result.digest });
  const signature = encodeAbiParameters([{ type: "bytes" }, { type: "bytes" }], [rawSig, "0x"]);
  const authorization = input.includeAuthorization
    ? await buildAuthorization(account, client)
    : undefined;

  return {
    userAddress: account.address,
    signedBatch,
    signature,
    signatureType: "secp256k1",
    authorization,
  };
}

async function buildAuthorization(account: PrivateKeyAccount, client: RelayerClient) {
  const {
    result: { nonce: eoaNonce },
  } = await client.getEOANonce(account.address);
  const authMsg = eip7702AuthMessage({
    chainId: CHAIN_ID_BIGINT,
    contractAddress: CALIBUR_ADDRESS,
    nonce: BigInt(eoaNonce),
  });
  const authSig = parseSignature(await account.sign({ hash: authMsg }));
  return {
    chainId: CHAIN_ID.toString(),
    contractAddress: CALIBUR_ADDRESS,
    nonce: String(eoaNonce),
    yParity: Number(authSig.yParity),
    r: authSig.r,
    s: authSig.s,
  };
}
