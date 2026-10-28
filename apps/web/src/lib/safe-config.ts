import { CHAIN_INFO } from "#/lib/chain";

/** Enable only after clc-core's Safe signer cache and relay policy are deployed. */
export const SAFE_OWNERSHIP_ENABLED = import.meta.env.VITE_SAFE_OWNERSHIP_ENABLED === "true";

export const SAFE_APP_PREFIX: string | undefined = CHAIN_INFO.safe?.appPrefix;

/** The pinned MultiSendCallOnly deployments; empty where Safe is not supported. */
export const SAFE_MULTISEND_CALL_ONLY: readonly `0x${string}`[] =
  CHAIN_INFO.safe?.multiSendCallOnly ?? [];
