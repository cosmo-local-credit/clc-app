import { Drawer } from "@base-ui/react/drawer";
import type * as React from "react";

import { cn } from "#/lib/utils.ts";

/**
 * A modal bottom sheet. Built on Base UI's drawer rather than its dialog so
 * every sheet closes the same ways: a tap on the backdrop, a swipe down,
 * Escape and Android Back.
 *
 * Anything inside that drags on its own (a map, a crop frame, a slider) marks
 * itself `data-base-ui-swipe-ignore`, or the drag would pull the sheet down.
 */
export const SheetRoot = Drawer.Root;
export const SheetPortal = Drawer.Portal;
export const SheetClose = Drawer.Close;
export const SheetTitle = Drawer.Title;

function SheetBackdrop({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <Drawer.Backdrop
      className={cn(
        "fixed inset-0 z-40 min-h-dvh bg-black/50",
        // Fades with the sheet as it is dragged down.
        "opacity-[calc(1-var(--drawer-swipe-progress))]",
        "transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
        "data-[ending-style]:duration-[calc(var(--drawer-swipe-strength)*450ms)] data-[swiping]:duration-0 motion-reduce:duration-0",
        "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        "supports-[-webkit-touch-callout:none]:absolute",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Drawer.Popup>) {
  return (
    // The viewport covers the screen but takes no input, so a tap beside the
    // sheet lands on the backdrop and closes it. The swipe is tracked here.
    <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50">
      <Drawer.Popup
        className={cn(
          "pointer-events-auto absolute inset-x-0 bottom-0",
          // Square and flat like every other Lyra surface: a top rule, not a
          // radius and a shadow, separates it from the dimmed page.
          "flex max-h-[85dvh] flex-col rounded-none border-t border-border bg-background outline-none",
          "[transform:translateY(var(--drawer-swipe-movement-y))]",
          "transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
          "data-[ending-style]:duration-[calc(var(--drawer-swipe-strength)*450ms)] data-[swiping]:duration-0 data-[swiping]:select-none motion-reduce:duration-0",
          "data-[ending-style]:[transform:translateY(100%)] data-[starting-style]:[transform:translateY(100%)]",
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 bg-muted-foreground/30" />
        {children}
      </Drawer.Popup>
    </Drawer.Viewport>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 px-4 pt-4 pb-3", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 px-4 pt-2 pb-6", className)} {...props} />;
}

export { SheetBackdrop, SheetContent, SheetFooter, SheetHeader };
