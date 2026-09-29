import { accountTokensPageQueryOptions } from "@clc/api/features/accounts/queries";
import { voucherFilteredPageQueryOptions } from "@clc/api/features/market/queries";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import { accountsClient } from "#/lib/api/accounts";
import { marketClient } from "#/lib/api/market";
import { toApprovalCandidate } from "#/features/pools/logic/approval-suggestions";

/**
 * One page of each personal list. The sheet is a head start, not a browser:
 * anything past the page, and any voucher the steward neither issued nor holds,
 * is what the search field is for.
 */
const SUGGESTION_PAGE_SIZE = 20;

/**
 * Vouchers the connected wallet issued, and vouchers it holds.
 *
 * Issued comes from the catalog's owner predicate. Holdings come from the
 * account balance list rather than that same catalog: the catalog drops a
 * voucher with no coordinates, and a balance row already carries the name and
 * symbol the row needs.
 */
export function useApprovalSuggestions() {
  const { address } = useConnection();
  const owner = address?.toLowerCase();

  const issuedQuery = useQuery({
    ...voucherFilteredPageQueryOptions(marketClient, {
      perPage: SUGGESTION_PAGE_SIZE,
      filter: EMPTY_CATALOG_FILTER,
      owner,
    }),
    enabled: Boolean(owner),
  });

  const heldQuery = useQuery(
    accountTokensPageQueryOptions(accountsClient, owner, SUGGESTION_PAGE_SIZE),
  );

  return {
    issued: (issuedQuery.data?.vouchers ?? []).flatMap((voucher) => {
      const candidate = toApprovalCandidate({
        id: voucher.id,
        address: voucher.address,
        name: voucher.name,
        symbol: voucher.symbol,
      });
      return candidate ? [candidate] : [];
    }),
    holdings: (heldQuery.data?.tokens ?? []).flatMap((token) => {
      const candidate = toApprovalCandidate({
        id: token.tokenAddress,
        address: token.tokenAddress,
        name: token.tokenName,
        symbol: token.tokenSymbol,
      });
      return candidate ? [candidate] : [];
    }),
    // A disabled read is pending forever. With no wallet there is nothing to
    // wait for, and the pool's own vouchers can still be offered.
    isPending: Boolean(owner) && (issuedQuery.isPending || heldQuery.isPending),
    isError: Boolean(owner) && (issuedQuery.isError || heldQuery.isError),
    refetch: () => {
      void issuedQuery.refetch();
      void heldQuery.refetch();
    },
  };
}
