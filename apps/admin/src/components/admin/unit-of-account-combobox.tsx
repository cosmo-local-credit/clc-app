import {
  findUnitOfAccountOption,
  formatUnitOfAccountOption,
  UNIT_OF_ACCOUNT_OPTIONS,
  type UnitOfAccount,
} from "@clc/core/lib/currencies";
import { unitsOfAccountQueryOptions } from "@clc/api/features/vocabulary/queries";
import { toVocabularyTitleCase, validateCustomUnit } from "@clc/core/features/vocabulary/logic";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from "#/components/ui/combobox";
import { Button } from "#/components/ui/button";
import { clcApi } from "#/lib/api";

type Option = { code: string; name: string; isCustom?: boolean };

/** Admin-density version of the searchable currency/UoA selector. */
export function UnitOfAccountCombobox({
  id,
  value,
  onValueChange,
  disabled,
}: {
  id: string;
  value: string;
  onValueChange: (value: UnitOfAccount) => void;
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const vocabulary = useQuery(unitsOfAccountQueryOptions(clcApi.vocabulary));
  const options = useMemo<Option[]>(() => {
    const byKey = new Map<string, Option>();
    for (const option of UNIT_OF_ACCOUNT_OPTIONS) byKey.set(option.code.toLowerCase(), option);
    for (const entry of vocabulary.data ?? []) {
      const builtIn = findUnitOfAccountOption(entry.value);
      const option = builtIn ?? { code: entry.value, name: entry.value, isCustom: true };
      byKey.set(option.code.toLowerCase(), option);
    }
    if (value && !byKey.has(value.toLowerCase())) {
      byKey.set(value.toLowerCase(), { code: value, name: value, isCustom: true });
    }
    return [...byKey.values()];
  }, [value, vocabulary.data]);
  const labelFor = (option: Option) =>
    option.isCustom ? option.code : formatUnitOfAccountOption(option);
  const labels = options.map(labelFor);
  const selectedLabel = options.find((option) => option.code === value);
  const formattedSelected = selectedLabel ? labelFor(selectedLabel) : "";
  const [inputValue, setInputValue] = useState(formattedSelected);
  const customValue = toVocabularyTitleCase(inputValue);
  const hasMatch = options.some(
    (option) =>
      option.code.toLowerCase() === customValue.toLowerCase() ||
      labelFor(option).toLowerCase() === customValue.toLowerCase(),
  );
  const canCreate = customValue !== "" && !hasMatch && !validateCustomUnit(customValue);

  useEffect(() => {
    if (!open) setInputValue(formattedSelected);
  }, [formattedSelected, open]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [open]);

  return (
    <div ref={rootRef}>
      <Combobox<string>
        inline
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setInputValue(formattedSelected);
        }}
        inputValue={inputValue}
        onInputValueChange={setInputValue}
        items={labels}
        value={formattedSelected || null}
        onValueChange={(nextValue, eventDetails) => {
          if (!nextValue) return;
          const selected = options.find((option) => labelFor(option) === nextValue);
          if (!selected) return;
          onValueChange(selected.code);
          setInputValue(nextValue);
          if (eventDetails.reason === "item-press") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      >
        <ComboboxInput
          ref={inputRef}
          id={id}
          disabled={disabled}
          placeholder="Search units of account"
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canCreate) {
              event.preventDefault();
              onValueChange(customValue);
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
        />
        {open ? (
          <>
            <ComboboxList className="mt-2" aria-label="Units of account">
              {(label: string) => (
                <ComboboxItem key={label} value={label}>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <ComboboxItemIndicator />
                </ComboboxItem>
              )}
            </ComboboxList>
            {canCreate ? (
              <Button
                type="button"
                variant="outline"
                className="mt-1 w-full justify-start"
                onClick={() => {
                  onValueChange(customValue);
                  setOpen(false);
                  inputRef.current?.blur();
                }}
              >
                Add “{customValue}”
              </Button>
            ) : null}
            <ComboboxEmpty>
              <p className="text-muted-foreground px-2.5 py-2 text-sm">
                No units of account found.
              </p>
            </ComboboxEmpty>
            {vocabulary.isError ? (
              <div className="mt-2 flex items-center justify-between gap-2 text-destructive text-xs">
                <span>Could not load units of account.</span>
                <Button type="button" variant="outline" onClick={() => vocabulary.refetch()}>
                  Retry
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </Combobox>
    </div>
  );
}
