/**
 * Canonical query identity for the admin endpoints.
 *
 * The users key carries every parameter the backend filters or pages on, because
 * each one changes which rows come back. A sort column is deliberately absent:
 * the endpoint accepts none, so ordering is applied to the fetched page and
 * re-sorting must not refetch.
 */

import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import type {
  AdminClient,
  AdminDeploymentParams,
  AdminPoolParams,
  AdminOTXParams,
  AdminPoolTransactionParams,
  AdminReviewParams,
  AdminStatsParams,
  AdminUser,
  AdminUserParams,
  AdminVoucherParams,
  AdminVoucherTransactionParams,
} from "./client";
import { type PoolListParams, poolKeys } from "../pools/queries";

export const adminKeys = {
  all: ["clc", "admin"] as const,
  /**
   * Pages and single accounts get their own segment under `users` so a cache
   * sweep can select one shape without inspecting what it found: an optimistic
   * write after an approval has to map over pages of rows and over one row, and
   * those are different updaters.
   */
  users: (params: AdminUserParams) => ["clc", "admin", "users", "page", params] as const,

  /**
   * A single account, keyed by lowercased address so one account has one entry
   * whatever casing the link carried.
   */
  user: (address: string) => ["clc", "admin", "users", "detail", address.toLowerCase()] as const,

  /** The figures behind one account. */
  accountStats: (address: string) =>
    ["clc", "admin", "users", "stats", address.toLowerCase()] as const,

  stats: (params: AdminStatsParams) => ["clc", "admin", "dashboard", "stats", params] as const,

  /**
   * One segment per transaction resource. They page the same way but read
   * different tables, so a cache sweep over one must not touch the others.
   */
  voucherTransactions: (params: AdminVoucherTransactionParams) =>
    ["clc", "admin", "transactions", "vouchers", params] as const,
  poolTransactions: (params: AdminPoolTransactionParams) =>
    ["clc", "admin", "transactions", "pools", params] as const,
  otx: (params: AdminOTXParams) => ["clc", "admin", "transactions", "otx", params] as const,

  /**
   * The console's catalog reads, kept under `admin` rather than beside the
   * public `voucherKeys`. They answer for rows the public routes hide, so a
   * sweep of the market cache must not reach them and a retired voucher must
   * never be seeded into an entry a public read can serve.
   */
  vouchers: (params: AdminVoucherParams) => ["clc", "admin", "vouchers", "page", params] as const,
  voucher: (address: string) =>
    ["clc", "admin", "vouchers", "detail", address.toLowerCase()] as const,
  pools: (params: AdminPoolParams) => ["clc", "admin", "pools", "page", params] as const,
  pool: (address: string) => ["clc", "admin", "pools", "detail", address.toLowerCase()] as const,
  reviews: (params: AdminReviewParams) => ["clc", "admin", "reviews", params] as const,
  deployments: (params: AdminDeploymentParams) => ["clc", "admin", "deployments", params] as const,
} as const;

export function adminPoolsQueryOptions(admin: AdminClient, params: AdminPoolParams) {
  return queryOptions({
    queryKey: adminKeys.pools(params),
    queryFn: ({ signal }) => admin.listPools(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function adminPoolQueryOptions(admin: AdminClient, address: string | undefined) {
  return queryOptions({
    queryKey: adminKeys.pool(address ?? ""),
    queryFn: ({ signal }) => admin.getPoolByAddress(requireAddress(address), signal),
    enabled: Boolean(address),
  });
}

export function adminVouchersQueryOptions(admin: AdminClient, params: AdminVoucherParams) {
  return queryOptions({
    queryKey: adminKeys.vouchers(params),
    queryFn: ({ signal }) => admin.listVouchers(params, signal),
    placeholderData: keepPreviousData,
  });
}

/** One voucher whatever its visibility, so a retired one still has a screen. */
export function adminVoucherQueryOptions(admin: AdminClient, address: string | undefined) {
  return queryOptions({
    queryKey: adminKeys.voucher(address ?? ""),
    queryFn: ({ signal }) => admin.getVoucher(address as string, signal),
    enabled: Boolean(address),
  });
}

export function adminUsersQueryOptions(admin: AdminClient, params: AdminUserParams) {
  return queryOptions({
    queryKey: adminKeys.users(params),
    queryFn: ({ signal }) => admin.listUsers(params, signal),
    // Keeps the previous page visible while the next one loads, so paging and
    // refining a search do not blink through an empty table.
    placeholderData: keepPreviousData,
  });
}

/**
 * One account, found through the directory search.
 *
 * clc-core exposes no "get one admin user" endpoint, so the address is sent as
 * the search term — it is one of the four columns `q` matches. A short page is
 * requested rather than a single row because the term is matched as a substring
 * across name, email and phone as well, so another account could in principle
 * come back first; the exact address decides which row is the answer.
 *
 * An address with no row is a real result, not an error: the pools and vouchers
 * surfaces link to addresses that hold tokens without necessarily having a CLC
 * account, so this resolves to null and the caller says so.
 */
export function adminUserQueryOptions(admin: AdminClient, address: string | undefined) {
  return queryOptions({
    queryKey: adminKeys.user(address ?? "none"),
    queryFn: async ({ signal }): Promise<AdminUser | null> => {
      if (!address) throw new Error("An account address is required.");
      const page = await admin.listUsers({ perPage: 10, q: address }, signal);
      const match = page.users.find(
        (user) => user.ethereumAddress.toLowerCase() === address.toLowerCase(),
      );
      return match ?? null;
    },
    enabled: Boolean(address),
  });
}

export function adminAccountStatsQueryOptions(admin: AdminClient, address: string | undefined) {
  return queryOptions({
    queryKey: adminKeys.accountStats(address ?? "none"),
    queryFn: ({ signal }) => admin.getAccountStats(address ?? "", signal),
    enabled: Boolean(address),
  });
}

export function accountPoolsQueryOptions(
  admin: AdminClient,
  address: string | undefined,
  params: PoolListParams,
) {
  return queryOptions({
    queryKey: poolKeys.account(address ?? "none", params),
    queryFn: ({ signal }) => admin.getAccountPools(requireAddress(address), params, signal),
    enabled: Boolean(address),
    placeholderData: keepPreviousData,
  });
}

export function adminStatsQueryOptions(admin: AdminClient, params: AdminStatsParams) {
  return queryOptions({
    queryKey: adminKeys.stats(params),
    queryFn: ({ signal }) => admin.getStats(params, signal),
  });
}

/**
 * The three transaction pages.
 *
 * Each keeps the previous page on screen while the next one loads, as the
 * account directory does: paging or narrowing a filter must not blink through an
 * empty table, which on a dense ops surface reads as "nothing matched".
 */
export function adminVoucherTransactionsQueryOptions(
  admin: AdminClient,
  params: AdminVoucherTransactionParams,
) {
  return queryOptions({
    queryKey: adminKeys.voucherTransactions(params),
    queryFn: ({ signal }) => admin.listVoucherTransactions(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function adminPoolTransactionsQueryOptions(
  admin: AdminClient,
  params: AdminPoolTransactionParams,
) {
  return queryOptions({
    queryKey: adminKeys.poolTransactions(params),
    queryFn: ({ signal }) => admin.listPoolTransactions(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function adminOTXQueryOptions(admin: AdminClient, params: AdminOTXParams) {
  return queryOptions({
    queryKey: adminKeys.otx(params),
    queryFn: ({ signal }) => admin.listOTX(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function adminReviewsQueryOptions(admin: AdminClient, params: AdminReviewParams) {
  return queryOptions({
    queryKey: adminKeys.reviews(params),
    queryFn: ({ signal }) => admin.listReviewNotifications(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function adminDeploymentsQueryOptions(admin: AdminClient, params: AdminDeploymentParams) {
  return queryOptions({
    queryKey: adminKeys.deployments(params),
    queryFn: ({ signal }) => admin.listDeployments(params, signal),
    placeholderData: keepPreviousData,
  });
}

function requireAddress(address: string | undefined): string {
  if (!address) throw new Error("An account address is required.");
  return address;
}
