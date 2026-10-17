import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import type * as React from "react";

import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/utils.ts";

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}

function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioPrimitive.Root>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] border-muted-foreground bg-card outline-none",
        "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
        "data-[checked]:border-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="size-2 rounded-full bg-primary"
      />
    </RadioPrimitive.Root>
  );
}

/**
 * One choice in a list, the whole 44px row its target and the radio at its
 * end. Rows rule themselves off like ActionRow, so a RadioGroup of them sits
 * in one bordered panel.
 *
 * `busy` swaps the radio for a spinner while the choice is being applied; the
 * radio stays in the accessibility tree so the group still has a checked item.
 */
function RadioGroupRow({
  value,
  label,
  description,
  icon,
  busy = false,
  disabled,
}: {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      aria-busy={busy || undefined}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 text-start last:border-b-0 active:bg-muted",
        "has-[[data-disabled]]:cursor-default has-[[data-disabled]]:opacity-50 has-[[data-disabled]]:active:bg-transparent",
      )}
    >
      {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-sm">{label}</span>
        {description ? (
          <span className="block text-muted-foreground text-xs">{description}</span>
        ) : null}
      </span>
      {busy ? <Spinner className="text-muted-foreground" /> : null}
      <RadioGroupItem value={value} disabled={disabled} className={busy ? "sr-only" : undefined} />
    </label>
  );
}

export { RadioGroup, RadioGroupItem, RadioGroupRow };
