/**
 * Typed search params for the three transaction pages.
 *
 * One parser each rather than one shared parser with a union of filters: the
 * pages read different resources, and a `type` valid on one is meaningless on
 * another. Keeping them apart means a stale link from the pool page cannot put
 * `type=swap` into a voucher request the backend would reject.
 *
 * Every parser normalizes rather than throws, as `parseTableSearch` does, so a
 * hand-edited URL degrades to the unfiltered view instead of an error screen.
 */

import {
  ADMIN_DISPATCH_STATUSES,
  ADMIN_OTX_TYPES,
  ADMIN_POOL_TX_TYPES,
  ADMIN_VOUCHER_TX_TYPES,
  type AdminDispatchStatus,
  type AdminOTXType,
  type AdminPoolTxType,
  type AdminVoucherTxType,
} from "@clc/api/features/admin/client";
import { parseTableSearch, type TableSearch } from "#/lib/table-search";

/** clc-core filters on a whole address; nothing partial matches. */
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export type VoucherTransactionsSearch = TableSearch & {
  type?: AdminVoucherTxType;
  voucher?: string;
};

export type PoolTransactionsSearch = TableSearch & {
  type?: AdminPoolTxType;
  pool?: string;
};

export type OTXSearch = TableSearch & {
  type?: AdminOTXType;
  status?: AdminDispatchStatus;
};

function parseAddress(value: unknown): string | undefined {
  const address = typeof value === "string" ? value.trim() : "";
  return ADDRESS_PATTERN.test(address) ? address : undefined;
}

function parseMember<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

export function parseVoucherTransactionsSearch(
  search: Record<string, unknown>,
): VoucherTransactionsSearch {
  const type = parseMember(search.type, ADMIN_VOUCHER_TX_TYPES);
  const voucher = parseAddress(search.voucher);
  return {
    ...parseTableSearch(search),
    ...(type ? { type } : {}),
    ...(voucher ? { voucher } : {}),
  };
}

export function parsePoolTransactionsSearch(
  search: Record<string, unknown>,
): PoolTransactionsSearch {
  const type = parseMember(search.type, ADMIN_POOL_TX_TYPES);
  const pool = parseAddress(search.pool);
  return {
    ...parseTableSearch(search),
    ...(type ? { type } : {}),
    ...(pool ? { pool } : {}),
  };
}

export function parseOTXSearch(search: Record<string, unknown>): OTXSearch {
  const type = parseMember(search.type, ADMIN_OTX_TYPES);
  const status = parseMember(search.status, ADMIN_DISPATCH_STATUSES);
  return {
    ...parseTableSearch(search),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
  };
}
