export const PAPER_WALLET_SOURCES = ["blank", "csv"] as const;

export type PaperWalletSource = (typeof PAPER_WALLET_SOURCES)[number];

/** How the batch reaches holders: an A4 sheet of QR cards, or NFC cards written on a phone. */
const PAPER_WALLET_CARRIERS = ["print", "nfc"] as const;

export type PaperWalletCarrier = (typeof PAPER_WALLET_CARRIERS)[number];

export type PaperWalletsSearch = { source: PaperWalletSource; carrier: PaperWalletCarrier };

/** Unknown values normalise to the defaults rather than throwing, like every admin tab. */
export function parsePaperWalletsSearch(search: Record<string, unknown>): PaperWalletsSearch {
  const source = PAPER_WALLET_SOURCES.find((candidate) => candidate === search.source);
  const carrier = PAPER_WALLET_CARRIERS.find((candidate) => candidate === search.carrier);
  return { source: source ?? "blank", carrier: carrier ?? "print" };
}
