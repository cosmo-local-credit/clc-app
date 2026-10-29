import { useLingui } from "@lingui/react/macro";
import { validateCustomUnit } from "@clc/core/features/vocabulary/logic";
import {
  findUnitOfAccountOption,
  formatUnitOfAccountOption,
  normalizeUnitOfAccount,
  UNIT_OF_ACCOUNT_OPTIONS,
  type UnitOfAccount,
} from "@clc/core/lib/currencies";
import { useMemo } from "react";

import { Button } from "#/components/ui/button";
import { SearchableSelect, type SearchableOption } from "#/components/ui/searchable-select";
import { useUnitsOfAccount } from "#/hooks/use-vocabulary";

/**
 * Reusable built-in and server-backed custom Unit-of-Account selector.
 */
export function UnitOfAccountCombobox({
  id,
  value,
  onValueChange,
  placeholder,
  emptyMessage,
  ariaLabel,
  ariaInvalid,
  disabled,
}: {
  id: string;
  value: string;
  onValueChange: (value: UnitOfAccount) => void;
  placeholder: string;
  emptyMessage: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const { options, vocabulary } = useUnitOfAccountOptions(value);

  return (
    <div className="space-y-2">
      <SearchableSelect
        id={id}
        options={options}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        emptyMessage={emptyMessage}
        createLabel={(next) => t`Add “${next}”`}
        normalizeCustomValue={normalizeUnitOfAccount}
        validateCustomValue={validateCustomUnit}
        ariaLabel={ariaLabel}
        ariaInvalid={ariaInvalid}
        disabled={disabled}
      />
      {vocabulary.isError ? (
        <div className="flex items-center justify-between gap-2 text-destructive text-xs">
          <span>{t`Couldn't load units of account.`}</span>
          <Button type="button" variant="outline" tap onClick={() => vocabulary.refetch()}>
            {t`Retry`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The built-in units plus the server's custom ones, keyed case-insensitively,
 * with the current value kept even when neither list has it.
 */
export function useUnitOfAccountOptions(value: string) {
  const vocabulary = useUnitsOfAccount();
  const options = useMemo<SearchableOption[]>(() => {
    const byKey = new Map<string, SearchableOption>();
    for (const option of UNIT_OF_ACCOUNT_OPTIONS) {
      byKey.set(option.code.toLowerCase(), {
        value: option.code,
        label: formatUnitOfAccountOption(option),
      });
    }
    for (const entry of vocabulary.data ?? []) {
      const builtIn = findUnitOfAccountOption(entry.value);
      const canonical = builtIn?.code ?? entry.value;
      byKey.set(canonical.toLowerCase(), {
        value: canonical,
        label: builtIn ? formatUnitOfAccountOption(builtIn) : canonical,
      });
    }
    if (value && !byKey.has(value.toLowerCase())) {
      byKey.set(value.toLowerCase(), { value, label: value });
    }
    return [...byKey.values()];
  }, [value, vocabulary.data]);
  return { options, vocabulary };
}
