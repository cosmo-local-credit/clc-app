import type { RouterHistory } from "@tanstack/react-router";
import { toVocabularyTitleCase, validateCustomTag } from "@clc/core/features/vocabulary/logic";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState } from "react";

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
  navigationHistory,
  open: controlledOpen,
  onOpenChange,
}: {
  items: string[];
  value: string[];
  onValueChange: (value: string[]) => void;
  searchLabel: string;
  selectedLabel: string;
  listLabel: string;
  placeholder: string;
  removeLabel: (tag: string) => string;
  /** While the list is open, browser/device Back dismisses it instead of leaving the screen. */
  navigationHistory?: Pick<RouterHistory, "block">;
  /** Optional control for screens whose visible Back button also dismisses the list. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const open = controlledOpen ?? uncontrolledOpen;
  const changeOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
      if (!nextOpen) {
        setInputValue("");
        inputRef.current?.blur();
      }
    },
    [controlledOpen, onOpenChange],
  );

  const addCustomValue = useCallback(() => {
    const custom = toVocabularyTitleCase(inputValue);
    if (validateCustomTag(custom)) return;
    const existing = items.find((item) => item.toLowerCase() === custom.toLowerCase());
    const next = existing ?? custom;
    if (!value.some((item) => item.toLowerCase() === next.toLowerCase())) {
      onValueChange([...value, next]);
    }
    changeOpen(false);
  }, [changeOpen, inputValue, items, onValueChange, value]);

  const customValue = toVocabularyTitleCase(inputValue);
  const canAddCustom =
    !validateCustomTag(customValue) &&
    !items.some((item) => item.toLowerCase() === customValue.toLowerCase());

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && !event.composedPath().includes(root)) changeOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [changeOpen, open]);

  useEffect(() => {
    if (!open || !navigationHistory) return;

    return navigationHistory.block({
      enableBeforeUnload: false,
      blockerFn: ({ action }) => {
        if (action !== "BACK") return false;
        changeOpen(false);
        return true;
      },
    });
  }, [changeOpen, navigationHistory, open]);

  return (
    <div ref={rootRef}>
      <Combobox<string, true>
        multiple
        inline
        open={open}
        onOpenChange={changeOpen}
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
              onFocus={() => changeOpen(true)}
              onClick={() => changeOpen(true)}
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
            <ComboboxList className="mt-2" aria-label={listLabel}>
              {(tag: string) => (
                <ComboboxItem key={tag} value={tag}>
                  <span className="flex-1 text-sm">{tag}</span>
                  <ComboboxItemIndicator />
                </ComboboxItem>
              )}
            </ComboboxList>
            {canAddCustom ? (
              <button
                type="button"
                className="mt-1 w-full border border-border bg-card px-3 py-3 text-start text-sm"
                onClick={addCustomValue}
              >
                {t`Add “${customValue}”`}
              </button>
            ) : null}
            <ComboboxEmpty>
              <p className="px-3 py-3 text-muted-foreground text-sm">{t`No tags found.`}</p>
            </ComboboxEmpty>
          </>
        ) : null}
      </Combobox>
    </div>
  );
}
