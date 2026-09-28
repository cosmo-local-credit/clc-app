export const PAPER_WALLET_ORIGIN: string =
  (import.meta.env.VITE_PAPER_WALLET_ORIGIN as string | undefined) ?? "https://cosmolocal.credit";

export function buildPaperWalletUrl(payload: string): string {
  return `${PAPER_WALLET_ORIGIN}/?w=${encodeURIComponent(payload)}`;
}
