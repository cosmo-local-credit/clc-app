import type { RouterHistory } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const changeOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
      if (!nextOpen) inputRef.current?.blur();
    },
    [controlledOpen, onOpenChange],
  );

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
