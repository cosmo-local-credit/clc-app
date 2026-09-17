/**
 * Relayer and Calibur configuration for this app.
 *
 * The relayer *client* is shared (@clc/api/features/relayer/client) because the
 * admin console needs its WebAuthn challenge endpoint to sign an operator in.
 * The configuration stays app-local: it reads import.meta.env, which no package
 * may do.
 */
import { CHAIN_ID, CHAIN_INFO } from "#/lib/chain";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5003";

export const RELAYER_URL: string =
  (import.meta.env.VITE_RELAYER_URL as string | undefined) ?? `${API_URL}/api/v2/relayer`;

/**
 * Defaults to the Calibur deployed on the configured chain. VITE_CALIBUR_ADDRESS
 * overrides it, for a deployment whose clc-core points at a different one.
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
