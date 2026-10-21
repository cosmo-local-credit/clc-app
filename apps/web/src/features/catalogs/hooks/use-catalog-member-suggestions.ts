import type { AccountToken } from "@clc/api/features/accounts/client";
import {
  accountTokensInfiniteQueryOptions,
  latestAccountTokensQueryOptions,
} from "@clc/api/features/accounts/queries";
import type { UserPool } from "@clc/api/features/pools/client";
import { CATALOG_MAX_VOUCHERS, type VoucherRef } from "@clc/core/features/catalog/logic";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { fetchFilteredPoolCatalog } from "#/features/pools/hooks/use-filtered-pools";
import { useOwnedPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import { useAllAccountIssuedTokens } from "#/features/wallet/hooks/use-account-balances";
import { accountsClient } from "#/lib/api/accounts";
import { CHAIN_ID } from "#/lib/chain";
import {
  type CatalogMemberCandidate,
  toCatalogMemberCandidate,
} from "../logic/catalog-member-candidates";

const ACCOUNT_PAGE_SIZE = 100;

export type CatalogSuggestionSource = {
  rows: CatalogMemberCandidate[];
  status: "idle" | "loading" | "ready" | "error";
  completeness: "complete" | "partial";
  retry: () => void;
  retrying: boolean;
};

type AccountTokenSource = Omit<CatalogSuggestionSource, "rows"> & { rows: AccountToken[] };

/** Active wallet holdings first, then the user's other active vouchers. */
export function useCatalogVoucherSuggestions(): {
  holdings: CatalogSuggestionSource;
  owned: CatalogSuggestionSource;
} {
  const auth = useAuthStatus();
  const owner = auth.isAuthenticated ? auth.session?.address : undefined;
  const holdings = useWalletTokenSource(owner);
  const ownedQuery = useAllAccountIssuedTokens(owner);

  const owned: CatalogSuggestionSource = {
    rows:
      ownedQuery.isError || ownedQuery.isPending
        ? []
        : ownedQuery.tokens.flatMap(activeVoucherCandidate),
    status: !owner
      ? "idle"
      : ownedQuery.isError
        ? "error"
        : ownedQuery.isPending
          ? "loading"
          : "ready",
    completeness: "complete",
    retry: () => void ownedQuery.refetch(),
    retrying: ownedQuery.isFetching,
  };

  return {
    holdings: {
      ...holdings,
      rows: holdings.rows.flatMap(activePositiveVoucherCandidate),
    },
    owned,
  };
}

/** Owned pools first, then pools accepting any active voucher the user holds. */
export function useCatalogPoolSuggestions(): {
  owned: CatalogSuggestionSource;
  accepting: CatalogSuggestionSource;
} {
  const auth = useAuthStatus();
  const owner = auth.isAuthenticated ? auth.session?.address : undefined;
  const ownedQuery = useOwnedPoolsInfinite(owner);
  const { fetchNextPage, hasNextPage, isError, isFetchingNextPage } = ownedQuery;

  useEffect(() => {
    if (isError || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isError, isFetchingNextPage]);

  const ownedLoading = ownedQuery.isPending || hasNextPage || isFetchingNextPage;
  const owned: CatalogSuggestionSource = {
    rows:
      ownedQuery.isError || ownedLoading
        ? []
        : (ownedQuery.data?.pages.flatMap((page) => page.pools) ?? []).flatMap(poolCandidate),
    status: !owner ? "idle" : ownedQuery.isError ? "error" : ownedLoading ? "loading" : "ready",
    completeness: "complete",
    retry: () => void ownedQuery.refetch(),
    retrying: ownedQuery.isFetching,
  };

  const holdings = useWalletTokenSource(owner);
  const voucherRefs = useMemo(
    () =>
      holdings.rows
        .flatMap(activePositiveVoucherCandidate)
        .map(({ chainId, address }): VoucherRef => ({ chainId, address }))
        .sort((left, right) =>
          left.address.toLowerCase().localeCompare(right.address.toLowerCase()),
        ),
    [holdings.rows],
  );
  const acceptingQuery = useQuery({
    queryKey: [
      "clc",
      "catalogs",
      "member-suggestions",
      "pools-accepting-wallet-vouchers",
      voucherRefs.map((voucher) => `${voucher.chainId}:${voucher.address.toLowerCase()}`),
    ],
    queryFn: ({ signal }) => fetchPoolsAcceptingVouchers(voucherRefs, signal),
    enabled: holdings.status === "ready" && voucherRefs.length > 0,
    staleTime: 5 * 60_000,
  });

  const acceptingStatus: CatalogSuggestionSource["status"] =
    holdings.status === "idle"
      ? "idle"
      : holdings.status === "error"
        ? "error"
        : holdings.status === "loading"
          ? "loading"
          : voucherRefs.length === 0
            ? "ready"
            : acceptingQuery.isError
              ? "error"
              : acceptingQuery.isPending
                ? "loading"
                : "ready";

  return {
    owned,
    accepting: {
      rows: acceptingStatus === "ready" ? (acceptingQuery.data ?? []).flatMap(poolCandidate) : [],
      status: acceptingStatus,
      completeness: holdings.completeness,
      retry: () => {
        if (holdings.status === "error" || holdings.completeness === "partial") holdings.retry();
        if (voucherRefs.length > 0) void acceptingQuery.refetch();
      },
      retrying: holdings.retrying || acceptingQuery.isFetching,
    },
  };
}

function useWalletTokenSource(owner: string | undefined): AccountTokenSource {
  const complete = useInfiniteQuery(
    accountTokensInfiniteQueryOptions(accountsClient, owner, ACCOUNT_PAGE_SIZE),
  );
  const { fetchNextPage, hasNextPage, isError, isFetchingNextPage } = complete;

  useEffect(() => {
    if (isError || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isError, isFetchingNextPage]);

  const recent = useQuery({
    ...latestAccountTokensQueryOptions(accountsClient, owner),
    enabled: Boolean(owner) && complete.isError,
  });

  if (!owner) {
    return {
      rows: [],
      status: "idle",
      completeness: "complete",
      retry: () => undefined,
      retrying: false,
    };
  }

  const completeTokens = complete.data?.pages.flatMap((page) => page.tokens) ?? [];
  if (!complete.isError) {
    const draining = complete.isPending || hasNextPage || isFetchingNextPage;
    return {
      rows: draining ? [] : completeTokens,
      status: draining ? "loading" : "ready",
      completeness: "complete",
      retry: () => void complete.refetch(),
      retrying: complete.isFetching,
    };
  }

  const fallbackTokens = dedupeTokens([...completeTokens, ...(recent.data?.tokens ?? [])]);
  const fallbackReady = completeTokens.length > 0 || recent.isSuccess;
  return {
    rows: fallbackReady ? fallbackTokens : [],
    status: fallbackReady ? "ready" : recent.isPending ? "loading" : "error",
    completeness: "partial",
    retry: () => {
      void complete.refetch();
      if (recent.isError) void recent.refetch();
    },
    retrying: complete.isFetching || recent.isFetching,
  };
}

function activePositiveVoucherCandidate(token: AccountToken): CatalogMemberCandidate[] {
  if (token.catalogActive !== true || !positiveBalance(token.balance)) return [];
  return activeVoucherCandidate(token);
}

function activeVoucherCandidate(token: AccountToken): CatalogMemberCandidate[] {
  if (token.catalogActive !== true) return [];
  const candidate = toCatalogMemberCandidate({
    id: token.id,
    chainId: CHAIN_ID,
    address: token.tokenAddress,
    name: token.tokenName,
    symbol: token.tokenSymbol,
    imageUrl: token.iconUrl,
  });
  return candidate ? [candidate] : [];
}

function poolCandidate(pool: UserPool): CatalogMemberCandidate[] {
  const candidate = toCatalogMemberCandidate({
    id: pool.id,
    chainId: pool.chainId,
    address: pool.address,
    name: pool.name,
    symbol: pool.symbol,
    imageUrl: pool.imageUrl,
  });
  return candidate ? [candidate] : [];
}

async function fetchPoolsAcceptingVouchers(
  vouchers: readonly VoucherRef[],
  signal: AbortSignal,
): Promise<UserPool[]> {
  const byAddress = new Map<string, UserPool>();
  for (let index = 0; index < vouchers.length; index += CATALOG_MAX_VOUCHERS) {
    const catalog = await fetchFilteredPoolCatalog({
      filter: {
        term: "",
        tags: [],
        tagMatch: "any",
        vouchers: vouchers.slice(index, index + CATALOG_MAX_VOUCHERS),
        voucherMatch: "any",
      },
      signal,
      nearby: false,
    });
    for (const pool of catalog.pools) byAddress.set(pool.address.toLowerCase(), pool);
  }
  return [...byAddress.values()];
}

function positiveBalance(value: string): boolean {
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

function dedupeTokens(tokens: readonly AccountToken[]): AccountToken[] {
  const seen = new Set<string>();
  return tokens.filter((token) => {
    const address = token.tokenAddress.toLowerCase();
    if (seen.has(address)) return false;
    seen.add(address);
    return true;
  });
}
