import {
  computeSafeTxHash,
  encodeSafeContractSignature,
  safeReadAbi,
  safeSupportsContractSignatures,
  safeTypedData,
  type SafeTransaction,
} from "@clc/core/features/safe/logic";
import {
  caliburDomainAbi,
  caliburNestedPersonalSignDigest,
  encodeCaliburErc1271Signature,
} from "@clc/core/features/webauthn/index";
import { queryOptions } from "@tanstack/react-query";
import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  type Client,
} from "viem";
import { readContract } from "viem/actions";
import { CALIBUR_WEBAUTHN_CONNECTOR_ID } from "#/connectors/calibur-webauthn";
import { signDigestWithPasskey } from "#/features/webauthn/api/sign-digest";
import { CHAIN_ID } from "#/lib/chain";
import { getWebAuthnCredential } from "#/lib/webauthn-storage";

export type SignTypedData = (
  typed: Omit<ReturnType<typeof safeTypedData>, never>,
) => Promise<`0x${string}`>;

/** A passkey cannot sign for this Safe: it predates Safe 1.5.0. */
export class SafePasskeyUnsupportedError extends Error {
  constructor(public safe: `0x${string}`) {
    super("Passkeys can sign for multisigs on Safe 1.5 or later.");
  }
}

/** The passkey prompt was dismissed; nothing was signed. */
export function isPasskeyCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

/**
 * A Safe's `VERSION()`, or undefined for a Safe-compatible contract without
 * one. Transport failures are thrown, not read as "no version".
 */
export async function readSafeVersion(
  chain: Client,
  safe: `0x${string}`,
): Promise<string | undefined> {
  try {
    return await readContract(chain, { address: safe, abi: safeReadAbi, functionName: "VERSION" });
  } catch (error) {
    if (
      error instanceof BaseError &&
      error.walk(
        (cause) =>
          cause instanceof ContractFunctionRevertedError ||
          cause instanceof ContractFunctionZeroDataError,
      )
    )
      return undefined;
    throw error;
  }
}

/** A Safe's version, which changes only through an upgrade its owners approve. */
export function safeVersionQueryOptions(
  chain: Client | undefined,
  safe: `0x${string}`,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: ["chain", CHAIN_ID, "safe-version", safe.toLowerCase()] as const,
    queryFn: async () => (await readSafeVersion(chain!, safe)) ?? null,
    enabled: enabled && Boolean(chain),
    staleTime: 5 * 60_000,
  });
}

/**
 * Signs a Safe transaction as the connected account.
 *
 * A paper wallet or external wallet signs the EIP-712 `SafeTx` through `sign`
 * (wagmi's `useSignTypedData`): a 65-byte ECDSA signature, `v` 27 or 28.
 *
 * A passkey account is a Calibur contract, so it signs as one (EIP-1271, `v`
 * 0): the passkey signs the ERC-7739 nested PersonalSign of the `safeTxHash`
 * in the account's own domain. Only Safe 1.5.0 and later verify that form, so
 * an older Safe is refused before any prompt.
 */
export async function signSafeTransaction(input: {
  connectorId: string | undefined;
  safeAddress: `0x${string}`;
  tx: SafeTransaction;
  sign: SignTypedData;
  owner: `0x${string}`;
  /** Read only for a passkey, which needs the Safe's version and its own domain. */
  chain: Client | undefined;
}): Promise<`0x${string}`> {
  if (input.connectorId !== CALIBUR_WEBAUTHN_CONNECTOR_ID) {
    return input.sign(safeTypedData(CHAIN_ID, input.safeAddress, input.tx));
  }
  const chain = input.chain;
  if (!chain || chain.chain?.id !== CHAIN_ID)
    throw new Error("The configured chain is unavailable.");
  if (!safeSupportsContractSignatures(await readSafeVersion(chain, input.safeAddress))) {
    throw new SafePasskeyUnsupportedError(input.safeAddress);
  }
  const credential = getWebAuthnCredential();
  if (!credential) throw new Error("No passkey is stored for this wallet.");
  if (credential.stale) throw new Error("Credential is stale; re-authenticate");
  if (credential.address.toLowerCase() !== input.owner.toLowerCase()) {
    throw new Error("Stored passkey does not match the connected wallet.");
  }
  const domainSeparator = await readContract(chain, {
    address: input.owner,
    abi: caliburDomainAbi,
    functionName: "domainSeparator",
  });
  const digest = caliburNestedPersonalSignDigest(
    domainSeparator,
    computeSafeTxHash(CHAIN_ID, input.safeAddress, input.tx),
  );
  const auth = await signDigestWithPasskey(digest, credential.credentialId);
  return encodeSafeContractSignature(
    input.owner,
    encodeCaliburErc1271Signature(credential.keyHash, auth),
  );
}
