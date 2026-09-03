import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { voucherRefKey, type ReportVoucherRef } from "@clc/core/features/reports/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { FaTrash } from "react-icons/fa";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  useVoucherSearch,
  VOUCHER_SEARCH_MIN_CHARS,
} from "#/features/home/hooks/use-voucher-search";

/**
 * Vouchers this post is about.
 *
 * Backed by the same server-side catalog lookup the posts filter sheet uses, so
 * the picker never holds a catalog in memory and the two surfaces agree on what
 * is findable. Two consequences: the search only sees active, geolocated
 * vouchers, and a voucher already linked to an imported post may not come back —
 * which is why linked rows are listed and removable regardless of the search.
 */
export function PostVoucherPicker({
  vouchers,
  linkedNames,
  onChange,
  disabled,
  max,
}: {
  vouchers: ReportVoucherRef[];
  /** Names for already-linked rows, keyed by `voucherRefKey`. */
  linkedNames: Map<string, string>;
  onChange: (vouchers: ReportVoucherRef[]) => void;
  disabled?: boolean;
  max: number;
}) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const search = useVoucherSearch(query, setQuery, !disabled && vouchers.length < max);

  const selected = new Set(vouchers.map(voucherRefKey));

  return (
    <div className="space-y-3">
      {vouchers.length === 0 ? null : (
        <ul className="border border-border bg-card">
          {vouchers.map((voucher) => {
            const key = voucherRefKey(voucher);
            return (
              <li
                key={key}
                className="flex min-h-12 items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {linkedNames.get(key) ?? formatVoucherAddress(voucher.address as `0x${string}`)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 bg-card text-destructive"
                  disabled={disabled}
                  aria-label={t`Unlink ${linkedNames.get(key) ?? voucher.address}`}
                  onClick={() => onChange(vouchers.filter((entry) => voucherRefKey(entry) !== key))}
                >
                  <FaTrash aria-hidden className="size-3" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {vouchers.length >= max ? (
        <p className="text-muted-foreground text-xs">
          <Trans>You can link up to {max} vouchers.</Trans>
        </p>
      ) : (
        <>
          <Input
            className="bg-card"
            aria-label={t`Search vouchers`}
            placeholder={t`Search vouchers`}
            value={query}
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
          />

          {query.trim().length > 0 && query.trim().length < VOUCHER_SEARCH_MIN_CHARS ? (
            <p className="text-muted-foreground text-xs">
              <Trans>Type at least two characters.</Trans>
            </p>
          ) : null}

          {search.status === "searching" ? (
            <p className="text-muted-foreground text-xs">
              <Trans>Searching…</Trans>
            </p>
          ) : null}

          {search.status === "error" ? (
            <div className="space-y-2">
              <p role="alert" className="text-destructive text-sm">
                <Trans>Couldn't search vouchers.</Trans>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 bg-card"
                onClick={search.retry}
              >
                <Trans>Retry</Trans>
              </Button>
            </div>
          ) : null}

          {search.status === "ready" && search.results.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              <Trans>No vouchers match that search.</Trans>
            </p>
          ) : null}

          {search.results.length > 0 ? (
            <ul className="border border-border bg-card">
              {search.results.map((voucher) => {
                const ref: ReportVoucherRef = {
                  chainId: voucher.chainId,
                  address: voucher.address,
                };
                const key = voucherRefKey(ref);
                const alreadyLinked = selected.has(key);

                return (
                  <li key={key} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      disabled={disabled || alreadyLinked}
                      className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted disabled:opacity-50"
                      onClick={() => onChange([...vouchers, ref])}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{voucher.name}</span>
                      <Badge
                        variant="outline"
                        className="h-5 max-w-20 truncate px-1.5 font-mono text-[0.625rem]"
                      >
                        {voucher.symbol}
                      </Badge>
                      {alreadyLinked ? (
                        <span className="shrink-0 text-muted-foreground text-xs">
                          <Trans>Linked</Trans>
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
