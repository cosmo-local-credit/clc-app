import type { MarketVoucherKind } from "@clc/api/features/market/client";
import { parseTableSearch, type TableSearch } from "#/lib/table-search";

const KINDS = new Set<MarketVoucherKind>(["goods", "services", "voucher"]);

export type VouchersSearch = TableSearch & {
  kind?: MarketVoucherKind;
};

export function parseVouchersSearch(search: Record<string, unknown>): VouchersSearch {
  const base = parseTableSearch(search);
  const kindRaw = typeof search.kind === "string" ? search.kind : undefined;
  const kind =
    kindRaw && KINDS.has(kindRaw as MarketVoucherKind) ? (kindRaw as MarketVoucherKind) : undefined;
  return kind ? { ...base, kind } : base;
}
