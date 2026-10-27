import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useRef } from "react";

import { Button } from "#/components/ui/button";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";
import { DeskStep, DeskStepper, type DeskStepState } from "#/desktop/ui/stepper";
import {
  useCreateVoucherForm,
  type VoucherCreateStep,
} from "#/features/vouchers/hooks/use-create-voucher-form";
import { cn } from "#/lib/utils";
import { DetailsStep } from "./create/details-step";
import { PlaceStep } from "./create/place-step";
import { ReviewStep } from "./create/review-step";
import { CreateVoucherPreview } from "./create/voucher-preview";
import type { VoucherWizard } from "./create/wizard-bits";

const STEPS: { id: VoucherCreateStep; label: ReactNode }[] = [
  { id: "voucher", label: <Trans>Voucher</Trans> },
  { id: "place", label: <Trans>Where and what for</Trans> },
  { id: "review", label: <Trans>Confirm & publish</Trans> },
];

/**
 * `.page.wiz`: the 200px stepper with the usage meter under it, the 520px
 * form, and the live preview. The form state and step machine are the
 * phone flow's, from `useCreateVoucherForm`.
 */
export function CreateVoucherDesk({ step }: { step: VoucherCreateStep }) {
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const wizard = useCreateVoucherForm({
    step,
    revealAdvanced: () => {
      if (advancedRef.current) advancedRef.current.open = true;
    },
  });
  const quota = wizard.usage.data?.vouchers;

  return (
    <DeskCanvas
      width="read"
      className="grid-cols-[200px_minmax(0,520px)_minmax(0,1fr)] items-start gap-8"
    >
      <div className="sticky top-7 grid content-start gap-5">
        <WizardStepper step={step} wizard={wizard} />
        {quota ? <UsageMeter quota={quota} /> : null}
      </div>

      {wizard.blocked ? (
        <div className="grid min-w-0 content-start gap-[18px]">
          <DeskTitle>
            <Trans>Create voucher</Trans>
          </DeskTitle>
          <LimitNotice wizard={wizard} />
        </div>
      ) : (
        <form
          className="grid min-w-0 content-start gap-[18px]"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (step === "review") void wizard.form.handleSubmit();
          }}
        >
          {step === "voucher" ? (
            <DetailsStep wizard={wizard} advancedRef={advancedRef} />
          ) : step === "place" ? (
            <PlaceStep wizard={wizard} />
          ) : (
            <ReviewStep wizard={wizard} />
          )}
        </form>
      )}

      <aside className="sticky top-7 grid min-w-0 content-start gap-4">
        {step === "voucher" ? (
          <div className="grid gap-1 border border-border bg-card px-4 py-3.5">
            <p className="font-heading text-sm font-semibold">
              <Trans>What's a voucher?</Trans>
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              <Trans>
                A voucher acts like a gift card for your offers. When someone redeems your voucher,
                you are committing to provide them with your offers.
              </Trans>
            </p>
          </div>
        ) : null}
        {wizard.blocked ? null : (
          <CreateVoucherPreview wizard={wizard} showMap={step !== "voucher"} />
        )}
      </aside>
    </DeskCanvas>
  );
}

/** Steps as links back; the first step's description is what it produced. */
function WizardStepper({ step, wizard }: { step: VoucherCreateStep; wizard: VoucherWizard }) {
  const { t } = useLingui();
  const current = STEPS.findIndex((entry) => entry.id === step);
  return (
    <wizard.form.Subscribe selector={(state) => [state.values.name, state.values.supply] as const}>
      {([name, supply]) => (
        <DeskStepper label={t`Create voucher`}>
          {STEPS.map((entry, index) => {
            const state: DeskStepState =
              index < current ? "complete" : index === current ? "current" : "upcoming";
            const description =
              entry.id === "voucher" && state === "complete" && name.trim() ? (
                <span className="block truncate">
                  {name.trim()}
                  {supply.trim() ? (
                    <>
                      {" · "}
                      <span className="font-mono" dir="ltr">
                        {supply.trim()}
                      </span>
                    </>
                  ) : null}
                </span>
              ) : undefined;
            return (
              <DeskStep
                key={entry.id}
                index={index + 1}
                label={entry.label}
                description={description}
                state={state}
                wrap={
                  state === "complete"
                    ? (body) => (
                        <Link
                          to="/vouchers/create/$step"
                          params={{ step: entry.id }}
                          className="block min-w-0"
                        >
                          {body}
                        </Link>
                      )
                    : undefined
                }
              />
            );
          })}
        </DeskStepper>
      )}
    </wizard.form.Subscribe>
  );
}

/** The usage line under the steps: "1 used · Unlimited" over a 4px meter. */
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

/** Why the form is not shown: the allowance is used up, or could not be read. */
function LimitNotice({ wizard }: { wizard: VoucherWizard }) {
  const { usage } = wizard;
  return (
    <div
      role={usage.isError ? "alert" : undefined}
      className="grid gap-3 border border-border border-s-[3px] border-s-primary bg-card px-4 py-3.5 text-sm"
    >
      {usage.isError ? (
        <>
          <p>
            <Trans>Couldn't load resource limits.</Trans>
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              pending={usage.isFetching}
              onClick={() => void usage.refetch()}
            >
              <Trans>Retry</Trans>
            </Button>
          </div>
        </>
      ) : usage.data ? (
        <p>
          <Trans>Limit reached. Ask an administrator to increase your allowance.</Trans>
        </p>
      ) : (
        <p role="status" className="text-muted-foreground">
          <Trans>Loading…</Trans>
        </p>
      )}
    </div>
  );
}
