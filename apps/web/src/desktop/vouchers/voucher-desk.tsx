import { isHttpUrl } from "@clc/core/lib/contact";
import { useLingui, Trans } from "@lingui/react/macro";
import { Link, useSearch } from "@tanstack/react-router";
import {
  RiCoinLine,
  RiGlobalLine,
  RiHandCoinLine,
  RiNavigationLine,
  RiPhoneLine,
  RiSendPlane2Line,
} from "react-icons/ri";
import { isAddress, zeroAddress } from "viem";

import { AddToCatalogButton } from "#/components/catalogs/add-to-catalog-button";
import { Button } from "#/components/ui/button";
import { VoucherDetailSections } from "#/components/vouchers/voucher-detail-sections";
import {
  ShareVoucherButton,
  useVoucherBalanceSummary,
  VoucherIdentitySummary,
} from "#/components/vouchers/voucher-summary";
import { WALLET_TOKEN_BY_ID, type WalletToken } from "#/components/wallet";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";
import { useDeskTrailLabel } from "#/desktop/trail";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useAssetOwner } from "#/features/ownership/hooks/use-asset-owner";
import { usePoolVouchersInfinite } from "#/features/pools/hooks/use-pool-vouchers";
import { poolVoucherToWalletToken } from "#/features/pools/logic/pool-voucher-display";
import { useAllAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { openDefaultMaps } from "#/lib/default-maps";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { cn } from "#/lib/utils";

/** One cell of the action strip: icon over label, a rule between cells. */
const ACTION_CLASS =
  "w-full min-w-0 border-0 border-border border-e last:border-e-0 [&_svg:not([class*='size-'])]:size-[18px]";

/**
 * `.page.detail`: the header, the action strip and every section in the main
 * column; Info alone in a sticky 360px column that spans every row. The
 * sections are the phone's, laid onto this grid with `display: contents`, so
 * the page and the map sheet still share one component.
 */
const VOUCHER_PAGE_CLASS = cn(
  "grid w-full max-w-[1324px] min-w-0 grid-cols-[minmax(0,1fr)_360px]",
  "grid-rows-[auto_auto_auto_auto_auto_auto_1fr] items-start gap-x-6 gap-y-7 px-8 pt-7 pb-10",
  "[&>*]:col-start-1 [&>*]:min-w-0 [&>div>section]:col-start-1 [&>div>section]:min-w-0",
  "[&>div>section[aria-labelledby=voucher-section-info]]:col-start-2 [&>div>section[aria-labelledby=voucher-section-info]]:row-[1/-1]",
  "[&>div>section[aria-labelledby=voucher-section-info]]:sticky [&>div>section[aria-labelledby=voucher-section-info]]:top-7 [&>div>section[aria-labelledby=voucher-section-info]]:self-start",
  // The column is Info by position; its heading stays for screen readers.
  "[&>div>section[aria-labelledby=voucher-section-info]>h2]:sr-only",
  // Owner controls move under the facts, as in the mock.
  "[&>div>section[aria-labelledby=voucher-section-info]>div]:flex [&>div>section[aria-labelledby=voucher-section-info]>div]:flex-col [&>div>section[aria-labelledby=voucher-section-info]>div]:gap-3",
  "[&>div>section[aria-labelledby=voucher-section-info]>div]:space-y-0 [&>div>section[aria-labelledby=voucher-section-info]>div>section]:order-last",
);

export function VoucherDesk({ voucherAddress }: { voucherAddress: `0x${string}` }) {
  const { t } = useLingui();
  const search = useSearch({ strict: false }) as { poolAddress?: unknown };
  const poolAddress = typeof search.poolAddress === "string" ? search.poolAddress : undefined;
  const auth = useAuthStatus();
  const holdingsAddress = auth.isAuthenticated ? auth.session?.address : undefined;
  const tokensQuery = useAllAccountTokens(holdingsAddress);
  const poolVouchersQuery = usePoolVouchersInfinite(poolAddress);
  const normalizedVoucherAddress = voucherAddress.toLowerCase();
  const fetchedTokens = tokensQuery.tokens.map(accountTokenToWalletToken);
  const fetchedToken = fetchedTokens.find((item) => item.id === normalizedVoucherAddress);
  const poolVoucher = poolVouchersQuery.data?.pages
    .flatMap((page) => page.vouchers)
    .find(
      (voucher) =>
        voucher.tokenAddress.toLowerCase() === normalizedVoucherAddress ||
        voucher.id === voucherAddress,
    );
  const catalogToken = poolVoucher ? poolVoucherToWalletToken(poolVoucher) : undefined;
  const staticToken =
    WALLET_TOKEN_BY_ID[voucherAddress] ??
    Object.values(WALLET_TOKEN_BY_ID).find(
      (item) => item.contractAddress?.toLowerCase() === normalizedVoucherAddress,
    );
  const baseToken = fetchedToken ?? catalogToken ?? staticToken;
  const detailAddress = baseToken?.contractAddress ?? voucherAddress;
  const detailQuery = useMarketVoucherDetail(detailAddress);
  const currentOwner = useAssetOwner(
    detailAddress,
    detailQuery.data?.ownerAddress ?? baseToken?.owner,
  );
  const detail = detailQuery.data
    ? { ...detailQuery.data, ownerAddress: currentOwner as `0x${string}` | null }
    : undefined;
  const distanceOrigin = useDiscoveryDistanceOrigin(
    holdingsAddress?.toLowerCase() ?? GUEST_STORAGE_OWNER,
  );
  const distanceTarget =
    typeof (detail?.lat ?? baseToken?.lat) === "number" &&
    typeof (detail?.lng ?? baseToken?.lng) === "number"
      ? { lat: (detail?.lat ?? baseToken?.lat)!, lng: (detail?.lng ?? baseToken?.lng)! }
      : null;
  const distanceLabel = useMarketDistanceLabel(distanceOrigin, distanceTarget);
  const supportingDataPending =
    (!!holdingsAddress && tokensQuery.isPending) || (!!poolAddress && poolVouchersQuery.isPending);
  const resolvedAddress = detail?.address ?? baseToken?.contractAddress ?? voucherAddress;
  const resolvedVoucherValue = detail?.voucherValue ?? poolVoucher?.voucherValue ?? null;
  const resolvedVoucherUoa = detail?.voucherUoa ?? poolVoucher?.voucherUoa ?? null;
  const balance = useVoucherBalanceSummary({
    address: resolvedAddress,
    symbol: detail?.symbol ?? baseToken?.symbol ?? "TOKEN",
    decimals: baseToken?.tokenDecimals ?? detail?.decimals,
    voucherValue: resolvedVoucherValue,
    voucherUoa: resolvedVoucherUoa,
  });
  useDeskTrailLabel(detail?.name ?? baseToken?.name);

  if (!baseToken && !detail && (detailQuery.isPending || supportingDataPending)) {
    return (
      <DeskCanvas width="read">
        <p className="text-sm text-muted-foreground">{t`Loading voucher…`}</p>
      </DeskCanvas>
    );
  }
  if (!baseToken && !detail && detailQuery.isError) {
    return (
      <DeskCanvas width="read" className="space-y-3">
        <p className="text-sm text-muted-foreground">{t`Couldn't load this voucher.`}</p>
        <Button
          variant="outline"
          tap
          pending={detailQuery.isFetching}
          onClick={() => void detailQuery.refetch()}
        >
          {t`Retry`}
        </Button>
      </DeskCanvas>
    );
  }

  const token: WalletToken = {
    id: baseToken?.id ?? detail?.address.toLowerCase() ?? normalizedVoucherAddress,
    symbol: detail?.symbol ?? baseToken?.symbol ?? "TOKEN",
    name: detail?.name ?? baseToken?.name ?? "Token",
    amount: baseToken?.amount ?? "0",
    fiat: baseToken?.fiat ?? "",
    color: baseToken?.color ?? "var(--primary)",
    kind: "voucher",
    admin: baseToken?.admin,
    location: detail?.locationName ?? baseToken?.location,
    phone: detail?.phone ?? baseToken?.phone,
    email: detail?.email ?? baseToken?.email,
    owner: currentOwner ?? baseToken?.owner,
    contractAddress: detail?.address ?? baseToken?.contractAddress ?? voucherAddress,
    iconUrl: detail?.iconUrl ?? baseToken?.iconUrl,
    tokenDecimals: baseToken?.tokenDecimals ?? detail?.decimals ?? undefined,
    balance: baseToken?.balance,
    lastDateBlock: baseToken?.lastDateBlock,
    lat: detail?.lat ?? baseToken?.lat,
    lng: detail?.lng ?? baseToken?.lng,
  };
  const address = token.contractAddress ?? voucherAddress;
  const locationName = detail?.locationName ?? poolVoucher?.locationName ?? token.location ?? null;
  const lat = detail?.lat ?? token.lat ?? null;
  const lng = detail?.lng ?? token.lng ?? null;

  return (
    <div className={VOUCHER_PAGE_CLASS}>
      <div className="[&_[role=group]]:hidden">
        <VoucherIdentitySummary
          address={address}
          name={token.name}
          symbol={token.symbol}
          iconUrl={token.iconUrl}
          avatarSize={56}
          balance={balance}
          place={distanceLabel ?? locationName}
          tags={detail?.tags}
          ownerAddress={detail?.ownerAddress}
          locationName={locationName}
          lat={lat}
          lng={lng}
          phone={detail?.phone ?? token.phone}
          website={detail?.website}
          catalogResourceId={detail?.id}
          catalogAddress={detail?.address}
          title={
            <DeskTitle>
              <span className="[overflow-wrap:anywhere]">{token.name}</span>
            </DeskTitle>
          }
          headerActions={
            <div className="flex items-center gap-2">
              {detail?.id && detail.address ? (
                <AddToCatalogButton
                  kind="voucher"
                  resourceId={detail.id}
                  address={detail.address}
                />
              ) : null}
              <ShareVoucherButton
                name={token.name}
                address={address}
                destination="detail"
                className="border border-foreground/25 bg-card text-foreground"
              />
            </div>
          }
        />
      </div>
      <VoucherActions
        address={address}
        name={token.name}
        ownerAddress={detail?.ownerAddress}
        hasPositiveBalance={balance.hasPositiveBalance}
        locationName={locationName}
        lat={lat}
        lng={lng}
        phone={detail?.phone ?? token.phone}
        website={detail?.website}
      />
      <VoucherDetailSections
        className="contents space-y-0 pb-0"
        address={address}
        detail={detail}
        symbol={token.symbol}
        name={token.name}
        decimals={token.tokenDecimals}
        ownerAddress={token.owner ?? null}
        chainId={detail?.chainId ?? poolVoucher?.chainId ?? null}
        voucherValue={resolvedVoucherValue}
        voucherUoa={resolvedVoucherUoa}
        dataPending={detailQuery.isPending || supportingDataPending}
        privateInfo={
          detailQuery.privateInfo
            ? {
                ...detailQuery.privateInfo,
                retry: () => void detailQuery.privateInfo?.refetch(),
              }
            : undefined
        }
      />
    </div>
  );
}

function VoucherActions({
  address,
  name,
  ownerAddress,
  hasPositiveBalance,
  locationName,
  lat,
  lng,
  phone,
  website,
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
}) {
  const { t } = useLingui();
  const auth = useAuthStatus();
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
      className="grid auto-cols-fr grid-flow-col border border-border bg-card"
      role="group"
      aria-label={t`Voucher actions`}
    >
      <Button asChild variant="ghost" size="tile" className={ACTION_CLASS}>
        <Link to="/market" search={{ scope: "pools", out_voucher: address.toLowerCase() }}>
          <RiHandCoinLine aria-hidden="true" />
          <Trans>Get</Trans>
        </Link>
      </Button>
      {hasPositiveBalance ? (
        <Button asChild variant="ghost" size="tile" className={ACTION_CLASS}>
          <Link to="/wallet/send" search={{ token: address }}>
            <RiSendPlane2Line aria-hidden="true" />
            <Trans>Send</Trans>
          </Link>
        </Button>
      ) : null}
      {hasPositiveBalance && verifiedOwnerAddress ? (
        <Button asChild variant="ghost" size="tile" className={ACTION_CLASS}>
          <Link
            to="/wallet/send/amount"
            search={{ token: address, recipient: verifiedOwnerAddress }}
          >
            <RiCoinLine aria-hidden="true" />
            <Trans>Redeem</Trans>
          </Link>
        </Button>
      ) : null}
      {auth.isAuthenticated && (coordinates || locationName) ? (
        <Button
          variant="ghost"
          size="tile"
          className={ACTION_CLASS}
          onClick={() => openDefaultMaps({ label: locationName ?? name, lat, lng })}
        >
          <RiNavigationLine aria-hidden="true" />
          <Trans>Directions</Trans>
        </Button>
      ) : null}
      {auth.isAuthenticated && phone ? (
        <Button asChild variant="ghost" size="tile" className={ACTION_CLASS}>
          <a href={`tel:${phone}`}>
            <RiPhoneLine aria-hidden="true" />
            <Trans>Call</Trans>
          </a>
        </Button>
      ) : null}
      {auth.isAuthenticated && verifiedWebsite ? (
        <Button asChild variant="ghost" size="tile" className={ACTION_CLASS}>
          <a href={verifiedWebsite} target="_blank" rel="noreferrer noopener">
            <RiGlobalLine aria-hidden="true" />
            <Trans>Website</Trans>
          </a>
        </Button>
      ) : null}
    </div>
  );
}
