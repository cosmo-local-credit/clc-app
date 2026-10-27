import type {
  ResourceKind,
  ResourceUsage as ResourceUsageData,
} from "@clc/api/features/resource-limits/client";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { ReviewStars } from "#/components/reviews/review-editor";
import { useShareVoucher, type VoucherBalanceSummary } from "#/components/vouchers/voucher-summary";
import { useVoucherReviewSummary } from "#/features/reviews/hooks/use-voucher-reviews";
import { cn } from "#/lib/utils";

type Quota = ResourceUsageData[ResourceKind];

/** A section title with the owner's allowance beside it: "Offerings · 1 of 3 used". */
export function QuotaLabel({
  children,
  quota,
  pending,
  error,
}: {
  children: ReactNode;
  quota: Quota | undefined;
  pending: boolean;
  error: boolean;
}) {
  const { i18n } = useLingui();
  const digits = new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale);
  const used = quota ? digits.format(quota.used) : "";
  const limit = quota ? digits.format(quota.limit) : "";
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span>{children}</span>
      <span
        aria-live="polite"
        className={cn(
          "font-sans text-xs font-normal",
          quota && !quota.canCreate ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {error ? (
          <Trans>Unavailable</Trans>
        ) : pending || !quota ? (
          <Trans>Loading…</Trans>
        ) : quota.unlimited ? (
          <Trans id="{used} used · Unlimited">{used} used · Unlimited</Trans>
        ) : (
          <Trans id="{used} of {limit} used">
            {used} of {limit} used
          </Trans>
        )}
      </span>
    </span>
  );
}

/** "Your Balance 3,200.00 KFP (3,200 KES)", or nothing for a visitor. */
export function VoucherBalanceLine({ balance }: { balance: VoucherBalanceSummary }) {
  if (balance.status === "hidden") return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-x-1.5">
      <Trans>Your Balance</Trans>
      {balance.status === "loading" ? (
        <Trans>Loading…</Trans>
      ) : balance.status === "unavailable" ? (
        <>
          <span className="text-destructive">
            <Trans>Unavailable</Trans>
          </span>
          <Button type="button" variant="ghost" pending={balance.retrying} onClick={balance.retry}>
            <Trans>Retry</Trans>
          </Button>
        </>
      ) : (
        <span dir="ltr" className="truncate font-mono font-semibold text-foreground">
          {balance.amount} {balance.symbol}
          {balance.unitValue ? (
            <span className="text-muted-foreground">
              {" "}
              ({balance.unitValue.value} {balance.unitValue.unit})
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}

/** "4.8 ★★★★★ (32) · Kilifi": the public rating, from the reviews' own cache entry. */
export function VoucherRatingLine({
  address,
  place,
  stars = true,
}: {
  address: string;
  place?: string | null;
  /** The page title row shows one star glyph; the place panel shows five. */
  stars?: boolean;
}) {
  const { i18n } = useLingui();
  const review = useVoucherReviewSummary(address);
  const count = review.summary?.total ?? 0;
  const average = count > 0 ? (review.summary?.average ?? 0) : 0;
  const locale = i18n.locales?.[0] ?? i18n.locale;
  return (
    <span className="inline-flex min-w-0 items-center gap-x-1.5">
      <span className="font-mono font-semibold text-foreground">
        {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(average)}
      </span>
      {stars ? <ReviewStars stars={average} /> : <span aria-hidden="true">★</span>}
      <span className="font-mono">({new Intl.NumberFormat(locale).format(count)})</span>
      {place ? (
        <>
          <span aria-hidden="true">·</span>
          <span dir="auto" className="min-w-0 truncate">
            {place}
          </span>
        </>
      ) : null}
    </span>
  );
}

/** The share action as a 36px outline square; falls back to "Copy link" like the phone's. */
export function VoucherShareButton({
  name,
  address,
  className,
}: {
  name: string;
  address: string;
  className?: string;
}) {
  const { label, Icon, run } = useShareVoucher({ name, address, destination: "detail" });
  return (
    <Button variant="outline" size="icon" aria-label={label} className={className} onClick={run}>
      <Icon aria-hidden="true" />
    </Button>
  );
}
