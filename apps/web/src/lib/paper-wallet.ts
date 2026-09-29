import { buildPaperWalletUrl as buildUrl } from "@clc/core/features/wallet/paper-wallet";

export const PAPER_WALLET_ORIGIN: string =
  (import.meta.env.VITE_PAPER_WALLET_ORIGIN as string | undefined) ?? "https://cosmolocal.credit";

export function buildPaperWalletUrl(payload: string): string {
  return buildUrl(PAPER_WALLET_ORIGIN, payload);
}
