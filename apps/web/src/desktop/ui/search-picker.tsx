import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { RiArrowDownSLine, RiCheckLine, RiSearchLine } from "react-icons/ri";

import { Input } from "#/components/ui/input";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "#/components/ui/popover";
import { cn } from "#/lib/utils";

export type DeskPickerOption = {
  value: string;
  label: string;
  /** Leading glyph or code shown before the label (a flag, a dial code). */
  lead?: ReactNode;
  /** Extra text the search matches against besides the label. */
  keywords?: string;
};

/**
 * A searchable single choice: a field-shaped trigger that opens a popover with
 * a search box and the matching options. The desktop form's answer to the
 * phone's inline list and its bottom sheets.
 */
export function DeskSearchPicker({
  id,
  options,
  value,
  onValueChange,
  trigger,
  searchLabel,
  emptyMessage,
  createLabel,
  normalizeCustomValue,
  validateCustomValue,
  ariaLabel,
  ariaInvalid,
  disabled,
  className,
  popoverClassName,
}: {
  id?: string;
  options: readonly DeskPickerOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** What the closed field shows. */
  trigger: ReactNode;
  searchLabel: string;
  emptyMessage: string;
  /** Offers a typed value that no option matches, when all three are given. */
  createLabel?: (value: string) => string;
  normalizeCustomValue?: (value: string) => string;
  validateCustomValue?: (value: string) => string | null;
  ariaLabel?: string;
  ariaInvalid?: boolean;
  disabled?: boolean;
  className?: string;
  popoverClassName?: string;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(needle) ||
          option.value.toLowerCase().includes(needle) ||
          (option.keywords ?? "").toLowerCase().includes(needle),
      )
    : options;
  const custom = normalizeCustomValue?.(query) ?? "";
  const canCreate = Boolean(
    createLabel &&
    validateCustomValue &&
    custom &&
    !options.some(
      (option) =>
        option.value.toLowerCase() === custom.toLowerCase() ||
        option.label.toLowerCase() === custom.toLowerCase(),
    ) &&
    !validateCustomValue(custom),
  );

  const choose = (next: string) => {
    onValueChange(next);
    setOpen(false);
  };

  return (
    <PopoverRoot
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        className={cn(
          "flex h-9 w-full min-w-0 items-center gap-2 border border-foreground/25 bg-card px-3 text-start text-sm outline-none",
          "focus-visible:border-foreground aria-expanded:border-foreground aria-invalid:border-destructive",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{trigger}</span>
        <RiArrowDownSLine aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className={cn("flex w-[var(--anchor-width)] min-w-64 flex-col p-0", popoverClassName)}
      >
        <div className="relative border-border border-b p-2">
          <RiSearchLine
            aria-hidden="true"
            className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (canCreate) choose(custom);
              else if (matches[0]) choose(matches[0].value);
            }}
            placeholder={t`Search…`}
            aria-label={searchLabel}
            className="ps-8"
          />
        </div>
        <div role="listbox" aria-label={searchLabel} className="max-h-64 overflow-y-auto py-1">
          {matches.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  "flex h-9 w-full min-w-0 items-center gap-2.5 px-3 text-start text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                  selected && "font-medium",
                )}
                onClick={() => choose(option.value)}
              >
                {option.lead}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selected ? (
                  <RiCheckLine aria-hidden="true" className="size-4 shrink-0 text-primary" />
                ) : null}
              </button>
            );
          })}
          {canCreate ? (
            <button
              type="button"
              className="flex h-9 w-full items-center px-3 text-start text-sm font-medium text-primary hover:bg-muted"
              onClick={() => choose(custom)}
            >
              {createLabel?.(custom)}
            </button>
          ) : matches.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">{emptyMessage}</p>
          ) : null}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
