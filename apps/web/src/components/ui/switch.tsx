import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import type * as React from "react";

import { cn } from "#/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex size-11 shrink-0 cursor-pointer items-center rounded-full bg-card outline-none",
        "before:absolute before:left-0.5 before:h-[1.375rem] before:w-10 before:rounded-full before:border before:border-border before:bg-card before:transition-colors before:content-['']",
        "data-[checked]:before:border-primary data-[checked]:before:bg-primary",
        "focus-visible:ring-1 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="absolute left-1 size-4 rounded-full bg-card transition-transform data-[checked]:translate-x-[1.125rem]"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
