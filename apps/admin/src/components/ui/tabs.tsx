import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "#/lib/utils";

/**
 * Ported to Base UI: the shadcn registry ships this on Radix, which this repo
 * does not use.
 *
 * Styled as the filled segmented control `apps/web` uses on its pool and voucher
 * detail screens — an outlined `bg-card` track with the open tab inverted to
 * `bg-foreground`. An underline is quieter but reads as decoration until you
 * notice which label is darker; a filled segment is unmistakably a switch, and
 * matching the phone app means one tab idiom across the product.
 *
 * `TabsTab` accepts Base UI's `render` prop, so a tab can be a router `Link` and
 * the active tab can live in the URL instead of in component state.
 */
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "border-border bg-card inline-flex w-fit max-w-full items-center overflow-x-auto border p-1",
        className,
      )}
      {...props}
    />
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "text-muted-foreground inline-flex h-8 shrink-0 items-center gap-2 px-3 text-xs font-semibold whitespace-nowrap outline-none",
        "focus-visible:ring-ring focus-visible:ring-1 focus-visible:ring-inset",
        // Keyed on aria-selected, which Base UI sets on the element itself. Its
        // own state attribute is `data-active` — there is no `data-selected`, and
        // styling one silently produces a tab bar with no visible selection.
        //
        // Hover is scoped to the unselected tabs rather than left to compete with
        // the selected colours: two utilities of equal specificity are resolved by
        // the generated stylesheet's order, not by the order written here.
        "aria-[selected=false]:hover:bg-muted aria-[selected=false]:hover:text-foreground",
        "aria-selected:bg-foreground aria-selected:text-background",
        className,
      )}
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTab, TabsPanel };
