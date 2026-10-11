import {
  findIsoCurrencyOption,
  formatUnitOfAccountOption,
  ISO_CURRENCIES,
  type IsoCurrency,
} from "@clc/core/lib/currencies";
import { useMemo } from "react";

import { SearchableSelect, type SearchableOption } from "#/components/ui/searchable-select";

/** Searchable select over the ISO currency catalog, shared by profile surfaces. */
export function CurrencySelect({
  id,
  value,
  onValueChange,
  placeholder,
  emptyMessage,
  ariaLabel,
  ariaInvalid,
}: {
  id: string;
  value: string;
  onValueChange: (value: IsoCurrency) => void;
  placeholder: string;
  emptyMessage: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
}) {
  const options = useMemo<SearchableOption[]>(
    () =>
      ISO_CURRENCIES.map((currency) => ({
        value: currency.code,
        label: formatUnitOfAccountOption(currency),
      })),
    [],
  );

  return (
    <SearchableSelect
      id={id}
      options={options}
      value={value}
      onValueChange={(next) => {
        if (!findIsoCurrencyOption(next)) return;
        onValueChange(next as IsoCurrency);
      }}
      placeholder={placeholder}
      emptyMessage={emptyMessage}
      ariaLabel={ariaLabel}
      ariaInvalid={ariaInvalid}
    />
  );
}
