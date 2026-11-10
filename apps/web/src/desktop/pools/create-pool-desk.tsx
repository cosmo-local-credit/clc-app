import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

import {
  PoolPreviewDesk,
  PoolUsageDesk,
  PoolWizardSteps,
} from "#/desktop/pools/create/create-pool-parts";
import { PlaceStepDesk } from "#/desktop/pools/create/place-step-desk";
import { PoolStepDesk } from "#/desktop/pools/create/pool-step-desk";
import { ReviewStepDesk } from "#/desktop/pools/create/review-step-desk";
import { DeskCanvas } from "#/desktop/ui/page";
import {
  type PoolCreateStep,
  useCreatePoolForm,
} from "#/features/pools/hooks/use-create-pool-form";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";

/**
 * The wizard is laid out against the canvas it is given, which the desktop
 * shell exposes as a size container. The voucher wizard makes the same
 * decisions:
 *
 * - under 43rem: one column. The steps are a compact row above the form and
 *   the preview follows the form.
 * - from 43rem: a 160-200px side stepper and a 440-560px form. The preview
 *   sits under the form.
 * - from 62rem: the preview takes a third column. The tracks' minimums (160 +
 *   440 + 240 + two 32px gaps) always fit by then, so the preview is never
 *   narrower than 240px and never collapses to nothing.
 *
 * The preview is in every one of these layouts; only where it sits changes.
 */
const GRID = [
  "grid-cols-1 items-start gap-x-8",
  "@min-[43rem]:grid-cols-[minmax(160px,200px)_minmax(440px,560px)]",
  "@min-[62rem]:grid-cols-[minmax(160px,200px)_minmax(440px,560px)_minmax(240px,1fr)]",
].join(" ");
const RAIL =
  "grid content-start gap-5 @min-[43rem]:sticky @min-[43rem]:top-7 @min-[43rem]:col-start-1 @min-[43rem]:row-start-1 @min-[43rem]:row-span-2 @min-[62rem]:row-span-1";
const MAIN = "min-w-0 @min-[43rem]:col-start-2 @min-[43rem]:row-start-1";
const PREVIEW =
  "grid min-w-0 content-start gap-4 @min-[43rem]:col-start-2 @min-[43rem]:row-start-2 @min-[62rem]:sticky @min-[62rem]:top-7 @min-[62rem]:col-start-3 @min-[62rem]:row-start-1";

/** The steps and the pool allowance, the step's form, and a live preview of the Pools row. */
export function CreatePoolDesk({ step }: { step: PoolCreateStep }) {
  const { t } = useLingui();
  // Advanced holds the symbol, pricing and fees, and starts folded. A restored
  // draft opens it, and so does Next being refused for a field inside it; the
  // first step also opens it on arrival when a value there is not the default.
  const restored = usePoolCreateDraft((state) => state.draft !== null);
  const [advancedOpen, setAdvancedOpen] = useState(restored);
  const pool = useCreatePoolForm({ step, revealAdvanced: () => setAdvancedOpen(true) });

  return (
    <DeskCanvas width="read" className={GRID}>
      <div className={RAIL}>
        <PoolWizardSteps step={step} />
        <div className="border-border border-t pt-3.5">
          <PoolUsageDesk />
        </div>
      </div>

      <div className={MAIN}>
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

      <aside aria-label={t`Preview`} className={PREVIEW}>
        <PoolPreviewDesk pool={pool} />
      </aside>
    </DeskCanvas>
  );
}
