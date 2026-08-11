import { useEffect, useRef, useState } from "react";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from "#/components/ui/combobox";

export function TagCombobox({
  items,
  value,
  onValueChange,
  searchLabel,
  selectedLabel,
  listLabel,
  placeholder,
  removeLabel,
}: {
  items: string[];
  value: string[];
  onValueChange: (value: string[]) => void;
  searchLabel: string;
  selectedLabel: string;
  listLabel: string;
  placeholder: string;
  removeLabel: (tag: string) => string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

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
      <Combobox<string, true>
        multiple
        inline
        open={open}
        onOpenChange={setOpen}
        items={items}
        value={value}
        onValueChange={(nextValue, eventDetails) => {
          onValueChange(nextValue);
          if (
            eventDetails.reason === "item-press" &&
            typeof MouseEvent !== "undefined" &&
            eventDetails.event instanceof MouseEvent
          ) {
            inputRef.current?.blur();
          }
        }}
      >
        <ComboboxChips className="mt-2" aria-label={selectedLabel}>
          {value.map((tag) => (
            <ComboboxChip key={tag} removeLabel={removeLabel(tag)}>
              {tag}
            </ComboboxChip>
          ))}
          <div className="w-full">
            <ComboboxInput
              ref={inputRef}
              placeholder={placeholder}
              aria-label={searchLabel}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
            />
          </div>
        </ComboboxChips>
        {open ? (
          <ComboboxList className="mt-2" aria-label={listLabel}>
            {(tag: string) => (
              <ComboboxItem key={tag} value={tag}>
                <span className="flex-1 text-sm">{tag}</span>
                <ComboboxItemIndicator />
              </ComboboxItem>
            )}
          </ComboboxList>
        ) : null}
      </Combobox>
    </div>
  );
}
