import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

export function DeskTooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delay={300}>{children}</TooltipPrimitive.Provider>;
}

export function DeskTooltip({
  label,
  children,
}: {
  label: ReactNode;
  children: TooltipPrimitive.Trigger.Props["render"];
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side="right" sideOffset={8} className="z-50">
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
