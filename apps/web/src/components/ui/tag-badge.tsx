import type { ComponentProps } from "react";

import { Badge } from "#/components/ui/badge";
import { hueDegreesFromSeed } from "#/components/wallet/wallet-data";
import { cn } from "#/lib/utils";

/**
 * A tag chip coloured from its own name, so "Education" is the same colour on
 * every offering and every report that carries it.
 *
 * Solid rather than a tinted background: these render in both themes, and a
 * fixed pale background carrying dark text is unreadable in dark mode.
 * Lightness is held at 0.45 so white text clears 4.5:1 at every hue.
 */
export function TagBadge({
  tag,
  className,
  labelClassName,
  ...props
}: ComponentProps<"span"> & { tag: string; labelClassName?: string }) {
  return (
    <Badge
      className={cn("border-transparent text-white", className)}
      style={{ backgroundColor: `oklch(0.45 0.15 ${hueDegreesFromSeed(tag)})` }}
      {...props}
    >
      {labelClassName ? <span className={labelClassName}>{tag}</span> : tag}
    </Badge>
  );
}
