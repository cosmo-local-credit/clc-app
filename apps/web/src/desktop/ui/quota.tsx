import type { ResourceKind, ResourceUsage } from "@clc/api/features/resource-limits/client";
import { Trans, useLingui } from "@lingui/react/macro";

import { Progress } from "#/components/ui/progress";
import { cn } from "#/lib/utils";

type Quota = ResourceUsage[ResourceKind];

function useQuotaFigures(quota: Quota) {
  const { i18n } = useLingui();
  const digits = new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale);
  return { used: digits.format(quota.used), limit: digits.format(quota.limit) };
}

/**
 * An allowance as the phone counts it: "1 of 3 used", or "3 used · Unlimited"
 * where there is no denominator. The caller sets the colour and spacing.
 */
export function DeskQuotaText({ quota, className }: { quota: Quota; className?: string }) {
  const { used, limit } = useQuotaFigures(quota);
  return (
    <span className={className} aria-live="polite">
      {quota.unlimited ? (
        <Trans id="{used} used · Unlimited">{used} used · Unlimited</Trans>
      ) : (
        <Trans id="{used} of {limit} used">
          {used} of {limit} used
        </Trans>
      )}
    </span>
  );
}

/**
 * The count over a determinate meter, for a create page. An unlimited
 * allowance has no denominator, so it gets no bar even at zero.
 */
export function DeskQuotaMeter({ quota, label }: { quota: Quota; label: string }) {
  const { t } = useLingui();
  const { used, limit } = useQuotaFigures(quota);
  return (
    <>
      <DeskQuotaText quota={quota} className="block text-xs text-muted-foreground" />
      {!quota.unlimited && quota.limit > 0 ? (
        <Progress
          value={Math.min(quota.used, quota.limit)}
          max={quota.limit}
          aria-label={label}
          getAriaValueText={() =>
            t({ id: "{used} of {limit} used", message: `${used} of ${limit} used` })
          }
          className={cn(
            "h-1 bg-foreground/12",
            !quota.canCreate && "[&_[data-slot=progress-indicator]]:bg-destructive",
          )}
        />
      ) : null}
    </>
  );
}
