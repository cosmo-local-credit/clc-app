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

/**
 * Searchable single-select over a fixed option list.
 *
 * Base UI's combobox is driven by its item strings, so this maps between the
 * label a person types against and the value a form stores. Everything else is
 * the mobile shape the primitive's own comment argues for: an inline list in the
 * document flow, opened on focus and closed on an outside press, so it works
 * inside a bottom sheet with the keyboard up.
 *
 * Typing that matches nothing is not a value: the input reverts to the selected
 * option's label on close, so a half-typed search never leaves the form holding
 * something the list never offered.
 */
export function SearchableSelect({
  id,
  options,
  value,
  onValueChange,
  placeholder,
  emptyMessage,
  ariaLabel,
  className,
}: {
  id: string;
  options: readonly SearchableOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  emptyMessage: string;
  /** Names the control when the visible label belongs to a wider row. */
  ariaLabel?: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const labels = useMemo(() => options.map((option) => option.label), [options]);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";
  const [inputValue, setInputValue] = useState(selectedLabel);

  useEffect(() => {
    if (!open) setInputValue(selectedLabel);
  }, [selectedLabel, open]);

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
    <div ref={rootRef} className={className}>
      <Combobox<string>
        inline
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setInputValue(selectedLabel);
        }}
        inputValue={inputValue}
        onInputValueChange={setInputValue}
        items={labels}
        value={selectedLabel || null}
        onValueChange={(nextLabel, eventDetails) => {
          if (!nextLabel) return;
          const selected = options.find((option) => option.label === nextLabel);
          if (!selected) return;
          onValueChange(selected.value);
          setInputValue(nextLabel);
          if (eventDetails.reason === "item-press") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      >
        <ComboboxInput
          ref={inputRef}
          id={id}
          aria-label={ariaLabel}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
        />
        {open ? (
          <>
            <ComboboxList className="mt-2" aria-label={ariaLabel ?? placeholder}>
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
