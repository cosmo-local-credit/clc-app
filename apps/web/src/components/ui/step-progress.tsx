import { useLingui } from "@lingui/react/macro";

import { Progress } from "#/components/ui/progress";

type Props = {
  /** Current step or completed-item count within the flow. */
  step: number;
  /** Total steps in the flow. */
  total: number;
  label?: string;
  ariaLabel?: string;
  className?: string;
};

/**
 * Continuous progress bar + "N of M" label for multi-step flows (signup,
 * voucher creation). Matches the Lyra progress row.
 */
export function StepProgress({ step, total, label, ariaLabel, className = "mb-5" }: Props) {
  const { t } = useLingui();
  const clampedTotal = Math.max(total, 1);
  const clampedStep = Math.min(Math.max(step, 0), clampedTotal);
  const value = (clampedStep / clampedTotal) * 100;
  const visibleLabel = label ?? t`${clampedStep} of ${clampedTotal}`;

  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 ${className}`.trim()}>
      <Progress
        value={value}
        max={100}
        aria-label={ariaLabel ?? t`Step ${clampedStep} of ${clampedTotal}`}
        getAriaValueText={() => visibleLabel}
      />
      <span className="text-muted-foreground text-xs tabular-nums">{visibleLabel}</span>
    </div>
  );
}
