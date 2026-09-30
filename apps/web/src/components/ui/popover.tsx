import { Popover } from "@base-ui/react/popover";
import type * as React from "react";

import { cn } from "#/lib/utils";

const PopoverRoot = Popover.Root;
const PopoverTrigger = Popover.Trigger;
const PopoverClose = Popover.Close;
const PopoverTitle = Popover.Title;

type PopoverContentProps = React.ComponentProps<typeof Popover.Popup> & {
  align?: React.ComponentProps<typeof Popover.Positioner>["align"];
  alignOffset?: React.ComponentProps<typeof Popover.Positioner>["alignOffset"];
  collisionPadding?: React.ComponentProps<typeof Popover.Positioner>["collisionPadding"];
  positionerClassName?: string;
  side?: React.ComponentProps<typeof Popover.Positioner>["side"];
  sideOffset?: React.ComponentProps<typeof Popover.Positioner>["sideOffset"];
};

function PopoverContent({
  align = "center",
  alignOffset,
  children,
  className,
  collisionPadding = 16,
  positionerClassName,
  side = "bottom",
  sideOffset = 8,
  ...props
}: PopoverContentProps) {
  return (
    <Popover.Portal>
      <Popover.Positioner
        align={align}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        positionMethod="fixed"
        side={side}
        sideOffset={sideOffset}
        className={cn("z-50", positionerClassName)}
      >
        <Popover.Popup
          data-slot="popover-content"
          className={cn(
            "max-h-[var(--available-height)] overflow-y-auto rounded-none border border-border bg-popover p-4 text-popover-foreground outline-none",
            "transition-[transform,opacity] duration-150",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  );
}

export { PopoverClose, PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger };
