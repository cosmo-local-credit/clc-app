import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import type * as React from "react";

import { cn } from "#/lib/utils.ts";

function Progress({
  className,
  value,
  max = 100,
  children,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      className={cn(
        children ? "relative" : "relative h-[3px] w-full overflow-hidden rounded-full bg-secondary",
        className,
      )}
      {...props}
    >
      {children ?? (
        <ProgressTrack className="h-full w-full">
          <ProgressIndicator />
        </ProgressTrack>
      )}
    </ProgressPrimitive.Root>
  );
}

function ProgressTrack({
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Track>) {
  return <ProgressPrimitive.Track data-slot="progress-track" className={className} {...props} />;
}

function ProgressIndicator({
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Indicator>) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn(
        "h-full rounded-full bg-primary transition-[width] duration-200 ease-out",
        className,
      )}
      {...props}
    />
  );
}

export { Progress, ProgressTrack };
