/**
 * The chain this console is pointed at.
 *
 * Resolved once, here, because `import.meta.env` may only be read in an app and
 * because three modules used to read `VITE_CHAIN_ID` separately — the SIWE
 * request, the relayer batch domain and the explorer links — each defaulting to
 * Celo mainnet on its own.
 *
 * An id the shared chain table carries nothing for throws at boot. The console
 * would otherwise link an operator to an explorer that answers "no such
 * transaction", which reads as data loss rather than as a misconfiguration.
 */
import { chainMetadata } from "@clc/core/lib/constants/chains";

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? "42220");

const metadata = chainMetadata(CHAIN_ID);

if (!metadata) {
  throw new Error(`VITE_CHAIN_ID=${CHAIN_ID} is not a chain this console knows how to describe.`);
}

export const CHAIN_INFO = metadata;

/** The same id, for the EIP-712 domain of a relayed operator batch. */
export const CHAIN_ID_BIGINT = BigInt(CHAIN_ID);
