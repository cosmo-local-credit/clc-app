import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiCheckLine } from "react-icons/ri";

import { DeskStep, DeskStepper, type DeskStepState } from "#/desktop/ui/stepper";
import type { VoucherCreateStep } from "#/features/vouchers/hooks/use-create-voucher-form";
import { cn } from "#/lib/utils";
import type { VoucherWizard } from "./wizard-bits";

const STEPS: { id: VoucherCreateStep; label: ReactNode }[] = [
  { id: "voucher", label: <Trans>Voucher</Trans> },
  { id: "place", label: <Trans>Location and tags</Trans> },
  { id: "review", label: <Trans>Confirm and publish</Trans> },
];

/**
 * The wizard's steps, in the shape the room allows. From 43rem of canvas a
 * 160-200px side stepper sits beside a 440px form; under that the same steps
 * collapse to one compact row above the form. Both are always in the markup and
 * the container query picks one, so there is no measuring pass and no flash.
 */
export function WizardSteps({ step, wizard }: { step: VoucherCreateStep; wizard: VoucherWizard }) {
  const { t } = useLingui();
  const current = STEPS.findIndex((entry) => entry.id === step);
  const stateOf = (index: number): DeskStepState =>
    index < current ? "complete" : index === current ? "current" : "upcoming";
  return (
    <wizard.form.Subscribe selector={(state) => [state.values.name, state.values.supply] as const}>
      {([name, supply]) => (
        <>
          <div data-wizard-steps="side" className="hidden @min-[43rem]:block">
            <DeskStepper label={t`Create voucher`}>
              {STEPS.map((entry, index) => {
                const state = stateOf(index);
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
          </div>

          <ol
            data-wizard-steps="compact"
            aria-label={t`Create voucher`}
            className="flex items-center gap-2 @min-[43rem]:hidden"
          >
            {STEPS.map((entry, index) => {
              const state = stateOf(index);
              const body = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-2xs font-semibold",
                      state === "complete" && "bg-primary text-primary-foreground",
                      state === "current" && "border-2 border-primary bg-card text-foreground",
                      state === "upcoming" &&
                        "border border-foreground/25 bg-card text-muted-foreground",
                    )}
                  >
                    {state === "complete" ? <RiCheckLine className="size-3" /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 truncate text-sm",
                      state === "current" ? "font-semibold" : "sr-only",
                    )}
                  >
                    {entry.label}
                  </span>
                </>
              );
              return (
                <li
                  key={entry.id}
                  aria-current={state === "current" ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2",
                    state === "current" ? "min-w-0 flex-1" : "shrink-0",
                  )}
                >
                  {state === "complete" ? (
                    <Link
                      to="/vouchers/create/$step"
                      params={{ step: entry.id }}
                      className="flex min-w-0 items-center gap-2"
                    >
                      {body}
                    </Link>
                  ) : (
                    <span className="flex min-w-0 items-center gap-2">{body}</span>
                  )}
                  {index < STEPS.length - 1 ? (
                    <span aria-hidden="true" className="h-px w-4 shrink-0 bg-foreground/20" />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </wizard.form.Subscribe>
  );
}
