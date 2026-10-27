import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

import { DeskStep, DeskStepper, type DeskStepState } from "#/desktop/ui/stepper";
import {
  PoolExplainerDesk,
  PoolPreviewDesk,
  PoolUsageDesk,
} from "#/desktop/pools/create/create-pool-parts";
import { PlaceStepDesk } from "#/desktop/pools/create/place-step-desk";
import { PoolStepDesk } from "#/desktop/pools/create/pool-step-desk";
import { ReviewStepDesk } from "#/desktop/pools/create/review-step-desk";
import {
  type PoolCreateStep,
  useCreatePoolForm,
} from "#/features/pools/hooks/use-create-pool-form";

const STEPS: { id: PoolCreateStep; label: ReactNode }[] = [
  { id: "pool", label: <Trans>Create pool</Trans> },
  { id: "place", label: <Trans>Where and what for</Trans> },
  { id: "review", label: <Trans>Confirm & publish</Trans> },
];

/**
 * `.page.wiz`: the stepper and the pool allowance, the step's form at 520px,
 * and the concept explainer over a live preview of the Pools row.
 */
export function CreatePoolDesk({ step }: { step: PoolCreateStep }) {
  const { t } = useLingui();
  // Desktop has the room, so Advanced starts open.
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const pool = useCreatePoolForm({ step, revealAdvanced: () => setAdvancedOpen(true) });
  const current = STEPS.findIndex((entry) => entry.id === step);

  return (
    <div className="grid w-full max-w-[1264px] grid-cols-[200px_minmax(0,520px)_minmax(0,1fr)] items-start gap-8 px-8 pt-7 pb-10">
      <div className="sticky top-7 grid min-w-0 gap-4">
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
                  state === "complete"
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
        <div className="border-border border-t pt-3.5">
          <PoolUsageDesk />
        </div>
      </div>

      <div className="min-w-0">
        {step === "pool" ? (
          <PoolStepDesk
            pool={pool}
            advancedOpen={advancedOpen}
            onAdvancedOpenChange={setAdvancedOpen}
          />
        ) : step === "place" ? (
          <PlaceStepDesk pool={pool} />
        ) : (
          <ReviewStepDesk pool={pool} />
        )}
      </div>

      <aside className="sticky top-7 grid min-w-0 gap-4">
        <PoolExplainerDesk />
        <PoolPreviewDesk pool={pool} />
      </aside>
    </div>
  );
}
