import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { voucherRefKey, type ReportVoucherRef } from "@clc/core/features/reports/logic";
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
import {
  useVoucherSearch,
  VOUCHER_SEARCH_MIN_CHARS,
} from "#/features/home/hooks/use-voucher-search";

/**
 * One option in the picker: the ref the form stores, plus how to show it.
 *
 * Base UI reads `value` and `label` off an object item on its own, and carrying
 * the ref alongside them means a selection never has to be parsed back out of
 * its key.
 */
type VoucherOption = { value: string; label: string; ref: ReportVoucherRef };

/**
 * Vouchers this post is about.
 *
 * A multi-select combobox — chips for what is linked, one input to find more —
 * rather than a row per voucher: twelve are allowed, and a stack of twelve
 * delete buttons pushed the rest of the form off a phone screen.
 *
 * Backed by the same server-side catalog lookup the posts filter sheet uses, so
 * the picker never holds a catalog in memory and the two surfaces agree on what
 * is findable. Two consequences: the search only sees active, geolocated
 * vouchers, and a voucher already linked to an imported post may not come back —
 * which is why linked chips are labelled from the post and stay removable
 * regardless of the search.
 *
 * With `owner` set the search only returns that address's vouchers: an author
 * who is not a superadmin may only write about vouchers they issue, and clc-core
 * refuses the write otherwise.
 */
export function PostVoucherPicker({
  vouchers,
  linkedNames,
  onChange,
  disabled,
  max,
  owner,
}: {
  vouchers: ReportVoucherRef[];
  /** Names for already-linked chips, keyed by `voucherRefKey`. */
  linkedNames: Map<string, string>;
  onChange: (vouchers: ReportVoucherRef[]) => void;
  disabled?: boolean;
  max: number;
  /** Restrict the search to vouchers this address owns. Unset searches the catalog. */
  owner?: string;
}) {
  const { t } = useLingui();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const atMax = vouchers.length >= max;
  const search = useVoucherSearch(query, setQuery, !disabled && !atMax, owner);
  /**
   * Names learned from the search that found each voucher.
   *
   * The results list is a page of one query; without this a chip would fall back
   * to its address the moment the query that named it changed.
   */
  const [pickedNames, setPickedNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && !event.composedPath().includes(root)) setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [open]);

  const labelFor = (ref: ReportVoucherRef) => {
    const key = voucherRefKey(ref);
    return (
      linkedNames.get(key) ??
      pickedNames.get(key) ??
      formatVoucherAddress(ref.address as `0x${string}`)
    );
  };

  const selected: VoucherOption[] = vouchers.map((ref) => ({
    value: voucherRefKey(ref),
    label: labelFor(ref),
    ref,
  }));
  const selectedKeys = new Set(selected.map((option) => option.value));
  const results: VoucherOption[] = search.results
    .map((voucher) => {
      const ref: ReportVoucherRef = { chainId: voucher.chainId, address: voucher.address };
      return { value: voucherRefKey(ref), label: voucher.name, ref, symbol: voucher.symbol };
    })
    .filter((option) => !selectedKeys.has(option.value));
  // Selected first so a chip's own option always exists: Base UI resolves a
  // controlled value against the items it was given.
  const items = [...selected, ...results];

  return (
    <div ref={rootRef} className="space-y-2">
      <Combobox<VoucherOption, true>
        multiple
        inline
        // The catalog lookup already answered this query; filtering its page
        // again against the raw input would drop matches on symbol or address.
        filter={null}
        open={open && !atMax}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) inputRef.current?.blur();
        }}
        items={items}
        value={selected}
        isItemEqualToValue={(option, value) => option.value === value.value}
        inputValue={query}
        onInputValueChange={setQuery}
        onValueChange={(nextOptions, eventDetails) => {
          setPickedNames((previous) => {
            const next = new Map(previous);
            for (const option of nextOptions) next.set(option.value, option.label);
            return next;
          });
          onChange(nextOptions.slice(0, max).map((option) => option.ref));
          if (eventDetails.reason === "item-press") {
            // One tap, one voucher: the list is a search result, so leaving it
            // open over a stale query is worse than reopening it.
            setQuery("");
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      >
        <ComboboxChips aria-label={t`Linked vouchers`}>
          {selected.map((option) => (
            <ComboboxChip key={option.value} removeLabel={t`Unlink ${option.label}`}>
              {option.label}
            </ComboboxChip>
          ))}
          {atMax ? null : (
            <div className="w-full">
              <ComboboxInput
                ref={inputRef}
                aria-label={t`Search vouchers`}
                placeholder={owner ? t`Search your vouchers` : t`Search vouchers`}
                disabled={disabled}
                onFocus={() => setOpen(true)}
                onClick={() => setOpen(true)}
              />
            </div>
          )}
        </ComboboxChips>

        {open && !atMax && results.length > 0 ? (
          <ComboboxList className="mt-2" aria-label={t`Vouchers`}>
            {(option: VoucherOption & { symbol?: string }) => (
              <ComboboxItem key={option.value} value={option}>
                <span className="min-w-0 flex-1 truncate text-sm">{option.label}</span>
                {option.symbol ? (
                  <Badge
                    variant="outline"
                    className="h-5 max-w-20 truncate px-1.5 font-mono text-[0.625rem]"
                  >
                    {option.symbol}
                  </Badge>
                ) : null}
                <ComboboxItemIndicator />
              </ComboboxItem>
            )}
          </ComboboxList>
        ) : null}
      </Combobox>

      {atMax ? (
        <p className="text-muted-foreground text-xs">
          <Trans>You can link up to {max} vouchers.</Trans>
        </p>
      ) : null}

      {!atMax && query.trim().length > 0 && query.trim().length < VOUCHER_SEARCH_MIN_CHARS ? (
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

      {search.status === "ready" && results.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {owner ? (
            <Trans>None of your vouchers match that search.</Trans>
          ) : (
            <Trans>No vouchers match that search.</Trans>
          )}
        </p>
      ) : null}
    </div>
  );
}
