import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon, XIcon } from "lucide-react";

import { cn } from "#/lib/utils";

/**
 * Inline multi-select combobox.
 *
 * Base UI's `inline` mode renders the list in the document flow instead of a popup, which is the
 * only workable shape inside a mobile bottom sheet — a floating listbox would either clip against
 * the sheet or cover the input once the virtual keyboard opens. Pair it with `open` held true.
 *
 * The popup-bound parts (Portal, Positioner, Popup, Trigger, Clear) are deliberately not wrapped
 * here: they would pull in the Radix-backed `input-group` registry item this repo bans.
 */
const Combobox = ComboboxPrimitive.Root;

function ComboboxChips({ className, ...props }: ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn("flex flex-wrap items-center gap-2", className)}
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
        "inline-flex h-8 max-w-full shrink-0 items-center border border-border bg-card ps-3 font-semibold text-[11px] text-foreground",
        "data-highlighted:border-foreground",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <ComboboxPrimitive.ChipRemove
        data-slot="combobox-chip-remove"
        aria-label={removeLabel}
        className="relative flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] hover:text-foreground"
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
        "h-9 w-full min-w-0 rounded-none border border-input bg-card px-3 py-1 text-base outline-none transition-[color,border-color] placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-foreground aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20",
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
        "max-h-72 overflow-y-auto border border-border bg-card empty:hidden",
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
        "flex min-h-11 w-full select-none items-center gap-3 border-border border-b px-3 py-2 text-start outline-none last:border-b-0",
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
      <CheckIcon className="size-4" aria-hidden="true" />
    </ComboboxPrimitive.ItemIndicator>
  );
}

/**
 * Renders its children only while the list is empty. Base UI keeps the element mounted as a polite
 * live region, so never gate it behind a conditional and never hide it with `display: none`
 * (including Tailwind's `empty:hidden`) — doing so stops screen readers announcing result changes.
 * It collapses to zero height on its own when empty, so put spacing on the children instead.
 */
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
