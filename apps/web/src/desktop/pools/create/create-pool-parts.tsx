import type { PoolCreateInput } from "@clc/core/features/pools/logic";
import { isHttpUrl } from "@clc/core/lib/contact";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiCheckLine, RiQuestionLine } from "react-icons/ri";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger } from "#/components/ui/popover";
import { Progress } from "#/components/ui/progress";
import { MarketAvatar } from "#/desktop/market/market-bits";
import { FullValue } from "#/desktop/ui/full-value";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskEyebrow, DeskRow, DeskRowList } from "#/desktop/ui/page";
import type {
  PoolCreateStep,
  useCreatePoolForm,
} from "#/features/pools/hooks/use-create-pool-form";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { cn } from "#/lib/utils";

export type CreatePoolController = ReturnType<typeof useCreatePoolForm>;

/**
 * `.form-foot`: a rule, then the step's actions at the end. The foot sticks to
 * the bottom of the scrolling canvas, so Next and Publish stay in reach on a
 * long step at 768px of height. The step's fields keep a scroll margin under
 * it, so focusing one never leaves it behind the foot.
 */
export function CreatePoolFormFoot({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-border border-t bg-background pt-4 pb-4">
      {children}
    </div>
  );
}

/** Applied to a step's root: a focused field scrolls clear of the sticky foot. */
export const FIELDS_CLEAR_OF_FOOT =
  "[&_:is(input,textarea,select,button,[contenteditable=true],[role=combobox])]:scroll-mb-24";

/**
 * The pool allowance beside the steps. A finite allowance reads "2 of 10 used"
 * over a determinate meter. An unlimited one has no denominator, so it is plain
 * metadata, "3 used · Unlimited", with no bar even at zero.
 */
export function PoolUsageDesk() {
  const { t, i18n } = useLingui();
  const query = useResourceUsage();
  const quota = query.data?.pools;
  const digits = new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale);

  if (query.isError) {
    return (
      <div role="alert" className="grid justify-items-start gap-2 text-xs">
        <p className="text-destructive">
          <Trans>Couldn't load resource limits.</Trans>
        </p>
        <Button variant="outline" pending={query.isFetching} onClick={() => void query.refetch()}>
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }
  if (!quota) {
    return (
      <p role="status" className="text-muted-foreground text-xs">
        <Trans>Loading…</Trans>
      </p>
    );
  }
  const used = digits.format(quota.used);
  const limit = digits.format(quota.limit);
  return (
    <div className="grid gap-1.5" aria-live="polite">
      <p className="text-muted-foreground text-xs">
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
          aria-label={t`Pools`}
          getAriaValueText={() => t`${used} of ${limit} used`}
          className={cn(
            "h-1 bg-foreground/12",
            !quota.canCreate && "[&_[data-slot=progress-indicator]]:bg-destructive",
          )}
        />
      ) : null}
      {quota.canCreate ? null : (
        <p className="text-destructive text-xs">
          <Trans>Limit reached</Trans>
        </p>
      )}
    </div>
  );
}

const STEPS: { id: PoolCreateStep; label: ReactNode }[] = [
  { id: "pool", label: <Trans>Create pool</Trans> },
  { id: "place", label: <Trans>Location and tags</Trans> },
  { id: "review", label: <Trans>Confirm and publish</Trans> },
];

type StepState = "complete" | "current" | "upcoming";

/**
 * The wizard's steps, in the shape the room allows. From 43rem of canvas they
 * are a vertical list beside the form; under that they are one compact row of
 * numbered markers above it that names only the current step. One list, so
 * there is one set of links and one place for assistive technology to read; the
 * container query only changes how it is laid out.
 */
export function PoolWizardSteps({ step }: { step: PoolCreateStep }) {
  const { t } = useLingui();
  const current = STEPS.findIndex((entry) => entry.id === step);
  return (
    <ol
      aria-label={t`Create pool`}
      className="flex items-center gap-2 @min-[43rem]:flex-col @min-[43rem]:items-stretch @min-[43rem]:gap-0"
    >
      {STEPS.map((entry, index) => {
        const state: StepState =
          index < current ? "complete" : index === current ? "current" : "upcoming";
        const last = index === STEPS.length - 1;
        const body = (
          <>
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full bg-card font-mono text-2xs font-semibold",
                state === "complete" && "bg-primary text-primary-foreground",
                state === "current" &&
                  "text-foreground shadow-[inset_0_0_0_2px_var(--color-primary)]",
                state === "upcoming" &&
                  "text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-foreground)_18%,transparent)]",
              )}
            >
              {state === "complete" ? <RiCheckLine className="size-3" /> : index + 1}
            </span>
            <span
              className={cn(
                "min-w-0 text-sm leading-6",
                state === "current" ? "font-semibold" : "font-medium text-muted-foreground",
                // Compact: only the current step has room for its name.
                state !== "current" && "sr-only @min-[43rem]:not-sr-only",
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
              "relative flex items-center gap-2 @min-[43rem]:block @min-[43rem]:pb-8 @min-[43rem]:last:pb-0",
              state === "current" ? "min-w-0 flex-1 @min-[43rem]:flex-none" : "shrink-0",
            )}
          >
            {state === "complete" ? (
              <Link
                to="/pools/create/$step"
                params={{ step: entry.id }}
                className="flex min-w-0 items-center gap-2 @min-[43rem]:gap-3"
              >
                {body}
              </Link>
            ) : (
              <span className="flex min-w-0 items-center gap-2 @min-[43rem]:gap-3">{body}</span>
            )}
            {last ? null : (
              <>
                <span
                  aria-hidden="true"
                  className="h-px w-4 shrink-0 bg-foreground/20 @min-[43rem]:hidden"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute start-[11px] top-7 bottom-1 hidden w-0.5 @min-[43rem]:block",
                    state === "complete" ? "bg-primary" : "bg-foreground/15",
                  )}
                />
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * "What's a pool?" on request, in the first step only. The explanation used
 * to sit beside every step; it is the same words, shown to someone who asks.
 */
export function PoolHelpDesk() {
  return (
    <PopoverRoot>
      <PopoverTrigger render={<Button variant="ghost" />}>
        <RiQuestionLine aria-hidden="true" />
        <Trans>What's a pool?</Trans>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-2">
        <PopoverTitle className="font-heading text-sm font-semibold">
          <Trans>What's a pool?</Trans>
        </PopoverTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          <Trans>
            A pool holds vouchers together so members can swap between them at a published value.
          </Trans>
        </p>
      </PopoverContent>
    </PopoverRoot>
  );
}

/** The live row the pool will be in the Pools list, drawn from the form as it is typed. */
export function PoolPreviewDesk({ pool }: { pool: CreatePoolController }) {
  const { i18n } = useLingui();
  return (
    <div className="grid gap-2.5">
      <DeskEyebrow>
        <Trans>Preview · Pools</Trans>
      </DeskEyebrow>
      <pool.form.Subscribe
        selector={(state) =>
          [
            state.values.name,
            state.values.symbol,
            state.values.location?.locationName,
            state.values.imageUrl,
          ] as const
        }
      >
        {([name, symbol, place, imageUrl]) => {
          const vouchers = i18n._("{count, plural, one {# voucher} other {# vouchers}}", {
            count: 0,
          });
          return (
            <DeskRowList>
              <DeskRow
                lead={
                  imageUrl ? (
                    <img
                      src={imageUrl}
                      alt=""
                      className="size-[34px] shrink-0 bg-muted object-cover"
                    />
                  ) : (
                    <MarketAvatar name={name || "?"} seed={name} kind="pool" />
                  )
                }
                title={<span dir="auto">{name.trim() || <Trans>Pool Name</Trans>}</span>}
                subtitle={place ? `${vouchers} · ${place}` : vouchers}
                trail={
                  symbol ? (
                    <Badge variant="outline" size="sm" className="font-mono" dir="ltr">
                      {symbol}
                    </Badge>
                  ) : null
                }
              />
            </DeskRowList>
          );
        }}
      </pool.form.Subscribe>
    </div>
  );
}

type PoolSummaryValues = Omit<PoolCreateInput, "location" | "acceptedTerms"> & {
  location?: PoolCreateInput["location"];
};

/**
 * What is being published, as one label/value grid. `full` adds the place and
 * contact rows the review step shows; the publishing screen keeps the core set.
 * The fee recipient is an address a person checks before publishing, so it
 * shows in full on request and copies at any stage.
 */
export function PoolSummaryDesk({
  values,
  full = false,
  onCopyFeeAddress,
}: {
  values: PoolSummaryValues;
  full?: boolean;
  /** Overrides how Copy reports back; the default copies and toasts. */
  onCopyFeeAddress?: (value: string) => void;
}) {
  const { t } = useLingui();
  const pricing =
    values.pricing === "relative"
      ? t`Relative pricing`
      : values.pricing === "oracle"
        ? t`Oracle pricing`
        : t`Equal value`;
  const feeAddress = values.feeAddress.trim();
  const hasFee = Number(values.feePolicyDefault) > 0;
  const copyFeeAddress = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy fee recipient`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Fee recipient copied`))
      .catch(() => toast.error(t`Couldn't copy fee recipient`));
  };
  const sans = (key: string, value: ReactNode) => (
    <span key={key} dir="auto" className="font-sans">
      {value}
    </span>
  );
  return (
    <DeskKV
      labelWidth={full ? "150px" : "110px"}
      rows={[
        [<Trans key="label">Pool</Trans>, sans("value", values.name)],
        [<Trans key="label">Symbol</Trans>, values.symbol],
        [<Trans key="label">Unit of account</Trans>, values.unitOfAccount],
        full
          ? [
              <Trans key="label">Description</Trans>,
              <span
                key="value"
                dir="auto"
                className="block whitespace-normal font-sans font-normal"
              >
                {values.description}
              </span>,
            ]
          : null,
        [<Trans key="label">Pricing</Trans>, sans("value", pricing)],
        [<Trans key="label">Swap fee</Trans>, `${values.feePolicyDefault}%`],
        full && hasFee
          ? [
              <Trans key="label">Fees held separately</Trans>,
              sans("value", values.feesDecoupled ? t`Yes` : t`No`),
            ]
          : null,
        hasFee
          ? [
              <Trans key="label">Fee recipient</Trans>,
              feeAddress === "" ? (
                sans("value", t`Your wallet`)
              ) : (
                <FullValue
                  key="value"
                  value={feeAddress}
                  copyLabel={t`Copy fee recipient`}
                  onCopy={onCopyFeeAddress ?? copyFeeAddress}
                />
              ),
            ]
          : null,
        full ? [<Trans key="label">Decimals</Trans>, "6"] : null,
        values.location?.locationName
          ? [<Trans key="label">Location</Trans>, sans("value", values.location.locationName)]
          : null,
        full && values.tags.length > 0
          ? [<Trans key="label">Tags</Trans>, sans("value", values.tags.join(", "))]
          : null,
        full && values.email ? [<Trans key="label">Email</Trans>, values.email] : null,
        full && values.website ? [<Trans key="label">Website</Trans>, values.website] : null,
        full && values.phone ? [<Trans key="label">Phone</Trans>, values.phone] : null,
        full && values.terms !== ""
          ? [
              <Trans key="label">Terms</Trans>,
              isHttpUrl(values.terms) ? values.terms : sans("value", t`Written below`),
            ]
          : null,
      ]}
    />
  );
}
