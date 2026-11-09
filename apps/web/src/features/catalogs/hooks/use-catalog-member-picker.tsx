import {
  catalogCompleteMembersQueryOptions,
  catalogMemberMutationOptions,
} from "@clc/api/features/catalogs/queries";
import type { CatalogKind } from "@clc/core/features/catalogs/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import {
  type CatalogSuggestionSource,
  useCatalogPoolSuggestions,
  useCatalogVoucherSuggestions,
} from "#/features/catalogs/hooks/use-catalog-member-suggestions";
import { POOL_SEARCH_MIN_CHARS, usePoolSearch } from "#/features/catalogs/hooks/use-pool-search";
import {
  type CatalogMemberCandidate,
  excludeCatalogMembers,
  prioritizeCatalogMemberCandidates,
  toCatalogMemberCandidate,
} from "#/features/catalogs/logic/catalog-member-candidates";
import {
  useVoucherSearch,
  VOUCHER_SEARCH_MIN_CHARS,
} from "#/features/home/hooks/use-voucher-search";
import { catalogsClient } from "#/lib/api/catalogs";

type MemberIdentity = { id: string; address: string };

export type CandidateSearch = {
  status: "idle" | "searching" | "ready" | "error";
  results: readonly CatalogMemberCandidate[];
  retry: () => void;
  retrying: boolean;
};

export type CandidateGroup = {
  id: string;
  label: ReactNode;
  source: CatalogSuggestionSource;
  rows: readonly CatalogMemberCandidate[];
};

/** The member picker's data: the catalog's current members and the Add mutation. */
export function useCatalogMemberPicker({
  catalogId,
  kind,
  open,
  onOpenChange,
}: {
  catalogId: string;
  kind: CatalogKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const queryClient = useQueryClient();
  const members = useQuery({
    ...catalogCompleteMembersQueryOptions(catalogsClient, catalogId, kind),
    enabled: open,
  });
  const add = useMutation(
    catalogMemberMutationOptions(catalogsClient, queryClient, auth.session?.address ?? ""),
  );

  async function addCandidate(candidate: CatalogMemberCandidate) {
    try {
      await add.mutateAsync({ catalogId, kind, resourceId: candidate.id, added: true });
      toast.success(t`Added to catalog`);
      onOpenChange(false);
    } catch {
      toast.error(t`Couldn't update the catalog. Try again.`);
    }
  }

  return {
    members,
    title: kind === "pool" ? t`Add a pool` : t`Add a voucher`,
    pendingId: add.isPending ? add.variables?.resourceId : undefined,
    addCandidate,
  };
}

/** Voucher search and the "Vouchers you hold" and "My Vouchers" suggestions, minus members. */
export function useVoucherCandidates(members: readonly MemberIdentity[]) {
  const [query, setQuery] = useState("");
  const search = useVoucherSearch(query, setQuery, true);
  const suggestions = useCatalogVoucherSuggestions();
  const [holdings, owned] = prioritizeCatalogMemberCandidates(
    [suggestions.holdings.rows, suggestions.owned.rows],
    members,
  );
  const results = excludeCatalogMembers(
    search.results.flatMap((voucher) => {
      const candidate = toCatalogMemberCandidate({
        id: voucher.id,
        chainId: voucher.chainId,
        address: voucher.address,
        name: voucher.name,
        symbol: voucher.symbol,
        imageUrl: voucher.iconUrl,
      });
      return candidate ? [candidate] : [];
    }),
    members,
  );
  const groups: CandidateGroup[] = [
    {
      id: "holdings",
      label: <Trans>Vouchers you hold</Trans>,
      source: suggestions.holdings,
      rows: holdings,
    },
    { id: "owned", label: <Trans>My Vouchers</Trans>, source: suggestions.owned, rows: owned },
  ];
  return {
    query,
    setQuery,
    minimum: VOUCHER_SEARCH_MIN_CHARS,
    search: { ...search, results } satisfies CandidateSearch,
    groups,
  };
}

/** Pool search and the "My Pools" and "Pools accepting your vouchers" suggestions, minus members. */
export function usePoolCandidates(members: readonly MemberIdentity[]) {
  const [query, setQuery] = useState("");
  const search = usePoolSearch(query, setQuery, true);
  const suggestions = useCatalogPoolSuggestions();
  const [owned, accepting] = prioritizeCatalogMemberCandidates(
    [suggestions.owned.rows, suggestions.accepting.rows],
    members,
  );
  const results = excludeCatalogMembers(
    search.results.flatMap((pool) => {
      const candidate = toCatalogMemberCandidate({
        id: pool.id,
        chainId: pool.chainId,
        address: pool.address,
        name: pool.name,
        symbol: pool.symbol,
        imageUrl: pool.imageUrl,
      });
      return candidate ? [candidate] : [];
    }),
    members,
  );
  const groups: CandidateGroup[] = [
    { id: "owned", label: <Trans>My Pools</Trans>, source: suggestions.owned, rows: owned },
    {
      id: "accepting",
      label: <Trans>Pools accepting your vouchers</Trans>,
      source: suggestions.accepting,
      rows: accepting,
    },
  ];
  return {
    query,
    setQuery,
    minimum: POOL_SEARCH_MIN_CHARS,
    search: { ...search, results } satisfies CandidateSearch,
    groups,
  };
}

/** Which groups the picker shows before a search: any with rows, or still loading, failed or partial. */
export function visibleCandidateGroups(groups: readonly CandidateGroup[]) {
  return groups.filter(
    (group) =>
      group.rows.length > 0 ||
      group.source.status === "loading" ||
      group.source.status === "error" ||
      group.source.completeness === "partial",
  );
}
