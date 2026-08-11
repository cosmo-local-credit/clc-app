/**
 * Shared queryOptions factories over the clc-core clients.
 *
 * Always pair queryKey + queryFn here rather than inlining either at a call
 * site, so every consumer of a given endpoint shares one cache entry and one
 * staleness policy. Platform-agnostic: no router, no DOM, no vendor SDK — the
 * factories are plain objects that any TanStack Query consumer can spread.
 */

import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import {
  getAccountTokens,
  getAccountTransfers,
  getLatestAccountTokens,
} from "./features/accounts/client";
import { trackOtx } from "./features/auth/client";
import { getMarketVoucher, getMarketVouchers } from "./features/market/client";
import { getVoucherOfferings } from "./features/offerings/client";
import { getPoolByAddress, getPoolVouchers, getPools } from "./features/pools/client";
import { getReport, getReports } from "./features/reports/client";

export const clcQueryKeys = {
  pools: {
    all: ["clc", "pools"] as const,
    list: (perPage: number) => ["clc", "pools", "list", perPage] as const,
    detail: (address: string) => ["clc", "pools", "detail", address] as const,
    vouchers: (address: string, perPage: number) =>
      ["clc", "pools", "vouchers", address, perPage] as const,
  },
  vouchers: {
    all: ["clc", "vouchers"] as const,
    list: (perPage: number) => ["clc", "vouchers", "list", perPage] as const,
    detail: (address: string) => ["clc", "vouchers", "detail", address] as const,
    offerings: (address: string, perPage: number) =>
      ["clc", "vouchers", "offerings", address, perPage] as const,
  },
  reports: {
    all: ["clc", "reports"] as const,
    list: (perPage: number) => ["clc", "reports", "list", perPage] as const,
    detail: (id: string) => ["clc", "reports", "detail", id] as const,
  },
  accounts: {
    all: ["clc", "accounts"] as const,
    latestTokens: (address: string) => ["clc", "accounts", "tokens", "latest", address] as const,
    tokens: (address: string, perPage: number) =>
      ["clc", "accounts", "tokens", address, perPage] as const,
    transfers: (address: string, perPage: number) =>
      ["clc", "accounts", "transfers", address, perPage] as const,
  },
  otx: {
    track: (trackingId: string) => ["clc", "otx", "track", trackingId] as const,
  },
} as const;

export const clcQueries = {
  poolList: (perPage: number) =>
    queryOptions({
      queryKey: clcQueryKeys.pools.list(perPage),
      queryFn: ({ signal }) => getPools({ perPage }, signal),
      placeholderData: keepPreviousData,
    }),

  pool: (address: string) =>
    queryOptions({
      queryKey: clcQueryKeys.pools.detail(address),
      queryFn: ({ signal }) => getPoolByAddress(address, signal),
      enabled: address !== "",
    }),

  poolVouchers: (address: string, perPage: number) =>
    queryOptions({
      queryKey: clcQueryKeys.pools.vouchers(address, perPage),
      queryFn: ({ signal }) => getPoolVouchers(address, { perPage }, signal),
      enabled: address !== "",
      placeholderData: keepPreviousData,
    }),

  voucherList: (perPage: number) =>
    queryOptions({
      queryKey: clcQueryKeys.vouchers.list(perPage),
      queryFn: ({ signal }) => getMarketVouchers({ perPage }, signal),
      placeholderData: keepPreviousData,
    }),

  voucher: (address: string) =>
    queryOptions({
      queryKey: clcQueryKeys.vouchers.detail(address),
      queryFn: ({ signal }) => getMarketVoucher(address, signal),
      enabled: address !== "",
    }),

  voucherOfferings: (address: string, perPage: number) =>
    queryOptions({
      queryKey: clcQueryKeys.vouchers.offerings(address, perPage),
      queryFn: ({ signal }) => getVoucherOfferings(address, { perPage }, signal),
      enabled: address !== "",
      placeholderData: keepPreviousData,
    }),

  reportList: (perPage: number) =>
    queryOptions({
      queryKey: clcQueryKeys.reports.list(perPage),
      queryFn: ({ signal }) => getReports({ perPage }, signal),
      placeholderData: keepPreviousData,
    }),

  report: (id: string) =>
    queryOptions({
      queryKey: clcQueryKeys.reports.detail(id),
      queryFn: ({ signal }) => getReport(id, signal),
      enabled: id !== "",
    }),

  latestAccountTokens: (address: string) =>
    queryOptions({
      queryKey: clcQueryKeys.accounts.latestTokens(address),
      queryFn: () => getLatestAccountTokens(address),
      enabled: address !== "",
    }),

  accountTokens: (address: string, perPage: number) =>
    queryOptions({
      queryKey: clcQueryKeys.accounts.tokens(address, perPage),
      queryFn: () => getAccountTokens({ address, perPage }),
      enabled: address !== "",
      placeholderData: keepPreviousData,
    }),

  accountTransfers: (address: string, perPage: number) =>
    queryOptions({
      queryKey: clcQueryKeys.accounts.transfers(address, perPage),
      queryFn: () => getAccountTransfers({ address, perPage }),
      enabled: address !== "",
      placeholderData: keepPreviousData,
    }),

  /**
   * OTX tracking. Callers own the poll interval — a deploy receipt wants a
   * couple of seconds, an audit table wants none — so it is deliberately absent
   * here rather than baked in at one value.
   */
  otxTrack: (trackingId: string) =>
    queryOptions({
      queryKey: clcQueryKeys.otx.track(trackingId),
      queryFn: () => trackOtx(trackingId),
      enabled: trackingId !== "",
    }),
};
