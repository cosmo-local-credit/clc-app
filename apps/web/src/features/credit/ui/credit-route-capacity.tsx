import type { CreditRoute } from "@clc/api/features/credit-router/client";
import type { CreditQuoteMode } from "@clc/core/features/credit-router/logic";
import { Trans } from "@lingui/react/macro";
import type { MouseEvent } from "react";

import { Button } from "#/components/ui/button";
import { amountOf, symbolOf, type Labels } from "#/features/credit/logic/credit-display";
import { creditRouteCapacity } from "#/features/credit/logic/credit-routes";
import { cn } from "#/lib/utils";

export function CreditRouteCapacity({
  route,
  mode,
  inputVoucher,
  outputVoucher,
  labels,
  locale,
  onMax,
  compact = false,
  className,
}: {
  route: CreditRoute;
  mode: CreditQuoteMode;
  inputVoucher: `0x${string}`;
  outputVoucher: `0x${string}`;
  labels: Labels;
  locale: string;
  onMax?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const capacity = creditRouteCapacity(route, mode, inputVoucher, outputVoucher);
  if (!capacity) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        <Trans>Capacity unknown</Trans>
      </span>
    );
  }
  const max = amountOf(labels, capacity.voucher, capacity.raw, locale);
  if (max === null) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        <Trans>Capacity unknown</Trans>
      </span>
    );
  }
  const symbol = symbolOf(labels, capacity.voucher);
  if (!capacity.exact) {
    // Keep the established translated capacity sentence while presenting its
    // amount in the route's numerical style.
    const maxOut = max;
    const outSymbol = symbol;
    return (
      <span dir="ltr" className={cn("font-mono text-xs font-semibold", className)}>
        <Trans>
          At least{" "}
          <span>
            {maxOut} {outSymbol}
          </span>
        </Trans>
      </span>
    );
  }
  if (!onMax) {
    const maxOut = max;
    const outSymbol = symbol;
    return (
      <span dir="ltr" className={cn("font-mono text-xs font-semibold", className)}>
        <Trans>
          Up to{" "}
          <span>
            {maxOut} {outSymbol}
          </span>
        </Trans>
      </span>
    );
  }
  const stopAndFill = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onMax();
  };
  if (compact) {
    return (
      <button
        type="button"
        disabled={BigInt(capacity.raw) === 0n}
        onClick={stopAndFill}
        className={cn(
          "font-mono text-xs font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-50",
          className,
        )}
      >
        <Trans>
          Max {max} {symbol}
        </Trans>
      </button>
    );
  }
  return (
    <Button
      variant="ghost"
      tap
      disabled={BigInt(capacity.raw) === 0n}
      onClick={stopAndFill}
      className={cn("font-mono font-semibold", className)}
    >
      <Trans>
        Max {max} {symbol}
      </Trans>
    </Button>
  );
}
