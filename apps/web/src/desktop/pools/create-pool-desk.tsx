import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { SectionHeading } from "#/components/ui/section-heading";
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
    <div className="grid w-full max-w-[1264px] grid-cols-[200px_minmax(0,520px)_minmax(0,1fr)] items-start gap-8 px-8 pt-7 pb-10">
      <div className="sticky top-7 min-w-0">
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
      <div className="min-w-0">
        <CreatePoolFlow step={step} embedded advancedDefaultOpen />
      </div>
      <aside className="sticky top-7 grid min-w-0 gap-4">
        <PoolExplainer />
      </aside>
    </div>
  );
}

function PoolExplainer() {
  return (
    <section
      className="grid gap-1 border border-border bg-card px-4 py-3.5"
      aria-labelledby="desk-pool-guidance-title"
    >
      <SectionHeading as="h2" variant="group" id="desk-pool-guidance-title">
        <Trans>What's a pool?</Trans>
      </SectionHeading>
      <p className="text-sm text-muted-foreground">
        <Trans>
          A pool holds vouchers together so members can swap between them at a published value.
        </Trans>
      </p>
    </section>
  );
}
