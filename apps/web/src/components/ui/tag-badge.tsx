import { useLingui } from "@lingui/react/macro";
import { categoryLabel } from "#/lib/category-label";
import type { ComponentProps } from "react";

import { Badge } from "#/components/ui/badge";
import { hueDegreesFromSeed } from "#/components/wallet/wallet-data";
import { cn } from "#/lib/utils";

export function TagBadge({
  tag,
  className,
  labelClassName,
  ...props
}: Omit<ComponentProps<typeof Badge>, "variant" | "caps"> & {
  tag: string;
  labelClassName?: string;
}) {
  const { i18n } = useLingui();
  const label = categoryLabel(tag, i18n);
  return (
    <Badge
      className={cn("border-transparent text-white", className)}
      style={{ backgroundColor: tagBackground(tag) }}
      {...props}
    >
      {labelClassName ? <span className={labelClassName}>{label}</span> : label}
    </Badge>
  );
}

export function SelectableTagBadge({
  tag,
  selected,
  count,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children" | "aria-pressed"> & {
  tag: string;
  selected: boolean;
  count?: number;
}) {
  const { i18n } = useLingui();
  const label = categoryLabel(tag, i18n);
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "relative inline-flex h-9 shrink-0 items-center gap-1.5 border px-3 font-semibold text-2xs transition-colors before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']",
        "disabled:cursor-not-allowed disabled:opacity-45",
        selected ? "border-transparent text-white" : "border-foreground/25 bg-card text-foreground",
        className,
      )}
      style={selected ? { backgroundColor: tagBackground(tag) } : undefined}
      {...props}
    >
      {label}
      {count === undefined ? null : (
        <span
          className={cn(
            "font-normal tabular-nums",
            selected ? "text-white/80" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function tagBackground(tag: string): string {
  return `oklch(0.45 0.15 ${hueDegreesFromSeed(tag)})`;
}
