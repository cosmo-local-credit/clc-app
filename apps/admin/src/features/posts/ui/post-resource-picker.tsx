import { voucherFilteredPageQueryOptions } from "@clc/api/features/market/queries";
import { poolFilteredPageQueryOptions } from "@clc/api/features/pools/queries";
import { EMPTY_CATALOG_FILTER, formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  poolRefKey,
  voucherRefKey,
  type ReportPoolRef,
  type ReportVoucherRef,
} from "@clc/core/features/reports/logic";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useRef, useState } from "react";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from "#/components/ui/combobox";
import { Button } from "#/components/ui/button";
import { clcApi } from "#/lib/api";

type ResourceRef = ReportVoucherRef | ReportPoolRef;
type ResourceOption = { value: string; label: string; symbol?: string; ref: ResourceRef };

/** Global catalog picker used by an administrative Post editor. */
export function PostResourcePicker({
  kind,
  value,
  linkedNames,
  max,
  disabled,
  onChange,
}: {
  kind: "voucher" | "pool";
  value: ResourceRef[];
  linkedNames: Map<string, string>;
  max: number;
  disabled?: boolean;
  onChange: (value: ResourceRef[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [pickedNames, setPickedNames] = useState<Map<string, string>>(new Map());
  const deferredQuery = useDeferredValue(query.trim());
  const active = deferredQuery.length >= 2 && !disabled && value.length < max;
  const filter = { ...EMPTY_CATALOG_FILTER, term: active ? deferredQuery : "" };

  const voucherQuery = useQuery({
    ...voucherFilteredPageQueryOptions(clcApi.market, { perPage: 20, filter }),
    enabled: kind === "voucher" && active,
  });
  const poolQuery = useQuery({
    ...poolFilteredPageQueryOptions(clcApi.pools, { perPage: 20, filter }),
    enabled: kind === "pool" && active,
  });

  const keyFor = (ref: ResourceRef) => (kind === "voucher" ? voucherRefKey(ref) : poolRefKey(ref));
  const selected: ResourceOption[] = value.map((ref) => ({
    value: keyFor(ref),
    label:
      linkedNames.get(keyFor(ref)) ??
      pickedNames.get(keyFor(ref)) ??
      formatVoucherAddress(ref.address as `0x${string}`),
    ref,
  }));
  const selectedKeys = new Set(selected.map((option) => option.value));
  const results: ResourceOption[] = (
    kind === "voucher"
      ? (voucherQuery.data?.vouchers ?? []).map((resource) => ({
          value: voucherRefKey(resource),
          label: resource.name,
          symbol: resource.symbol,
          ref: { chainId: resource.chainId, address: resource.address },
        }))
      : (poolQuery.data?.pools ?? [])
          .filter((resource) => resource.chainId !== null)
          .map((resource) => ({
            value: poolRefKey({ chainId: resource.chainId as number, address: resource.address }),
            label: resource.name,
            symbol: resource.symbol,
            ref: { chainId: resource.chainId as number, address: resource.address },
          }))
  ).filter((option) => !selectedKeys.has(option.value));

  const loading = kind === "voucher" ? voucherQuery.isFetching : poolQuery.isFetching;
  const failed = kind === "voucher" ? voucherQuery.isError : poolQuery.isError;
  const plural = kind === "voucher" ? "vouchers" : "pools";

  return (
    <div className="flex flex-col gap-2">
      <Combobox<ResourceOption, true>
        multiple
        inline
        filter={null}
        items={[...selected, ...results]}
        value={selected}
        isItemEqualToValue={(option, selectedOption) => option.value === selectedOption.value}
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
            inputRef.current?.blur();
          }
        }}
      >
        <ComboboxChips aria-label={`Linked ${plural}`}>
          {selected.map((option) => (
            <ComboboxChip key={option.value} removeLabel={`Unlink ${option.label}`}>
              {option.label}
            </ComboboxChip>
          ))}
          {value.length < max ? (
            <div className="w-full">
              <ComboboxInput
                ref={inputRef}
                aria-label={`Search ${plural}`}
                placeholder={`Search all ${plural}`}
                disabled={disabled}
              />
            </div>
          ) : null}
        </ComboboxChips>
        {active ? (
          <ComboboxList aria-label={`${kind === "voucher" ? "Voucher" : "Pool"} results`}>
            {(option: ResourceOption) => (
              <ComboboxItem key={option.value} value={option}>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.symbol ? (
                  <span className="font-data text-muted-foreground text-xs">{option.symbol}</span>
                ) : null}
                <ComboboxItemIndicator />
              </ComboboxItem>
            )}
          </ComboboxList>
        ) : null}
      </Combobox>
      <p className="text-muted-foreground text-xs">
        {value.length} / {max} linked
        {loading ? " · Searching…" : failed ? " · Search unavailable" : ""}
      </p>
      {failed ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void (kind === "voucher" ? voucherQuery.refetch() : poolQuery.refetch())}
        >
          Retry
        </Button>
      ) : null}
    </div>
  );
}
