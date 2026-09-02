/**
 * The chain this build settles on.
 *
 * Resolved once, here, because `import.meta.env` may only be read in an app and
 * because five modules used to read `VITE_CHAIN_ID` separately — each with its
 * own `?? "42220"` — while the wagmi config ignored the variable altogether and
 * hardcoded Celo. Setting the variable therefore moved the SIWE and relayer
 * chain ids off Celo while every transaction was still signed against it.
 */
import { chainMetadata } from "@clc/core/lib/constants/chains";
import type { Chain } from "viem";
import { celo, celoAlfajores, gnosis } from "wagmi/chains";

const SUPPORTED_CHAINS: readonly Chain[] = [celo, celoAlfajores, gnosis];

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? "42220");

const configured = SUPPORTED_CHAINS.find((chain) => chain.id === CHAIN_ID);
const metadata = chainMetadata(CHAIN_ID);

// Loud at boot rather than silent: without a chain definition there is no
// currency, no default RPC and no explorer, so every signature this app
// produces would be against a chain it cannot describe.
if (!configured || !metadata) {
  throw new Error(
    `VITE_CHAIN_ID=${CHAIN_ID} is not a supported chain. Supported: ${SUPPORTED_CHAINS.map((chain) => chain.id).join(", ")}.`,
  );
}

export const CHAIN = configured;

/** What to call this chain and its explorer on screen. */
export const CHAIN_INFO = metadata;

/** The same id, for the EIP-712 domains and relayer payloads that take a bigint. */
export const CHAIN_ID_BIGINT = BigInt(CHAIN_ID);

/**
 * Overrides the chain's own default RPC. Left undefined, viem falls back to the
 * definition in `wagmi/chains`, so a deploy only sets this to move off the
 * public endpoint.
 */
export const PUBLIC_RPC_URL = import.meta.env.VITE_PUBLIC_RPC_URL as string | undefined;
