import { useEffect, useMemo, useRef, useState } from "react";

import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from "#/components/ui/combobox";

export type SearchableOption = { value: string; label: string };

export function SearchableSelect({
  id,
  options,
  value,
  onValueChange,
  placeholder,
  emptyMessage,
  createLabel,
  normalizeCustomValue,
  validateCustomValue,
}: {
  id: string;
  options: readonly SearchableOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  emptyMessage: string;
  createLabel: (value: string) => string;
  normalizeCustomValue: (value: string) => string;
  validateCustomValue: (value: string) => string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const labels = useMemo(() => options.map((option) => option.label), [options]);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;
  const customValue = normalizeCustomValue(query);
  const matchingOption = options.find(
    (option) =>
      option.value.toLowerCase() === customValue.toLowerCase() ||
      option.label.toLowerCase() === customValue.toLowerCase(),
  );
  const canCreate = Boolean(customValue && !matchingOption && !validateCustomValue(customValue));

  const close = () => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const create = () => {
    if (!canCreate) return;
    onValueChange(customValue);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) close();
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
          if (nextOpen) {
            setQuery(selectedLabel);
            setOpen(true);
          } else close();
        }}
        inputValue={open ? query : selectedLabel}
        onInputValueChange={(next) => {
          if (open) setQuery(next);
        }}
        items={labels}
        value={selectedLabel || null}
        onValueChange={(nextLabel, eventDetails) => {
          if (!nextLabel) return;
          const selected = options.find((option) => option.label === nextLabel);
          if (!selected) return;
          onValueChange(selected.value);
          if (eventDetails.reason === "item-press") close();
        }}
      >
        <ComboboxInput
          ref={inputRef}
          id={id}
          placeholder={placeholder}
          onFocus={() => {
            setQuery(selectedLabel);
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canCreate) {
              event.preventDefault();
              create();
            }
          }}
        />
        {open ? (
          <>
            <ComboboxList className="mt-1.5" aria-label={placeholder}>
              {(label: string) => (
                <ComboboxItem key={label} value={label}>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <ComboboxItemIndicator />
                </ComboboxItem>
              )}
            </ComboboxList>
            {canCreate ? (
              <button
                type="button"
                className="mt-1 w-full border border-border bg-card px-2.5 py-2 text-left"
                onClick={create}
              >
                {createLabel(customValue)}
              </button>
            ) : null}
            <ComboboxEmpty>
              <p className="px-2.5 py-2 text-muted-foreground text-sm">{emptyMessage}</p>
            </ComboboxEmpty>
          </>
        ) : null}
      </Combobox>
    </div>
  );
}
