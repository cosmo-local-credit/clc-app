import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { DeskCanvas } from "#/desktop/ui/page";
import { DeskStep, DeskStepper, type DeskStepState } from "#/desktop/ui/stepper";
import { CreateVoucherFlow, type VoucherCreateStep } from "#/features/vouchers/ui";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { cn } from "#/lib/utils";

const STEPS: { id: VoucherCreateStep; label: ReactNode }[] = [
  { id: "voucher", label: <Trans>Voucher</Trans> },
  { id: "place", label: <Trans>Where and what for</Trans> },
  { id: "review", label: <Trans>Confirm & publish</Trans> },
];

/**
 * The flow is the phone's, restyled in place: its own usage line moves to the
 * meter under the steps, its full-width submit row becomes an end-aligned
 * footer, and its limit message reads as a notice.
 */
const FLOW_CLASS = cn(
  // The usage line the flow prints above its form; the meter replaces it.
  "[&>div>:first-child:not(form)]:hidden",
  // Footer: a top rule, the action at the end.
  "[&_form>.mt-auto]:mt-6 [&_form>.mt-auto]:flex [&_form>.mt-auto]:justify-end",
  "[&_form>.mt-auto]:border-border [&_form>.mt-auto]:border-t [&_form>.mt-auto]:pt-4",
  "[&_form>.mt-auto_button]:w-auto [&_form>.mt-auto_button]:min-w-28",
);

/** The flow's limit branch: a title, then the usage block, shown as a notice. */
const LIMIT_CLASS = cn(
  "[&_h1+*]:border [&_h1+*]:border-border [&_h1+*]:border-s-[3px] [&_h1+*]:border-s-primary",
  "[&_h1+*]:bg-card [&_h1+*]:px-4 [&_h1+*]:py-3.5 [&_h1+*_p:last-child]:text-foreground",
);

export function CreateVoucherDesk({ step }: { step: VoucherCreateStep }) {
  const { t } = useLingui();
  const usage = useResourceUsage();
  const quota = usage.data?.vouchers;
  const blocked = usage.isError || (quota !== undefined && !quota.canCreate);
  const current = STEPS.findIndex((entry) => entry.id === step);
  return (
    <DeskCanvas
      width="read"
      className="grid-cols-[200px_minmax(0,520px)_minmax(0,1fr)] items-start gap-8"
    >
      <div className="sticky top-7 grid content-start gap-5">
        <DeskStepper label={t`Create voucher`}>
          {STEPS.map((entry, index) => {
            const state: DeskStepState =
              index < current ? "complete" : index === current ? "current" : "upcoming";
            return (
              <DeskStep
                key={entry.id}
                index={index + 1}
                label={entry.label}
                state={state}
                wrap={
                  state === "complete" || state === "current"
                    ? (body) => (
                        <Link to="/vouchers/create/$step" params={{ step: entry.id }}>
                          {body}
                        </Link>
                      )
                    : undefined
                }
              />
            );
          })}
        </DeskStepper>
        {quota ? <UsageMeter quota={quota} /> : null}
      </div>
      <div
        className={cn(
          "min-w-0",
          blocked ? LIMIT_CLASS : FLOW_CLASS,
          // The "Vouchers: 1/1" count repeats the meter beside it.
          blocked && quota && "[&_h1+*>p:first-child:not(:last-child)]:hidden",
        )}
      >
        <CreateVoucherFlow step={step} embedded advancedDefaultOpen />
      </div>
      <aside
        className="grid content-start gap-1 border border-border bg-card px-4 py-3.5"
        aria-labelledby="desk-voucher-guidance-title"
      >
        <p id="desk-voucher-guidance-title" className="font-heading text-sm font-semibold">
          <Trans>What's a voucher?</Trans>
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <Trans>
            A voucher acts like a gift card for your offers. When someone redeems your voucher, you
            are committing to provide them with your offers.
          </Trans>
        </p>
      </aside>
    </DeskCanvas>
  );
}

function UsageMeter({
  quota,
}: {
  quota: { used: number; limit: number; unlimited: boolean; canCreate: boolean };
}) {
  const { i18n } = useLingui();
  const digits = new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale);
  const used = digits.format(quota.used);
  const limit = digits.format(quota.limit);
  // Unlimited has no denominator; a sliver says "some used" without a scale.
  const fill = quota.unlimited
    ? quota.used > 0
      ? 8
      : 0
    : quota.limit > 0
      ? Math.min(100, (quota.used / quota.limit) * 100)
      : 100;
  return (
    <div className="grid gap-1.5 border-border border-t pt-3.5">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {quota.unlimited ? (
          <Trans id="{used} used · Unlimited">{used} used · Unlimited</Trans>
        ) : (
          <Trans id="{used} of {limit} used">
            {used} of {limit} used
          </Trans>
        )}
      </p>
      <div className="h-1 overflow-hidden rounded-full bg-foreground/12" aria-hidden="true">
        <div
          className={cn("h-full", quota.canCreate ? "bg-primary" : "bg-destructive")}
          style={{ width: `${fill}%` }}
        />
      </div>
    </div>
  );
}
