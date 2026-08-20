import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon, XIcon } from "lucide-react";

import { cn } from "#/lib/utils";

/**
 * Multi-select combobox, ported from apps/web and densified for the console.
 *
 * `inline` keeps the list in document flow so it does not fight a sticky
 * deployment column or clip against the page edge. The popup-bound registry
 * parts are omitted for the same reason as on web: they pull in a Radix
 * input-group this repo does not use.
 */
const Combobox = ComboboxPrimitive.Root;

function ComboboxChips({ className, ...props }: ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      {...props}
    />
  );
}

function ComboboxChip({
  className,
  children,
  removeLabel,
  ...props
}: ComboboxPrimitive.Chip.Props & { removeLabel: string }) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "border-border bg-card inline-flex h-7 max-w-full shrink-0 items-center border pl-2 font-mono text-xs",
        "data-highlighted:border-foreground",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <ComboboxPrimitive.ChipRemove
        data-slot="combobox-chip-remove"
        aria-label={removeLabel}
        className="text-muted-foreground hover:text-foreground relative flex size-7 shrink-0 items-center justify-center"
      >
        <XIcon className="size-3.5" aria-hidden="true" />
      </ComboboxPrimitive.ChipRemove>
    </ComboboxPrimitive.Chip>
  );
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "border-input bg-card placeholder:text-muted-foreground h-9 w-full min-w-0 border px-2.5 text-sm transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-1",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "border-border bg-card max-h-56 overflow-y-auto border empty:hidden",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({ className, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "border-border flex min-h-8 w-full cursor-default items-center gap-2 border-b px-2.5 py-1.5 text-left text-sm outline-none select-none last:border-b-0",
        "data-highlighted:bg-muted data-disabled:pointer-events-none data-disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItemIndicator({ className, ...props }: ComboboxPrimitive.ItemIndicator.Props) {
  return (
    <ComboboxPrimitive.ItemIndicator
      data-slot="combobox-item-indicator"
      className={cn("flex shrink-0 items-center", className)}
      {...props}
    >
      <CheckIcon className="size-3.5" aria-hidden="true" />
    </ComboboxPrimitive.ItemIndicator>
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty data-slot="combobox-empty" className={cn(className)} {...props} />
  );
}

export {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
};
