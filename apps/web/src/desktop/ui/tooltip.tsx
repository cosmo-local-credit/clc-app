import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

export function DeskTooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delay={300}>{children}</TooltipPrimitive.Provider>;
}

/** `inline-end` follows the reading direction, so the sidebar's tooltips open toward the canvas in RTL too. */
export function DeskTooltip({
  label,
  side = "inline-end",
  children,
}: {
  label: ReactNode;
  side?: TooltipPrimitive.Positioner.Props["side"];
  children: TooltipPrimitive.Trigger.Props["render"];
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={8} className="z-50">
          <TooltipPrimitive.Popup
            className={cn("border border-border bg-foreground px-2 py-1 text-xs text-background")}
          >
            {label}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
