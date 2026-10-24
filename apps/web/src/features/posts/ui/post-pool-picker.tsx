import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { poolRefKey, type ReportPoolRef } from "@clc/core/features/reports/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from "#/components/ui/combobox";
import { POOL_SEARCH_MIN_CHARS, usePoolSearch } from "#/features/catalogs/hooks/use-pool-search";

type PoolOption = {
  value: string;
  label: string;
  symbol?: string;
  ref: ReportPoolRef;
};

/** The pool-mode sibling of the established Post voucher picker. */
export function PostPoolPicker({
  pools,
  linkedNames,
  onChange,
  disabled,
  max,
  owner,
}: {
  pools: ReportPoolRef[];
  linkedNames: Map<string, string>;
  onChange: (pools: ReportPoolRef[]) => void;
  disabled?: boolean;
  max: number;
  owner?: string;
}) {
  const { t } = useLingui();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pickedNames, setPickedNames] = useState<Map<string, string>>(new Map());
  const atMax = pools.length >= max;
  const search = usePoolSearch(query, setQuery, !disabled && !atMax, owner);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (rootRef.current && !event.composedPath().includes(rootRef.current)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);

  const labelFor = (ref: ReportPoolRef) =>
    linkedNames.get(poolRefKey(ref)) ??
    pickedNames.get(poolRefKey(ref)) ??
    formatVoucherAddress(ref.address as `0x${string}`);
  const selected: PoolOption[] = pools.map((ref) => ({
    value: poolRefKey(ref),
    label: labelFor(ref),
    ref,
  }));
  const selectedKeys = new Set(selected.map((option) => option.value));
  const results: PoolOption[] = search.results
    .filter((pool) => pool.chainId !== null)
    .map((pool) => {
      const ref: ReportPoolRef = { chainId: pool.chainId as number, address: pool.address };
      return { value: poolRefKey(ref), label: pool.name, symbol: pool.symbol, ref };
    })
    .filter((option) => !selectedKeys.has(option.value));

  return (
    <div ref={rootRef} className="space-y-2">
      <Combobox<PoolOption, true>
        multiple
        inline
        filter={null}
        open={open && !atMax}
        onOpenChange={setOpen}
        items={[...selected, ...results]}
        value={selected}
        isItemEqualToValue={(option, value) => option.value === value.value}
        inputValue={query}
        onInputValueChange={setQuery}
        onValueChange={(next, details) => {
          setPickedNames((previous) => {
            const names = new Map(previous);
            for (const option of next) names.set(option.value, option.label);
            return names;
          });
          onChange(next.slice(0, max).map((option) => option.ref));
          if (details.reason === "item-press") {
            setQuery("");
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      >
        <ComboboxChips aria-label={t`Linked pools`}>
          {selected.map((option) => (
            <ComboboxChip key={option.value} removeLabel={t`Unlink ${option.label}`}>
              {option.label}
            </ComboboxChip>
          ))}
          {atMax ? null : (
            <div className="w-full">
              <ComboboxInput
                ref={inputRef}
                aria-label={t`Search pools`}
                placeholder={owner ? t`Search your pools` : t`Search pools`}
                disabled={disabled}
                onFocus={() => setOpen(true)}
                onClick={() => setOpen(true)}
              />
            </div>
          )}
        </ComboboxChips>
        {open && !atMax && results.length > 0 ? (
          <ComboboxList className="mt-2" aria-label={t`Pools`}>
            {(option: PoolOption) => (
              <ComboboxItem key={option.value} value={option}>
                <span className="min-w-0 flex-1 truncate text-sm">{option.label}</span>
                {option.symbol ? (
                  <Badge variant="outline" size="sm" className="font-mono text-info">
                    {option.symbol}
                  </Badge>
                ) : null}
                <ComboboxItemIndicator />
              </ComboboxItem>
            )}
          </ComboboxList>
        ) : null}
      </Combobox>
      {!atMax && query.trim().length > 0 && query.trim().length < POOL_SEARCH_MIN_CHARS ? (
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
            <Trans>Couldn't search pools.</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            tap
            pending={search.retrying}
            onClick={search.retry}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      {search.status === "ready" && results.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {owner ? (
            <Trans>None of your pools match that search.</Trans>
          ) : (
            <Trans>No pools match that search.</Trans>
          )}
        </p>
      ) : null}
    </div>
  );
}
