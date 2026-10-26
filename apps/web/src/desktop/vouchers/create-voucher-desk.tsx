import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { DeskCanvas } from "#/desktop/ui/page";
import { DeskStep, DeskStepper, type DeskStepState } from "#/desktop/ui/stepper";
import { CreateVoucherFlow, type VoucherCreateStep } from "#/features/vouchers/ui";

const STEPS: { id: VoucherCreateStep; label: ReactNode }[] = [
  { id: "voucher", label: <Trans>Create voucher</Trans> },
  { id: "place", label: <Trans>Where and what for</Trans> },
  { id: "review", label: <Trans>Confirm & publish</Trans> },
];

export function CreateVoucherDesk({ step }: { step: VoucherCreateStep }) {
  const { t } = useLingui();
  const current = STEPS.findIndex((entry) => entry.id === step);
  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 shrink-0 overflow-auto border-border border-e px-6 py-7">
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
      </div>
      <div className="min-w-0 flex-1 overflow-auto">
        <DeskCanvas width="full">
          <CreateVoucherFlow step={step} embedded advancedDefaultOpen />
        </DeskCanvas>
      </div>
      <aside className="w-[380px] shrink-0 overflow-auto border-border border-s bg-card p-4">
        <VoucherExplainer />
      </aside>
    </div>
  );
}

function VoucherExplainer() {
  return (
    <div className="border border-primary/30 bg-card" aria-labelledby="desk-voucher-guidance-title">
      <p
        id="desk-voucher-guidance-title"
        className="border-primary/20 border-b bg-primary/[0.08] px-4 py-2.5 font-semibold text-primary text-sm leading-tight"
      >
        <Trans>What's a voucher?</Trans>
      </p>
      <p className="px-4 py-3 text-muted-foreground text-sm leading-snug">
        <Trans>
          A voucher acts like a gift card for your offers. When someone redeems your voucher, you
          are committing to provide them with your offers.
        </Trans>
      </p>
    </div>
  );
}
