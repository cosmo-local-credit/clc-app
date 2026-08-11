import { Select } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "#/lib/utils.ts";

const SelectRoot = Select.Root;

function SelectValue({
  placeholder,
  ...props
}: React.ComponentProps<typeof Select.Value> & { placeholder?: string }) {
  return <Select.Value placeholder={placeholder} {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof Select.Trigger> & {
  size?: "sm" | "default";
}) {
  return (
    <Select.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 whitespace-nowrap rounded-none border border-input bg-card px-3 py-2 text-sm outline-none",
        "transition-[color,border-color]",
        "focus-visible:border-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive",
        "data-[placeholder]:text-muted-foreground",
        "data-[size=default]:h-9 data-[size=sm]:h-8",
        className,
      )}
      {...props}
    >
      {children}
      <Select.Icon className="size-4 opacity-50">
        <ChevronDownIcon className="size-4" />
      </Select.Icon>
    </Select.Trigger>
  );
}

function SelectContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Select.Popup> & {
  position?: "item-aligned" | "popper";
}) {
  return (
    <Select.Portal>
      <Select.Positioner>
        <Select.Popup
          data-slot="select-content"
          className={cn(
            "relative z-50 min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-none border border-border bg-popover text-popover-foreground",
            "data-[starting-style]:fade-in-0 data-[starting-style]:zoom-in-95 data-[starting-style]:animate-in",
            "data-[ending-style]:fade-out-0 data-[ending-style]:zoom-out-95 data-[ending-style]:animate-out",
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <Select.List className="p-1">{children}</Select.List>
          <SelectScrollDownButton />
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  );
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof Select.Item>) {
  return (
    <Select.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden",
        "focus:bg-accent focus:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <Select.ItemIndicator>
          <CheckIcon className="size-4" />
        </Select.ItemIndicator>
      </span>
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof Select.ScrollUpArrow>) {
  return (
    <Select.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </Select.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof Select.ScrollDownArrow>) {
  return (
    <Select.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </Select.ScrollDownArrow>
  );
}

export { SelectContent, SelectItem, SelectRoot, SelectTrigger, SelectValue };
