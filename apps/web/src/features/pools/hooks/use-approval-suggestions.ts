import type { AccountToken } from "@clc/api/features/accounts/client";
import {
  accountTokensInfiniteQueryOptions,
  latestAccountTokensQueryOptions,
} from "@clc/api/features/accounts/queries";
import { voucherFilteredPageQueryOptions } from "@clc/api/features/market/queries";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useConnection } from "wagmi";

import { accountsClient } from "#/lib/api/accounts";
import { marketClient } from "#/lib/api/market";
import {
  type ApprovalCandidate,
  toApprovalCandidate,
} from "#/features/pools/logic/approval-suggestions";

/**
 * Issued vouchers are only a convenience shortlist. Balance-backed sources are
 * drained completely because a deposit waiting at the pool must not disappear
 * merely because a newer transfer occupies the first page.
 */
const SUGGESTION_PAGE_SIZE = 20;
const ACCOUNT_PAGE_SIZE = 100;

export type ApprovalSuggestionSource = {
  rows: ApprovalCandidate[];
  status: "idle" | "loading" | "ready" | "error";
  completeness: "complete" | "partial";
  retry: () => void;
  /** A source that failed is loading again after `retry`. */
  retrying: boolean;
};

/**
 * Vouchers the connected wallet holds or issued, plus tokens already deposited
 * at the pool address.
 *
 * Issued comes from the catalog's owner predicate. Holdings come from the
 * account balance list rather than that same catalog: the catalog drops a
 * voucher with no coordinates, and a balance row already carries the name and
 * symbol the row needs.
 */
export function useApprovalSuggestions(poolAddress: string | undefined) {
  const { address } = useConnection();
  const owner = address?.toLowerCase();
  const pool = poolAddress?.toLowerCase();

  const issuedQuery = useQuery({
    ...voucherFilteredPageQueryOptions(marketClient, {
      perPage: SUGGESTION_PAGE_SIZE,
      filter: EMPTY_CATALOG_FILTER,
      owner,
    }),
    enabled: Boolean(owner),
  });

  const holdings = useAccountSuggestionSource(owner);
  const deposited = useAccountSuggestionSource(pool);

  const issued = (issuedQuery.data?.vouchers ?? []).flatMap((voucher) => {
    const candidate = toApprovalCandidate({
      id: voucher.id,
      address: voucher.address,
      name: voucher.name,
      symbol: voucher.symbol,
    });
    return candidate ? [candidate] : [];
  });
  return {
    // These requests are independent conveniences. A federation balance read
    // can fail while the public owner catalog succeeds (or vice versa), so one
    // source must never turn the whole picker into an error or hide the other.
    issued: {
      rows: issued,
      status: sourceStatus(owner, issuedQuery),
      completeness: "complete",
      retry: () => void issuedQuery.refetch(),
      retrying: issuedQuery.isFetching,
    } satisfies ApprovalSuggestionSource,
    holdings,
    deposited,
  };
}

function useAccountSuggestionSource(address: string | undefined): ApprovalSuggestionSource {
  const complete = useInfiniteQuery(
    accountTokensInfiniteQueryOptions(accountsClient, address, ACCOUNT_PAGE_SIZE),
  );
  const { fetchNextPage, hasNextPage, isError, isFetchingNextPage } = complete;

  useEffect(() => {
    if (isError || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isError, isFetchingNextPage]);

  // The small endpoint powers the wallet home and is deliberately a fallback:
  // it keeps the picker useful when cursor pagination is unhealthy without
  // pretending its five recent balances are a complete account inventory.
  const recent = useQuery({
    ...latestAccountTokensQueryOptions(accountsClient, address),
    enabled: Boolean(address) && complete.isError,
  });

  if (!address) {
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
      rows: draining ? [] : tokensToCandidates(completeTokens),
      status: draining ? "loading" : "ready",
      completeness: "complete",
      retry: () => void complete.refetch(),
      retrying: complete.isFetching,
    };
  }

  const fallbackTokens = dedupeTokens([...completeTokens, ...(recent.data?.tokens ?? [])]);
  const fallbackReady = completeTokens.length > 0 || recent.isSuccess;
  return {
    rows: fallbackReady ? tokensToCandidates(fallbackTokens) : [],
    status: fallbackReady ? "ready" : recent.isPending ? "loading" : "error",
    completeness: "partial",
    retry: () => {
      void complete.refetch();
      if (recent.isError) void recent.refetch();
    },
    retrying: complete.isFetching || recent.isFetching,
  };
}

function tokensToCandidates(tokens: readonly AccountToken[]): ApprovalCandidate[] {
  return tokens.flatMap((token) => {
    // The federation can retain a historical token row after its balance has
    // returned to zero. Neither an empty wallet row nor an empty pool deposit
    // is an approval suggestion.
    try {
      if (BigInt(token.balance) <= 0n) return [];
    } catch {
      return [];
    }
    const candidate = toApprovalCandidate({
      id: token.tokenAddress,
      address: token.tokenAddress,
      name: token.tokenName,
      symbol: token.tokenSymbol,
    });
    return candidate ? [candidate] : [];
  });
}

function dedupeTokens(tokens: readonly AccountToken[]): AccountToken[] {
  const seen = new Set<string>();
  return tokens.filter((token) => {
    const key = token.tokenAddress.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceStatus(
  owner: string | undefined,
  query: { isPending: boolean; isError: boolean },
): ApprovalSuggestionSource["status"] {
  // A disabled TanStack query remains pending. Without a connected wallet the
  // personal sections are absent rather than loading forever.
  if (!owner) return "idle";
  if (query.isPending) return "loading";
  if (query.isError) return "error";
  return "ready";
}
