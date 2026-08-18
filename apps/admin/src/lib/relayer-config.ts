/**
 * Relayer configuration for this app.
 *
 * The console needs the relayer for the WebAuthn challenge that precedes an
 * operator passkey assertion, and for the signer address used to read native
 * gas. It has no wallet and signs no transactions.
 *
 * Kept app-local because it reads import.meta.env, which no package may do.
 */

import { createRelayerClient } from "@clc/api/features/relayer/client";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5003";

const RELAYER_URL: string =
  (import.meta.env.VITE_RELAYER_URL as string | undefined) ?? `${API_URL}/api/v2/relayer`;

export const relayerClient = createRelayerClient(RELAYER_URL);
