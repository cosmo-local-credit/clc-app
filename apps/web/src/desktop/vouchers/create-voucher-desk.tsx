import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Progress } from "#/components/ui/progress";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";
import {
  useCreateVoucherForm,
  type VoucherCreateStep,
} from "#/features/vouchers/hooks/use-create-voucher-form";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";
import { cn } from "#/lib/utils";
import { DetailsStep } from "./create/details-step";
import { PlaceStep } from "./create/place-step";
import { ReviewStep } from "./create/review-step";
import { CreateVoucherPreview } from "./create/voucher-preview";
import type { VoucherWizard } from "./create/wizard-bits";
import { WizardSteps } from "./create/wizard-steps";

/**
 * The wizard is laid out against the canvas it is given, which the desktop
 * shell exposes as a size container:
 *
 * - under 43rem: one column. The steps are a compact row above the form and
 *   the preview follows the form.
 * - from 43rem: a 160-200px side stepper and a 440-560px form. The preview
 *   sits under the form.
 * - from 62rem: the preview takes a third column. The tracks' minimums (160 +
 *   440 + 240 + two 32px gaps) always fit by then, so the preview is never
 *   narrower than 240px and never collapses to nothing.
 */
const GRID = [
  "grid-cols-1 items-start gap-x-8",
  "@min-[43rem]:grid-cols-[minmax(160px,200px)_minmax(440px,560px)]",
  "@min-[62rem]:grid-cols-[minmax(160px,200px)_minmax(440px,560px)_minmax(240px,1fr)]",
].join(" ");
const RAIL =
  "grid content-start gap-5 @min-[43rem]:sticky @min-[43rem]:top-7 @min-[43rem]:col-start-1 @min-[43rem]:row-start-1 @min-[43rem]:row-span-2 @min-[62rem]:row-span-1";
const MAIN =
  "grid min-w-0 content-start gap-[18px] @min-[43rem]:col-start-2 @min-[43rem]:row-start-1";
const PREVIEW =
  "grid min-w-0 content-start gap-4 @min-[43rem]:col-start-2 @min-[43rem]:row-start-2 @min-[62rem]:sticky @min-[62rem]:top-7 @min-[62rem]:col-start-3 @min-[62rem]:row-start-1";

/**
 * The steps, the usage line, the form and the live preview. The form state and
 * step machine are the phone flow's, from `useCreateVoucherForm`.
 */
export function CreateVoucherDesk({ step }: { step: VoucherCreateStep }) {
  const { t } = useLingui();
  // Advanced hides the symbol, price and unit of account. It starts closed
  // unless a restored draft already carries values there, and opens itself when
  // Next is refused for one of them.
  const restored = useVoucherCreateDraft((state) => state.draft !== null);
  const [advancedOpen, setAdvancedOpen] = useState(restored);
  const wizard = useCreateVoucherForm({ step, revealAdvanced: () => setAdvancedOpen(true) });
  const quota = wizard.usage.data?.vouchers;

  return (
    <DeskCanvas width="read" className={GRID}>
      <div className={RAIL}>
        <WizardSteps step={step} wizard={wizard} />
        {quota ? <UsageMeter quota={quota} /> : null}
      </div>

      {wizard.blocked ? (
        <div className={MAIN}>
          <DeskTitle>
            <Trans>Create voucher</Trans>
          </DeskTitle>
          <LimitNotice wizard={wizard} />
        </div>
      ) : (
        <form
          className={MAIN}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (step === "review") void wizard.form.handleSubmit();
          }}
        >
          {step === "voucher" ? (
            <DetailsStep
              wizard={wizard}
              advanced={{ open: advancedOpen, onOpenChange: setAdvancedOpen }}
            />
          ) : step === "place" ? (
            <PlaceStep wizard={wizard} />
          ) : (
            <ReviewStep wizard={wizard} />
          )}
        </form>
      )}

      {wizard.blocked ? null : (
        <aside aria-label={t`Preview`} className={PREVIEW}>
          <CreateVoucherPreview wizard={wizard} showMap={step !== "voucher"} />
        </aside>
      )}
    </DeskCanvas>
  );
}

/**
 * The usage line under the steps. A finite allowance gets a determinate meter;
 * an unlimited one has no denominator, so it is just "3 used · Unlimited".
 */
function UsageMeter({
  quota,
}: {
  quota: { used: number; limit: number; unlimited: boolean; canCreate: boolean };
}) {
  const { t, i18n } = useLingui();
  const digits = new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale);
  const used = digits.format(quota.used);
  const limit = digits.format(quota.limit);
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
      {!quota.unlimited && quota.limit > 0 ? (
        <Progress
          value={Math.min(quota.used, quota.limit)}
          max={quota.limit}
          aria-label={t`Vouchers`}
          getAriaValueText={() => t`${used} of ${limit} used`}
          className={cn(
            "h-1 bg-foreground/12",
            !quota.canCreate && "[&_[data-slot=progress-indicator]]:bg-destructive",
          )}
        />
      ) : null}
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
