import { safeTypedData, type SafeTransaction } from "@clc/core/features/safe/logic";
import { CALIBUR_WEBAUTHN_CONNECTOR_ID } from "#/connectors/calibur-webauthn";
import { CHAIN_ID } from "#/lib/chain";

export type SignTypedData = (
  typed: Omit<ReturnType<typeof safeTypedData>, never>,
) => Promise<`0x${string}`>;

/**
 * Signs a Safe transaction's EIP-712 `SafeTx` as the connected account.
 *
 * `sign` is the connector's typed-data signer (wagmi's `useSignTypedData`), so
 * a paper wallet and an external wallet both produce the 65-byte ECDSA
 * signature (`v` of 27 or 28) the Safe verifies. A passkey signs P-256, which a
 * Safe only accepts through its WebAuthn signer contract; that is not supported
 * yet, so it is refused up front rather than after a prompt.
 */
export async function signSafeTransaction(input: {
  connectorId: string | undefined;
  safeAddress: `0x${string}`;
  tx: SafeTransaction;
  sign: SignTypedData;
}): Promise<`0x${string}`> {
  if (input.connectorId === CALIBUR_WEBAUTHN_CONNECTOR_ID) {
    throw new Error("Passkey wallets can't sign Safe transactions yet. Use a paper wallet.");
  }
  return input.sign(safeTypedData(CHAIN_ID, input.safeAddress, input.tx));
}
