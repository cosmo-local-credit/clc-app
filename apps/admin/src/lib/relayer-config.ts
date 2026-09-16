/**
 * Relayer configuration for this app.
 *
 * The console needs the relayer for the WebAuthn challenge that precedes an
 * operator passkey assertion, for the signer address used to read native gas,
 * and to relay the batches an operator signs.
 *
 * Kept app-local because it reads import.meta.env, which no package may do.
 */

import { createRelayerClient } from "@clc/api/features/relayer/client";
import { CHAIN_ID, CHAIN_INFO } from "#/lib/chain";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5003";

const RELAYER_URL: string =
  (import.meta.env.VITE_RELAYER_URL as string | undefined) ?? `${API_URL}/api/v2/relayer`;

export const relayerClient = createRelayerClient(RELAYER_URL);

/**
 * The Calibur implementation an operator's EOA delegates to under EIP-7702.
 *
 * Defaults to the one deployed on the configured chain, so this console and
 * apps/web cannot drift: an authorization signed against a contract clc-core
 * does not recognise is rejected as undelegated. VITE_CALIBUR_ADDRESS overrides
 * it for a deployment whose clc-core points at a different one.
 *
 * The console used to carry apps/web's Celo address as a literal default while
 * its Wrangler config declared no such variable, so every relayed operator
 * batch on another chain delegated to a contract that is not there.
 */
const caliburAddress = (import.meta.env.VITE_CALIBUR_ADDRESS ?? CHAIN_INFO.caliburAddress) as
  | `0x${string}`
  | undefined;

if (!caliburAddress) {
  throw new Error(
    `No Calibur implementation is known for chain ${CHAIN_ID}. Set VITE_CALIBUR_ADDRESS.`,
  );
}

export const CALIBUR_ADDRESS = caliburAddress;
