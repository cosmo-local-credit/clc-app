import type { PoolCreateInput } from "@clc/core/features/pools/logic";
import { isHttpUrl } from "@clc/core/lib/contact";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { SectionHeading } from "#/components/ui/section-heading";
import { EllipsizedAddress } from "#/components/wallet";
import { MarketAvatar } from "#/desktop/market/market-bits";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskEyebrow, DeskRow, DeskRowList } from "#/desktop/ui/page";
import type { useCreatePoolForm } from "#/features/pools/hooks/use-create-pool-form";
import { useResourceUsage } from "#/hooks/use-resource-usage";

export type CreatePoolController = ReturnType<typeof useCreatePoolForm>;

/** `.form-foot`: a rule, then the step's actions at the end. */
export function CreatePoolFormFoot({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 border-border border-t pt-4">
      {children}
    </div>
  );
}

/** The pool allowance under the stepper: "1 used · Unlimited" over a meter. */
export function PoolUsageDesk() {
  const { i18n } = useLingui();
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
  const ratio = quota.unlimited || quota.limit <= 0 ? 0 : Math.min(1, quota.used / quota.limit);
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
      <div className="h-1 overflow-hidden rounded-full bg-foreground/12" aria-hidden="true">
        <div
          className="h-full bg-primary"
          style={{ width: quota.unlimited ? "8%" : `${ratio * 100}%` }}
        />
      </div>
      {quota.canCreate ? null : (
        <p className="text-destructive text-xs">
          <Trans>Limit reached. Ask an administrator to increase your allowance.</Trans>
        </p>
      )}
    </div>
  );
}

/** The one concept explainer this flow carries. */
export function PoolExplainerDesk() {
  return (
    <section
      className="grid gap-1 border border-border bg-card px-4 py-3.5"
      aria-labelledby="desk-pool-guidance-title"
    >
      <SectionHeading as="h2" variant="group" id="desk-pool-guidance-title">
        <Trans>What's a pool?</Trans>
      </SectionHeading>
      <p className="text-muted-foreground text-sm">
        <Trans>
          A pool holds vouchers together so members can swap between them at a published value.
        </Trans>
      </p>
    </section>
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
 */
export function PoolSummaryDesk({
  values,
  full = false,
  onCopyFeeAddress,
}: {
  values: PoolSummaryValues;
  full?: boolean;
  /** Makes the fee recipient copyable once the pool is on chain. */
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
              ) : onCopyFeeAddress ? (
                <CopyableInfoValue
                  key="value"
                  value={feeAddress}
                  label={t`Copy fee recipient`}
                  onCopy={onCopyFeeAddress}
                />
              ) : (
                <EllipsizedAddress key="value" address={feeAddress} />
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
