import { Combobox } from "@base-ui/react/combobox";
import { toVocabularyTitleCase, validateCustomTag } from "@clc/core/features/vocabulary/logic";
import { useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";
import { RiCheckLine, RiCloseLine } from "react-icons/ri";

import { categoryLabel } from "#/lib/category-label";

/**
 * Tags as chips inside one field, with the vocabulary in a popup under it.
 * Enter on text the list does not have adds it as a custom tag, the same
 * rule the phone's inline tag list applies.
 */
export function DeskTagField({
  id,
  items,
  value,
  onValueChange,
}: {
  id: string;
  items: string[];
  value: string[];
  onValueChange: (value: string[]) => void;
}) {
  const { t, i18n } = useLingui();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const label = (tag: string) => categoryLabel(tag, i18n);
  const customValue = toVocabularyTitleCase(inputValue);
  const canAddCustom =
    !validateCustomTag(customValue) &&
    !items.some(
      (item) =>
        item.toLowerCase() === customValue.toLowerCase() ||
        label(item).toLowerCase() === customValue.toLowerCase(),
    );

  const addCustom = () => {
    if (!canAddCustom) return;
    if (!value.some((item) => item.toLowerCase() === customValue.toLowerCase())) {
      onValueChange([...value, customValue]);
    }
    setInputValue("");
  };

  return (
    <Combobox.Root<string, true>
      multiple
      items={items}
      value={value}
      onValueChange={onValueChange}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      itemToStringLabel={label}
      filter={(tag, query) =>
        label(tag).toLowerCase().includes(query.toLowerCase()) ||
        tag.toLowerCase().includes(query.toLowerCase())
      }
    >
      <Combobox.Chips
        ref={anchorRef}
        aria-label={t`Selected voucher tags`}
        className="flex min-h-9 w-full flex-wrap items-center gap-1.5 border border-foreground/25 bg-card px-2 py-1 focus-within:border-foreground"
      >
        {value.map((item) => {
          const tag = label(item);
          return (
            <Combobox.Chip
              key={item}
              className="inline-flex h-6 max-w-full items-center border border-border bg-card ps-2 text-2xs font-semibold data-highlighted:border-foreground"
            >
              <span className="min-w-0 truncate">{tag}</span>
              <Combobox.ChipRemove
                aria-label={t`Remove ${tag}`}
                className="flex size-6 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <RiCloseLine aria-hidden="true" className="size-3.5" />
              </Combobox.ChipRemove>
            </Combobox.Chip>
          );
        })}
        <Combobox.Input
          id={id}
          placeholder={t`Search tags`}
          aria-label={t`Search voucher tags`}
          className="h-7 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          onKeyDown={(event) => {
            if (event.key === "Enter" && canAddCustom) {
              event.preventDefault();
              addCustom();
            }
          }}
        />
      </Combobox.Chips>
      <Combobox.Portal>
        <Combobox.Positioner anchor={anchorRef} sideOffset={4} className="z-50">
          <Combobox.Popup className="max-h-72 w-[var(--anchor-width)] overflow-y-auto border border-border bg-popover py-1 text-popover-foreground outline-none">
            <Combobox.List aria-label={t`Voucher tags`}>
              {(tag: string) => (
                <Combobox.Item
                  key={tag}
                  value={tag}
                  className="flex h-9 cursor-default items-center gap-2 px-3 text-sm outline-none select-none data-highlighted:bg-muted"
                >
                  <span className="min-w-0 flex-1 truncate">{label(tag)}</span>
                  <Combobox.ItemIndicator>
                    <RiCheckLine aria-hidden="true" className="size-4 text-primary" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
            {canAddCustom ? (
              <button
                type="button"
                className="flex h-9 w-full items-center px-3 text-start text-sm font-medium text-primary hover:bg-muted"
                onClick={addCustom}
              >
                {t`Add “${customValue}”`}
              </button>
            ) : null}
            <Combobox.Empty>
              {canAddCustom ? null : (
                <p className="px-3 py-2.5 text-sm text-muted-foreground">{t`No tags found.`}</p>
              )}
            </Combobox.Empty>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
