import type { VoucherRef } from "@clc/core/features/catalog/logic";
import { useLingui } from "@lingui/react/macro";
import { useSearch } from "@tanstack/react-router";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { TagBadge } from "#/components/ui/tag-badge";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";
import { useVoucherBalanceSummary } from "#/components/vouchers/voucher-summary";
import { VoucherAvatar, WALLET_TOKEN_BY_ID, type WalletToken } from "#/components/wallet";
import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskCanvas, DeskDetail, DeskTitle } from "#/desktop/ui/page";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useAssetOwner } from "#/features/ownership/hooks/use-asset-owner";
import { usePoolVouchersInfinite } from "#/features/pools/hooks/use-pool-vouchers";
import { poolVoucherToWalletToken } from "#/features/pools/logic/pool-voucher-display";
import { useAllAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";

import { VoucherActionCells } from "./detail/voucher-actions";
import { VoucherActivityDesk } from "./detail/voucher-activity";
import { VoucherCatalogButton } from "./detail/voucher-catalog-button";
import { useCanEditVoucher, VoucherInfoDesk } from "./detail/voucher-info";
import { VoucherOfferingsDesk } from "./detail/voucher-offerings";
import { VoucherPostsDesk } from "./detail/voucher-posts";
import { VoucherReviewsDesk } from "./detail/voucher-reviews";
import {
  VoucherBalanceLine,
  VoucherRatingLine,
  VoucherShareButton,
} from "./detail/voucher-section-bits";

/**
 * `.page.detail`: the summary, the action strip and Offerings, Reviews, Posts
 * and Activity in the main column; Info in the sticky 360px column beside it.
 */
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
  const { address: walletAddress } = useConnection();
  const { canEdit } = useCanEditVoucher(
    detail?.address ?? baseToken?.contractAddress ?? voucherAddress,
    detail,
  );

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

  const ownerForControls = token.owner ?? null;
  const chainId = detail?.chainId ?? poolVoucher?.chainId ?? null;
  const reportVoucher: VoucherRef | undefined =
    chainId && address ? { chainId, address: address as VoucherRef["address"] } : undefined;
  const privateInfo = detailQuery.privateInfo
    ? { ...detailQuery.privateInfo, retry: () => void detailQuery.privateInfo?.refetch() }
    : undefined;
  const place = distanceLabel ?? locationName;

  return (
    <DeskDetail
      main={
        <>
          <div className="grid gap-5">
            <div className="flex min-w-0 items-center gap-4">
              <VoucherAvatar
                address={address}
                symbol={token.symbol}
                iconUrl={token.iconUrl ?? null}
                size={56}
              />
              <div className="grid min-w-0 flex-1 gap-1">
                <DeskTitle>
                  <span className="[overflow-wrap:anywhere]">{token.name}</span>
                </DeskTitle>
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  {balance.status === "hidden" ? null : (
                    <>
                      <VoucherBalanceLine balance={balance} />
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <VoucherRatingLine address={address} place={place} stars={false} />
                  {detail?.tags?.length
                    ? detail.tags
                        .slice(0, 3)
                        .map((tag) => <TagBadge key={tag} tag={tag} size="sm" />)
                    : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {detail?.id && detail.address ? (
                  <VoucherCatalogButton resourceId={detail.id} address={detail.address} />
                ) : null}
                <VoucherShareButton name={token.name} address={address} />
              </div>
            </div>
            <VoucherActionCells
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
          </div>
          <VoucherOfferingsDesk
            key={address}
            address={address}
            symbol={token.symbol}
            voucherValue={resolvedVoucherValue}
            voucherUoa={resolvedVoucherUoa}
            ownerAddress={ownerForControls}
            layout="page"
          />
          <VoucherReviewsDesk key={`reviews-${address}`} address={address} layout="page" />
          <VoucherPostsDesk
            voucher={reportVoucher}
            voucherName={token.name}
            voucherDataPending={detailQuery.isPending || supportingDataPending}
            canWritePost={canEdit}
            layout="page"
          />
          <VoucherActivityDesk
            accountAddress={walletAddress}
            contractAddress={address}
            layout="page"
          />
        </>
      }
      side={
        <section aria-label={t`Info`} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <VoucherInfoDesk
            address={address}
            symbol={token.symbol}
            decimals={token.tokenDecimals}
            ownerAddress={ownerForControls}
            detail={detail}
            privateInfo={privateInfo}
          />
        </section>
      }
    />
  );
}
