export const PAPER_WALLET_SOURCES = ["blank", "csv"] as const;

export type PaperWalletSource = (typeof PAPER_WALLET_SOURCES)[number];

export type PaperWalletsSearch = { source: PaperWalletSource };

export function parsePaperWalletsSearch(search: Record<string, unknown>): PaperWalletsSearch {
  const source = PAPER_WALLET_SOURCES.find((candidate) => candidate === search.source);
  return { source: source ?? "blank" };
}
