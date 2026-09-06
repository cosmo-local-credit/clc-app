import {
  findUnitOfAccountOption,
  formatUnitOfAccountOption,
  UNIT_OF_ACCOUNT_OPTIONS,
  type UnitOfAccount,
} from "@clc/core/lib/currencies";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from "#/components/ui/combobox";

type Option = { code: string; name: string };

/** Searchable single-select over the stable currency/UoA catalog. */
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
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const options = useMemo<Option[]>(() => {
    if (!value || findUnitOfAccountOption(value)) return [...UNIT_OF_ACCOUNT_OPTIONS];
    return [{ code: value, name: "Custom" }, ...UNIT_OF_ACCOUNT_OPTIONS];
  }, [value]);
  const labels = useMemo(() => options.map(formatUnitOfAccountOption), [options]);
  const selectedLabel = options.find((option) => option.code === value);
  const formattedSelected = selectedLabel ? formatUnitOfAccountOption(selectedLabel) : "";
  const [inputValue, setInputValue] = useState(formattedSelected);

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
          const selected = options.find(
            (option) => formatUnitOfAccountOption(option) === nextValue,
          );
          if (!selected || !findUnitOfAccountOption(selected.code)) return;
          onValueChange(selected.code as UnitOfAccount);
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
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
        />
        {open ? (
          <>
            <ComboboxList className="mt-2" aria-label={placeholder}>
              {(label: string) => (
                <ComboboxItem key={label} value={label}>
                  <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
                  <ComboboxItemIndicator />
                </ComboboxItem>
              )}
            </ComboboxList>
            <ComboboxEmpty>
              <p className="px-3 py-3 text-muted-foreground text-sm">{emptyMessage}</p>
            </ComboboxEmpty>
          </>
        ) : null}
      </Combobox>
    </div>
  );
}
