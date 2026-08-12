/**
 * Relayer configuration for this app.
 *
 * The console needs exactly one relayer endpoint — the WebAuthn challenge that
 * precedes an operator passkey assertion. It has no wallet, signs no
 * transactions, and needs no Calibur address.
 *
 * Kept app-local because it reads import.meta.env, which no package may do.
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5003";

export const RELAYER_URL: string =
  (import.meta.env.VITE_RELAYER_URL as string | undefined) ?? `${API_URL}/api/v2/relayer`;
