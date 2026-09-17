import { useEffect, useRef, useState } from "react";
import { toVocabularyTitleCase, validateCustomTag } from "@clc/core/features/vocabulary/logic";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxEmpty,
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
  const [inputValue, setInputValue] = useState("");
  const customValue = toVocabularyTitleCase(inputValue);
  const canAddCustom =
    !validateCustomTag(customValue) &&
    !items.some((item) => item.toLowerCase() === customValue.toLowerCase());

  const addCustomValue = () => {
    if (!canAddCustom) return;
    if (!value.some((item) => item.toLowerCase() === customValue.toLowerCase())) {
      onValueChange([...value, customValue]);
    }
    setInputValue("");
    setOpen(false);
    inputRef.current?.blur();
  };

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
        inputValue={inputValue}
        onInputValueChange={setInputValue}
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
        <ComboboxChips aria-label={selectedLabel}>
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
              onKeyDown={(event) => {
                if (event.key === "Enter" && canAddCustom) {
                  event.preventDefault();
                  addCustomValue();
                }
              }}
            />
          </div>
        </ComboboxChips>
        {open ? (
          <>
            <ComboboxList className="mt-1.5" aria-label={listLabel}>
              {(tag: string) => (
                <ComboboxItem key={tag} value={tag}>
                  <span className="flex-1">{tag}</span>
                  <ComboboxItemIndicator />
                </ComboboxItem>
              )}
            </ComboboxList>
            {canAddCustom ? (
              <button
                type="button"
                className="mt-1 w-full border border-border bg-card px-2.5 py-2 text-left text-sm"
                onClick={addCustomValue}
              >
                Add “{customValue}”
              </button>
            ) : null}
            <ComboboxEmpty>
              <p className="px-2.5 py-2 text-muted-foreground text-sm">No tags found.</p>
            </ComboboxEmpty>
          </>
        ) : null}
      </Combobox>
    </div>
  );
}
