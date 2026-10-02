import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";
import { RiSearchLine } from "react-icons/ri";

import type { PoolVoucherFacet } from "@clc/api/features/pools/client";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from "#/components/ui/combobox";

type OutputVoucherOption = {
  address: `0x${string}` | null;
  name: string;
  symbol: string;
};

export function PoolOutputVoucherFilter({
  facets,
  value,
  fallbackLabel,
  loading,
  onValueChange,
}: {
  facets: readonly PoolVoucherFacet[];
  value: `0x${string}` | null;
  fallbackLabel?: string;
  loading: boolean;
  onValueChange: (address: `0x${string}` | null) => void;
}) {
  const { t, i18n } = useLingui();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo<OutputVoucherOption[]>(
    () => [
      { address: null, name: t`All Vouchers`, symbol: "" },
      ...facets.map((facet) => ({
        address: facet.address.toLowerCase() as `0x${string}`,
        name: facet.name,
        symbol: facet.symbol,
      })),
    ],
    [facets, t],
  );
  const selected =
    options.find((option) => option.address === value) ??
    (value
      ? {
          address: value,
          name: fallbackLabel ?? formatVoucherAddress(value),
          symbol: "",
        }
      : options[0]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [open]);

  const openList = () => {
    if (open || loading) return;
    setQuery("");
    setOpen(true);
  };
  const locale = i18n.locales?.[0] ?? i18n.locale;

  return (
    <div ref={rootRef} className="relative min-w-[10rem] flex-1">
      <Combobox<OutputVoucherOption>
        inline
        open={open}
        onOpenChange={(next) => {
          if (next) openList();
          else setOpen(false);
        }}
        items={options}
        value={selected ?? null}
        inputValue={open ? query : (selected?.name ?? t`All Vouchers`)}
        onInputValueChange={(next) => {
          if (open) setQuery(next);
        }}
        itemToStringLabel={(option) => option.name}
        itemToStringValue={(option) => option.address ?? ""}
        isItemEqualToValue={(option, selectedOption) => option.address === selectedOption.address}
        filter={(option, search) =>
          option.name.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale))
        }
        onValueChange={(next, eventDetails) => {
          if (!next) return;
          onValueChange(next.address);
          if (eventDetails.reason === "item-press") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      >
        <div className="relative">
          <RiSearchLine
            className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <ComboboxInput
            ref={inputRef}
            aria-label={t`Output voucher`}
            className="ps-9"
            disabled={loading}
            placeholder={loading ? t`Loading vouchers…` : t`All Vouchers`}
            onFocus={openList}
            onClick={openList}
          />
        </div>
        {open ? (
          <ComboboxList
            className="absolute z-20 mt-2 max-h-60 w-full min-w-0"
            aria-label={t`Output voucher search results`}
          >
            {(option: OutputVoucherOption) => (
              <ComboboxItem
                key={option.address ?? "all"}
                value={option}
                aria-label={option.symbol ? `${option.name} ${option.symbol}` : option.name}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">{option.name}</span>
                  {option.symbol ? (
                    <span className="block truncate font-mono text-muted-foreground text-xs">
                      {option.symbol}
                    </span>
                  ) : null}
                </span>
                <ComboboxItemIndicator />
              </ComboboxItem>
            )}
          </ComboboxList>
        ) : null}
        <ComboboxEmpty>
          {open ? (
            <p className="absolute z-20 mt-2 w-full border border-border bg-card p-3 text-muted-foreground text-sm">
              <Trans>No pool vouchers match this search.</Trans>
            </p>
          ) : null}
        </ComboboxEmpty>
      </Combobox>
      {loading ? (
        <span className="sr-only">
          <Trans>Loading vouchers…</Trans>
        </span>
      ) : null}
    </div>
  );
}
