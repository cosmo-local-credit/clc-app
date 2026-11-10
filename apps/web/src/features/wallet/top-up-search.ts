import type { PretiumCashTransaction } from "@clc/api/features/pretium/client";

type TopUpSheet = "add" | "withdraw";

/** A Pretium history row's `?tx=` value, the same in both views. */
export function topUpHistoryKey(transaction: PretiumCashTransaction): string {
  return `${transaction.kind}-${transaction.reference}`;
}

export type TopUpSearch = {
  /** The open ramp form: a phone sheet, or the desktop inspector. */
  sheet?: TopUpSheet;
  /** A Pretium history row by kind-reference: a phone sheet, or the desktop inspector. */
  tx?: string;
};

/** `/wallet/top-up`'s search, read by both views. */
export function validateTopUpSearch(search: Record<string, unknown>): TopUpSearch {
  return {
    sheet: search.sheet === "add" || search.sheet === "withdraw" ? search.sheet : undefined,
    tx: typeof search.tx === "string" && search.tx.length > 0 ? search.tx : undefined,
  };
}
