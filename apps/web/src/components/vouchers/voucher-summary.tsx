import { isHttpUrl } from "@clc/core/lib/contact";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  RiCoinLine,
  RiFileCopyLine,
  RiGlobalLine,
  RiHandCoinLine,
  RiNavigationLine,
  RiPhoneLine,
  RiSendPlane2Line,
  RiShareLine,
} from "react-icons/ri";
import { toast } from "sonner";
import { isAddress, zeroAddress } from "viem";

import { ReviewStars } from "#/components/reviews/review-editor";
import { Button } from "#/components/ui/button";
import { TagBadge } from "#/components/ui/tag-badge";
import { useVoucherReviewSummary } from "#/features/reviews/hooks/use-voucher-reviews";
import { openDefaultMaps } from "#/lib/default-maps";
import { cn } from "#/lib/utils";

/** A 36 px pill whose invisible inset keeps the complete target at 44 px. */
export const VOUCHER_ACTION_PILL =
  "relative h-9 shrink-0 gap-1.5 px-3 before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']";

/**
 * The voucher-level rating used by both the map sheet and complete voucher page.
 * Keeping the query here also guarantees the summary shares the full reviews
 * panel's public React Query cache entry.
 */
export function VoucherReviewSummaryContent({
  address,
  place,
}: {
  address: string;
  place?: string | null;
}) {
  const { i18n } = useLingui();
  const reviewQuery = useVoucherReviewSummary(address);
  const reviewCount = reviewQuery.summary?.total ?? 0;
  const reviewAverage = reviewCount > 0 ? (reviewQuery.summary?.average ?? 0) : 0;
  const numberLocale = i18n.locales?.[0] ?? i18n.locale;
  const formattedAverage = new Intl.NumberFormat(numberLocale, {
    maximumFractionDigits: 1,
  }).format(reviewAverage);
  const formattedReviewCount = new Intl.NumberFormat(numberLocale).format(reviewCount);

  return (
    <>
      <span className="font-mono tabular-nums">{formattedAverage}</span>
      <ReviewStars stars={reviewAverage} />
      <span className="font-mono tabular-nums">({formattedReviewCount})</span>
      {place ? (
        <>
          <span aria-hidden="true">·</span>
          <span dir="auto" className="min-w-0 truncate">
            {place}
          </span>
        </>
      ) : null}
    </>
  );
}

export function VoucherTagList({
  tags,
  className,
}: {
  tags?: string[] | null;
  className?: string;
}) {
  if (!tags || tags.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.slice(0, 3).map((tag) => (
        <TagBadge key={tag} tag={tag} />
      ))}
    </div>
  );
}

export function VoucherActionRow({
  address,
  name,
  ownerAddress,
  hasPositiveBalance,
  locationName,
  lat,
  lng,
  phone,
  website,
  className,
}: {
  address: string;
  name: string;
  ownerAddress?: string | null;
  hasPositiveBalance: boolean;
  locationName?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  website?: string | null;
  className?: string;
}) {
  const { t } = useLingui();
  const coordinates = typeof lat === "number" && typeof lng === "number";
  const verifiedOwnerAddress =
    ownerAddress &&
    isAddress(ownerAddress, { strict: false }) &&
    ownerAddress.toLowerCase() !== zeroAddress
      ? ownerAddress
      : null;
  const verifiedWebsite = website && isHttpUrl(website) ? website : null;

  return (
    <div
      className={cn("flex flex-wrap gap-2 py-1", className)}
      role="group"
      aria-label={t`Voucher actions`}
    >
      <Button asChild size="sm" className={VOUCHER_ACTION_PILL}>
        <Link to="/market" search={{ scope: "pools", out_voucher: address.toLowerCase() }}>
          <RiHandCoinLine aria-hidden="true" />
          <Trans>Get</Trans>
        </Link>
      </Button>
      {hasPositiveBalance ? (
        <Button asChild variant="outline" size="sm" className={cn(VOUCHER_ACTION_PILL, "bg-card")}>
          <Link to="/wallet/send" search={{ token: address }}>
            <RiSendPlane2Line aria-hidden="true" />
            <Trans>Send</Trans>
          </Link>
        </Button>
      ) : null}
      {hasPositiveBalance && verifiedOwnerAddress ? (
        <Button asChild variant="outline" size="sm" className={cn(VOUCHER_ACTION_PILL, "bg-card")}>
          <Link
            to="/wallet/send/amount"
            search={{ token: address, recipient: verifiedOwnerAddress }}
          >
            <RiCoinLine aria-hidden="true" />
            <Trans>Redeem</Trans>
          </Link>
        </Button>
      ) : null}
      {coordinates || locationName ? (
        <Button
          variant="outline"
          size="sm"
          className={cn(VOUCHER_ACTION_PILL, "bg-card")}
          onClick={() => openDefaultMaps({ label: locationName ?? name, lat, lng })}
        >
          <RiNavigationLine aria-hidden="true" />
          <Trans>Directions</Trans>
        </Button>
      ) : null}
      {phone ? (
        <Button asChild variant="outline" size="sm" className={cn(VOUCHER_ACTION_PILL, "bg-card")}>
          <a href={`tel:${phone}`}>
            <RiPhoneLine aria-hidden="true" />
            <Trans>Call</Trans>
          </a>
        </Button>
      ) : null}
      {verifiedWebsite ? (
        <Button asChild variant="outline" size="sm" className={cn(VOUCHER_ACTION_PILL, "bg-card")}>
          <a href={verifiedWebsite} target="_blank" rel="noreferrer noopener">
            <RiGlobalLine aria-hidden="true" />
            <Trans>Website</Trans>
          </a>
        </Button>
      ) : null}
    </div>
  );
}

/** Native share when available, with the existing explicit copy fallback. */
export function ShareVoucherButton({
  name,
  address,
  destination = "map",
  className,
}: {
  name: string;
  address: string;
  destination?: "map" | "detail";
  className?: string;
}) {
  const { t } = useLingui();
  const [copyOnly, setCopyOnly] = useState(false);
  const label = copyOnly ? t`Copy link` : t`Share`;
  const Icon = copyOnly ? RiFileCopyLine : RiShareLine;

  function link() {
    return destination === "detail"
      ? `${window.location.origin}/vouchers/${address}`
      : `${window.location.origin}/?voucher=${address}`;
  }

  function copy() {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy link`);
      return;
    }
    void navigator.clipboard
      .writeText(link())
      .then(() => toast.success(t`Link copied`))
      .catch(() => toast.error(t`Couldn't copy link`));
  }

  async function share() {
    if (!navigator.share) {
      copy();
      return;
    }
    try {
      await navigator.share({ title: name, url: link() });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCopyOnly(true);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className={cn("size-11 shrink-0 border-0 text-muted-foreground", className)}
      aria-label={label}
      onClick={() => {
        if (copyOnly) copy();
        else void share();
      }}
    >
      <Icon className="size-5" aria-hidden="true" />
    </Button>
  );
}
