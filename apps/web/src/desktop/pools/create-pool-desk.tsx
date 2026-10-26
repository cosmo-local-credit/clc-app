import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { DeskCanvas } from "#/desktop/ui/page";
import { DeskStep, DeskStepper, type DeskStepState } from "#/desktop/ui/stepper";
import { CreatePoolFlow, type PoolCreateStep } from "#/features/pools/ui";

const STEPS: { id: PoolCreateStep; label: ReactNode }[] = [
  { id: "pool", label: <Trans>Create pool</Trans> },
  { id: "place", label: <Trans>Where and what for</Trans> },
  { id: "review", label: <Trans>Confirm & publish</Trans> },
];

export function CreatePoolDesk({ step }: { step: PoolCreateStep }) {
  const { t } = useLingui();
  const current = STEPS.findIndex((entry) => entry.id === step);
  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 shrink-0 overflow-auto border-border border-e px-6 py-7">
        <DeskStepper label={t`Create pool`}>
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
                        <Link to="/pools/create/$step" params={{ step: entry.id }}>
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
          <CreatePoolFlow step={step} embedded advancedDefaultOpen />
        </DeskCanvas>
      </div>
      <aside className="w-[380px] shrink-0 overflow-auto border-border border-s bg-card p-4">
        <PoolExplainer />
      </aside>
    </div>
  );
}

function PoolExplainer() {
  return (
    <div className="border border-info/30 bg-card" aria-labelledby="desk-pool-guidance-title">
      <p
        id="desk-pool-guidance-title"
        className="border-info/20 border-b bg-info/[0.08] px-4 py-2.5 font-semibold text-info text-sm leading-tight"
      >
        <Trans>What's a pool?</Trans>
      </p>
      <p className="px-4 py-3 text-muted-foreground text-sm leading-snug">
        <Trans>
          A pool holds vouchers together so members can swap between them at a published value.
        </Trans>
      </p>
    </div>
  );
}
