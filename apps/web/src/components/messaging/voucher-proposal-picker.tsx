import { poolQueryOptions } from "@clc/api/features/pools/queries";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAddress } from "viem";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { useCatalogVoucherSuggestions } from "#/features/catalogs/hooks/use-catalog-member-suggestions";
import {
  useVoucherSearch,
  VOUCHER_SEARCH_MIN_CHARS,
} from "#/features/home/hooks/use-voucher-search";
import {
  poolTokenRegistryAddress,
  usePoolRegistryTokens,
} from "#/features/pools/hooks/use-pool-registry";
import { usePoolVouchersWithStatus } from "#/features/pools/hooks/use-pool-vouchers";
import { poolsClient } from "#/lib/api/pools";

type Row = { address: `0x${string}`; name: string; symbol?: string | null };

type PickerProps = {
  poolAddress: string;
  value?: string;
  onChange: (address?: `0x${string}`) => void;
};

export function VoucherProposalPicker({ compact, ...props }: PickerProps & { compact?: boolean }) {
  const [expanded, setExpanded] = useState(!compact);
  if (expanded) return <VoucherProposalChoices {...props} />;
  return (
    <Button type="button" variant="outline" onClick={() => setExpanded(true)}>
      <Trans>Propose a voucher</Trans>
    </Button>
  );
}

function VoucherProposalChoices({ poolAddress, value, onChange }: PickerProps) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const suggestions = useCatalogVoucherSuggestions();
  const search = useVoucherSearch(query, setQuery, true);
  const pool = useQuery({ ...poolQueryOptions(poolsClient, poolAddress), retry: false });
  const hasRegistry = poolTokenRegistryAddress(pool.data) !== null;
  const registry = usePoolRegistryTokens(pool.data);
  const catalog = usePoolVouchersWithStatus(hasRegistry ? undefined : pool.data, { all: true });
  const catalogVouchers = catalog.vouchers;
  const membershipReady =
    Boolean(pool.data) &&
    (hasRegistry ? registry.data !== undefined : !catalog.isPending && !catalog.isError);
  const membershipFailed =
    !membershipReady && (pool.isError || (hasRegistry ? registry.isError : catalog.isError));
  const term = query.trim().toLowerCase();
  const searching = term.length >= VOUCHER_SEARCH_MIN_CHARS;
  const rows = useMemo(() => {
    if (!membershipReady || (term && !searching)) return [];
    const seen = new Set(
      (hasRegistry
        ? (registry.data ?? [])
        : catalogVouchers.map((voucher) => voucher.tokenAddress)
      ).map((address) => address.toLowerCase()),
    );
    const local: Row[] = [...suggestions.owned.rows, ...suggestions.holdings.rows];
    const matching = searching
      ? local.filter((row) =>
          [row.name, row.symbol, row.address].some((field) => field?.toLowerCase().includes(term)),
        )
      : local;
    return [...matching, ...(searching ? search.results : [])].filter((row) => {
      const address = row.address.toLowerCase();
      if (seen.has(address)) return false;
      seen.add(address);
      return true;
    });
  }, [
    catalogVouchers,
    hasRegistry,
    membershipReady,
    registry.data,
    search.results,
    searching,
    suggestions.holdings.rows,
    suggestions.owned.rows,
    term,
  ]);

  useEffect(() => {
    if (list.current) list.current.scrollTop = 0;
  }, [term]);

  const incomplete = [suggestions.owned, suggestions.holdings].filter(
    (source) => source.status === "error" || source.completeness === "partial",
  );
  const loadingWallet = [suggestions.owned, suggestions.holdings].some(
    (source) => source.status === "loading",
  );

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          <Trans>Propose a voucher</Trans>
        </p>
        {value ? (
          <Button type="button" variant="ghost" onClick={() => onChange()}>
            <Trans>Clear</Trans>
          </Button>
        ) : null}
      </div>
      <Input
        value={query}
        placeholder={t`Search vouchers`}
        aria-label={t`Search vouchers`}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
      />
      {rows.length > 0 ? (
        // Shared buttons are 36px tall, so exactly five rows fit into 180px.
        <ul
          ref={list}
          className="max-h-45 overflow-y-auto overscroll-contain"
          aria-label={t`Voucher choices`}
        >
          {rows.map((candidate) => {
            const selected = value?.toLowerCase() === candidate.address.toLowerCase();
            return (
              <li key={candidate.address} className="flex">
                <Button
                  type="button"
                  variant={selected ? "default" : "outline"}
                  aria-pressed={selected}
                  className="w-full justify-start"
                  onClick={() => onChange(getAddress(candidate.address))}
                >
                  <span className="truncate">{candidate.name}</span>
                  <span className="ms-auto font-mono">{candidate.symbol}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {membershipFailed ? (
        <div className="flex flex-wrap items-center gap-2 text-xs" role="alert">
          <Trans>Couldn't check which vouchers the pool accepts.</Trans>
          <Button
            type="button"
            variant="outline"
            pending={pool.isFetching || (hasRegistry ? registry.isFetching : catalog.isFetching)}
            onClick={() => {
              if (!pool.data) void pool.refetch();
              else if (hasRegistry) void registry.refetch();
              else void catalog.refetch();
            }}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : !membershipReady || (!term && loadingWallet) ? (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner />
          <Trans>Loading vouchers…</Trans>
        </p>
      ) : null}
      {!term && incomplete.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs" role="alert">
          <Trans>Some wallet vouchers couldn't be loaded.</Trans>
          <Button
            type="button"
            variant="outline"
            pending={incomplete.some((source) => source.retrying)}
            onClick={() => {
              for (const source of incomplete) source.retry();
            }}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      {term && !searching ? (
        <p className="text-xs text-muted-foreground">
          <Trans>Enter at least two characters.</Trans>
        </p>
      ) : null}
      {search.status === "searching" ? (
        <p role="status" className="text-xs text-muted-foreground">
          <Trans>Searching…</Trans>
        </p>
      ) : null}
      {search.status === "error" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs" role="alert">
          <Trans>Couldn't search. Try again.</Trans>
          <Button type="button" variant="outline" pending={search.retrying} onClick={search.retry}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      {membershipReady &&
      rows.length === 0 &&
      (search.status === "ready" || (!term && !loadingWallet && incomplete.length === 0)) ? (
        <p className="text-xs text-muted-foreground">
          <Trans>No matching vouchers.</Trans>
        </p>
      ) : null}
    </div>
  );
}
