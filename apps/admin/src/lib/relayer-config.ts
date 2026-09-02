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

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5003";

const RELAYER_URL: string =
  (import.meta.env.VITE_RELAYER_URL as string | undefined) ?? `${API_URL}/api/v2/relayer`;

export const relayerClient = createRelayerClient(RELAYER_URL);

/**
 * The Calibur implementation an operator's EOA delegates to under EIP-7702.
 *
 * Same default as apps/web: the two must agree or an authorization signed here
 * would delegate to a contract clc-core does not recognise, and the relayer
 * would reject the batch as undelegated.
 */
export const CALIBUR_ADDRESS = (import.meta.env.VITE_CALIBUR_ADDRESS ??
  "0x1289fE793392fb1a905f78Ea23f632EDD3d15b85") as `0x${string}`;
