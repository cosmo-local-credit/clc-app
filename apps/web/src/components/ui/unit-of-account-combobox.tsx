import {
  findUnitOfAccountOption,
  formatUnitOfAccountOption,
  UNIT_OF_ACCOUNT_OPTIONS,
  type UnitOfAccount,
} from "@clc/core/lib/currencies";
import { useMemo } from "react";

import { SearchableSelect, type SearchableOption } from "#/components/ui/searchable-select";

/**
 * Searchable single-select over the stable currency/UoA catalog.
 *
 * A draft may already hold a code the catalog does not list — an older draft, or
 * one restored from storage — so that code is offered as its own row rather than
 * silently blanked. Choosing it changes nothing: only a catalog code is a value
 * this picker will hand back.
 */
export function UnitOfAccountCombobox({
  id,
  value,
  onValueChange,
  placeholder,
  emptyMessage,
}: {
  id: string;
  value: string;
  onValueChange: (value: UnitOfAccount) => void;
  placeholder: string;
  emptyMessage: string;
}) {
  const options = useMemo<SearchableOption[]>(() => {
    const catalog = UNIT_OF_ACCOUNT_OPTIONS.map((option) => ({
      value: option.code,
      label: formatUnitOfAccountOption(option),
    }));
    if (!value || findUnitOfAccountOption(value)) return catalog;
    return [
      { value, label: formatUnitOfAccountOption({ code: value, name: "Custom" }) },
      ...catalog,
    ];
  }, [value]);

  return (
    <SearchableSelect
      id={id}
      options={options}
      value={value}
      onValueChange={(next) => {
        if (!findUnitOfAccountOption(next)) return;
        onValueChange(next as UnitOfAccount);
      }}
      placeholder={placeholder}
      emptyMessage={emptyMessage}
    />
  );
}
