import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { getAddress } from "viem";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { useCatalogVoucherSuggestions } from "#/features/catalogs/hooks/use-catalog-member-suggestions";
import {
  useVoucherSearch,
  VOUCHER_SEARCH_MIN_CHARS,
} from "#/features/home/hooks/use-voucher-search";

type Row = { address: `0x${string}`; name: string; symbol: string };

export function VoucherProposalPicker({
  value,
  onChange,
}: {
  value?: `0x${string}`;
  onChange: (address?: `0x${string}`) => void;
}) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const suggestions = useCatalogVoucherSuggestions();
  const search = useVoucherSearch(query, setQuery, true);
  const groups = useMemo(() => {
    const seen = new Set<string>();
    const unique = (rows: readonly Row[]) =>
      rows.filter((row) => {
        const key = row.address.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return {
      owned: unique(suggestions.owned.rows),
      held: unique(suggestions.holdings.rows),
      search: unique(
        search.results.map((row) => ({ address: row.address, name: row.name, symbol: row.symbol })),
      ),
    };
  }, [search.results, suggestions.holdings.rows, suggestions.owned.rows]);

  const row = (candidate: Row) => (
    <Button
      key={candidate.address}
      type="button"
      variant={value?.toLowerCase() === candidate.address.toLowerCase() ? "default" : "outline"}
      className="w-full justify-start"
      onClick={() => onChange(getAddress(candidate.address))}
    >
      <span className="truncate">{candidate.name}</span>
      <span className="ms-auto font-mono">{candidate.symbol}</span>
    </Button>
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
      {groups.owned.length > 0 ? (
        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground">
            <Trans>Your vouchers</Trans>
          </p>
          {groups.owned.slice(0, 5).map(row)}
        </div>
      ) : null}
      {groups.held.length > 0 ? (
        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground">
            <Trans>Vouchers you hold</Trans>
          </p>
          {groups.held.slice(0, 5).map(row)}
        </div>
      ) : null}
      <Input
        value={query}
        placeholder={t`Search vouchers`}
        aria-label={t`Search vouchers`}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query.trim().length > 0 && query.trim().length < VOUCHER_SEARCH_MIN_CHARS ? (
        <p className="text-xs text-muted-foreground">
          <Trans>Enter at least two characters.</Trans>
        </p>
      ) : null}
      {search.status === "searching" ? (
        <p className="text-xs text-muted-foreground">
          <Trans>Searching…</Trans>
        </p>
      ) : null}
      {groups.search.length > 0 ? <div className="grid gap-1">{groups.search.map(row)}</div> : null}
    </div>
  );
}
