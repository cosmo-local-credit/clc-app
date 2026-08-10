import { useLingui } from "@lingui/react/macro";

import { Progress } from "#/components/ui/progress";

type Props = {
  /** 1-based current step index within the flow. */
  step: number;
  /** Total steps in the flow. */
  total: number;
};

/**
 * Continuous progress bar + "N of M" label for multi-step flows (signup,
 * voucher creation). Matches the Lyra progress row.
 */
export function StepProgress({ step, total }: Props) {
  const { t } = useLingui();
  const clampedTotal = Math.max(total, 1);
  const clampedStep = Math.min(Math.max(step, 1), clampedTotal);
  const value = (clampedStep / clampedTotal) * 100;
  const label = t`${clampedStep} of ${clampedTotal}`;

  return (
    <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <Progress
        value={value}
        max={100}
        aria-label={t`Step ${clampedStep} of ${clampedTotal}`}
        getAriaValueText={() => label}
      />
      <span className="text-muted-foreground text-xs tabular-nums">{label}</span>
    </div>
  );
}
