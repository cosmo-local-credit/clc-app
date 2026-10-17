import { isHttpUrl } from "@clc/core/lib/contact";
import {
  formatCompactUnitOfAccountDisplayValue,
  formatOfferingDisplayValue,
  formatVoucherUnitValue,
} from "@clc/core/features/market/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
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
import { isAddress, type Address, zeroAddress } from "viem";

import { AddToCatalogButton } from "#/components/catalogs/add-to-catalog-button";
import { ReviewStars } from "#/components/reviews/review-editor";
import { Button } from "#/components/ui/button";
import { TagBadge } from "#/components/ui/tag-badge";
import { VoucherAvatar } from "#/components/wallet";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useVoucherReviewSummary } from "#/features/reviews/hooks/use-voucher-reviews";
import { useAllAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { openDefaultMaps } from "#/lib/default-maps";
import { cn } from "#/lib/utils";

export type VoucherBalanceSummary =
  | { status: "hidden"; hasPositiveBalance: false }
  | { status: "loading"; hasPositiveBalance: false }
  | { status: "unavailable"; hasPositiveBalance: false; retry: () => void; retrying: boolean }
  | {
      status: "ready";
      hasPositiveBalance: boolean;
      amount: string;
      symbol: string;
      unitValue: { value: string; unit: string } | null;
    };

/**
 * One authoritative, complete holdings lookup for both voucher surfaces.
 * The voucher catalog supplies only the informational claim rate; no chain
 * read is needed to explain the wallet's indexed token balance.
 */
export function useVoucherBalanceSummary({
  address,
  symbol,
  decimals,
  voucherValue,
  voucherUoa,
}: {
  address: string;
  symbol: string;
  decimals?: number | null;
  voucherValue?: string | null;
  voucherUoa?: string | null;
}): VoucherBalanceSummary {
  const { i18n } = useLingui();
  const auth = useAuthStatus();
  const accountAddress = auth.isAuthenticated ? auth.session?.address : undefined;
  const holdings = useAllAccountTokens(accountAddress);

  if (auth.isLoading) return { status: "loading", hasPositiveBalance: false };
  if (!auth.isAuthenticated || !accountAddress) {
    return { status: "hidden", hasPositiveBalance: false };
  }
  if (holdings.isPending) return { status: "loading", hasPositiveBalance: false };
  if (holdings.isError) {
    return {
      status: "unavailable",
      hasPositiveBalance: false,
      retry: () => void holdings.refetch(),
      retrying: holdings.isFetching,
    };
  }

  const holding = holdings.tokens.find(
    (token) => token.tokenAddress.toLowerCase() === address.toLowerCase(),
  );
  const rawBalance = holding?.balance ?? "0";
  const tokenDecimals = holding?.tokenDecimals ?? decimals ?? 0;
  if (!/^\d+$/.test(rawBalance) || !Number.isInteger(tokenDecimals) || tokenDecimals < 0) {
    return {
      status: "unavailable",
      hasPositiveBalance: false,
      retry: () => void holdings.refetch(),
      retrying: holdings.isFetching,
    };
  }

  const canonicalAmount = formatTokenAmount(rawBalance, tokenDecimals, tokenDecimals);
  const localizedAmount = formatOfferingDisplayValue(
    canonicalAmount,
    i18n.locales?.[0] ?? i18n.locale,
  );
  const unitValue = formatVoucherUnitValue(
    canonicalAmount,
    voucherValue ?? null,
    voucherUoa ?? null,
  );
  const localizedUnitValue = unitValue
    ? formatCompactUnitOfAccountDisplayValue(unitValue.value, i18n.locales?.[0] ?? i18n.locale)
    : null;

  return {
    status: "ready",
    hasPositiveBalance: BigInt(rawBalance) > 0n,
    amount: localizedAmount ?? formatTokenAmount(rawBalance, tokenDecimals),
    symbol: holding?.tokenSymbol || symbol,
    unitValue:
      unitValue && localizedUnitValue ? { value: localizedUnitValue, unit: unitValue.unit } : null,
  };
}

function VoucherBalanceSummaryLine({
  balance,
  className,
}: {
  balance: VoucherBalanceSummary;
  className?: string;
}) {
  const { t } = useLingui();
  if (balance.status === "hidden") return null;

  return (
    <div
      aria-label={t`Your Balance`}
      className={cn("flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1", className)}
    >
      <span className="font-medium text-muted-foreground text-xs">
        <Trans>Your Balance</Trans>
      </span>
      {balance.status === "loading" ? (
        <span className="text-muted-foreground text-xs">
          <Trans>Loading…</Trans>
        </span>
      ) : balance.status === "unavailable" ? (
        <>
          <span className="text-destructive text-xs">
            <Trans>Unavailable</Trans>
          </span>
          <Button
            type="button"
            variant="ghost"
            tap
            pending={balance.retrying}
            onClick={balance.retry}
          >
            <Trans>Retry</Trans>
          </Button>
        </>
      ) : (
        <span dir="ltr" className="font-semibold text-sm tabular-nums">
          {balance.amount} {balance.symbol}
          {balance.unitValue ? (
            <span className="text-muted-foreground">
              {" "}
              ({balance.unitValue.value} {balance.unitValue.unit})
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
}

/** Shared identity, balance, review, tags, and actions for page and sheet. */
export function VoucherIdentitySummary({
  address,
  name,
  symbol,
  iconUrl,
  title,
  headerActions,
  onIdentityClick,
  onIdentityDoubleClick,
  avatarSize,
  balance,
  place,
  tags,
  ownerAddress,
  locationName,
  lat,
  lng,
  phone,
  website,
  catalogResourceId,
  catalogAddress,
  className,
}: {
  address: string;
  name: string;
  symbol: string;
  iconUrl?: string | null;
  title: ReactNode;
  headerActions?: ReactNode;
  onIdentityClick?: () => void;
  onIdentityDoubleClick?: () => void;
  avatarSize: 40 | 56;
  balance: VoucherBalanceSummary;
  place?: string | null;
  tags?: string[] | null;
  ownerAddress?: string | null;
  locationName?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  website?: string | null;
  catalogResourceId?: string | null;
  catalogAddress?: Address | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-start gap-1">
        <div
          data-voucher-identity=""
          className={cn(
            "flex min-w-0 flex-1 items-start gap-3 select-none",
            onIdentityClick && "cursor-pointer",
          )}
          onClick={onIdentityClick}
          onDoubleClick={onIdentityDoubleClick}
        >
          <VoucherAvatar
            address={address}
            symbol={symbol}
            iconUrl={iconUrl ?? null}
            size={avatarSize}
          />
          <div className="min-w-0 flex-1">
            {title}
            <VoucherBalanceSummaryLine balance={balance} className="mt-1.5" />
          </div>
        </div>
        {headerActions ? <div className="flex shrink-0 items-center">{headerActions}</div> : null}
      </div>

      <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground text-xs">
        <VoucherReviewSummaryContent address={address} place={place} />
      </p>
      <VoucherTagList tags={tags} className="mt-2" />
      <VoucherActionRow
        address={address}
        name={name}
        ownerAddress={ownerAddress}
        hasPositiveBalance={balance.hasPositiveBalance}
        locationName={locationName}
        lat={lat}
        lng={lng}
        phone={phone}
        website={website}
        catalogResourceId={catalogResourceId}
        catalogAddress={catalogAddress}
        className="mt-3"
      />
    </div>
  );
}

/**
 * The voucher-level rating used by both the map sheet and complete voucher page.
 * Keeping the query here also guarantees the summary shares the full reviews
 * panel's public React Query cache entry.
 */
function VoucherReviewSummaryContent({
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
      <span className="tabular-nums">{formattedAverage}</span>
      <ReviewStars stars={reviewAverage} />
      <span className="tabular-nums">({formattedReviewCount})</span>
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

function VoucherTagList({ tags, className }: { tags?: string[] | null; className?: string }) {
  if (!tags || tags.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.slice(0, 3).map((tag) => (
        <TagBadge key={tag} tag={tag} />
      ))}
    </div>
  );
}

function VoucherActionRow({
  address,
  name,
  ownerAddress,
  hasPositiveBalance,
  locationName,
  lat,
  lng,
  phone,
  website,
  catalogResourceId,
  catalogAddress,
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
  catalogResourceId?: string | null;
  catalogAddress?: Address | null;
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
      <Button asChild tap>
        <Link to="/market" search={{ scope: "pools", out_voucher: address.toLowerCase() }}>
          <RiHandCoinLine aria-hidden="true" />
          <Trans>Get</Trans>
        </Link>
      </Button>
      {hasPositiveBalance ? (
        <Button asChild variant="outline" tap>
          <Link to="/wallet/send" search={{ token: address }}>
            <RiSendPlane2Line aria-hidden="true" />
            <Trans>Send</Trans>
          </Link>
        </Button>
      ) : null}
      {hasPositiveBalance && verifiedOwnerAddress ? (
        <Button asChild variant="outline" tap>
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
          tap
          onClick={() => openDefaultMaps({ label: locationName ?? name, lat, lng })}
        >
          <RiNavigationLine aria-hidden="true" />
          <Trans>Directions</Trans>
        </Button>
      ) : null}
      {phone ? (
        <Button asChild variant="outline" tap>
          <a href={`tel:${phone}`}>
            <RiPhoneLine aria-hidden="true" />
            <Trans>Call</Trans>
          </a>
        </Button>
      ) : null}
      {verifiedWebsite ? (
        <Button asChild variant="outline" tap>
          <a href={verifiedWebsite} target="_blank" rel="noreferrer noopener">
            <RiGlobalLine aria-hidden="true" />
            <Trans>Website</Trans>
          </a>
        </Button>
      ) : null}
      {catalogResourceId && catalogAddress ? (
        <AddToCatalogButton
          kind="voucher"
          resourceId={catalogResourceId}
          address={catalogAddress}
          tap
        />
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
      className={cn("border-0 text-muted-foreground", className)}
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
