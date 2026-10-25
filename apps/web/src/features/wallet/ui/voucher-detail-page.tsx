import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { useLingui } from "@lingui/react/macro";
import { useEffect, type ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { BackChevron, WALLET_TOKEN_BY_ID, type WalletToken } from "#/components/wallet";
import {
  VoucherDetailSections,
  type VoucherDetailSection,
} from "#/components/vouchers/voucher-detail-sections";
import {
  ShareVoucherButton,
  useVoucherBalanceSummary,
  VoucherIdentitySummary,
} from "#/components/vouchers/voucher-summary";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useAssetOwner } from "#/features/ownership/hooks/use-asset-owner";
import { usePoolVouchersInfinite } from "#/features/pools/hooks/use-pool-vouchers";
import { poolVoucherToWalletToken } from "#/features/pools/logic/pool-voucher-display";
import { useAllAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import {
  resolveVoucherNavigationOwner,
  type VoucherOrigin,
} from "#/lib/navigation/voucher-navigation-owner";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";

export type { VoucherOrigin } from "#/lib/navigation/voucher-navigation-owner";

export function VoucherDetailPage({
  voucherAddress,
  activeTab,
  origin = "market",
  poolAddress,
  reportId,
  wantId,
}: {
  voucherAddress: string;
  /** A legacy tab URL now identifies the section to focus on first render. */
  activeTab?: VoucherDetailSection;
  origin?: VoucherOrigin;
  poolAddress?: string;
  reportId?: string;
  wantId?: string;
}) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const voucherNavigation = resolveVoucherNavigationOwner({
    from: origin,
    poolAddress,
    reportId,
    wantId,
  });
  const back = {
    label:
      voucherNavigation.backDestination === "pool"
        ? t`Pool`
        : voucherNavigation.backDestination === "posts"
          ? t`Posts`
          : voucherNavigation.backDestination === "wants"
            ? t`Want`
            : voucherNavigation.backDestination === "wallet"
              ? t`Wallet`
              : voucherNavigation.backDestination === "vouchers"
                ? t`Vouchers`
                : t`Market`,
    to: voucherNavigation.to,
    search: voucherNavigation.search,
  };
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

  useEffect(() => {
    if (!activeTab || detailQuery.isPending || supportingDataPending) return;
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById(`voucher-section-${activeTab}`);
      if (!heading) return;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({
        behavior:
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, detailQuery.isPending, supportingDataPending]);

  if (!baseToken && !detail && (detailQuery.isPending || supportingDataPending)) {
    return <VoucherShell back={back} message={t`Loading voucher…`} />;
  }
  if (!baseToken && !detail && detailQuery.isError) {
    return (
      <VoucherShell back={back} message={t`Couldn't load this voucher.`}>
        <Button
          variant="outline"
          tap
          pending={detailQuery.isFetching}
          onClick={() => void detailQuery.refetch()}
        >
          {t`Retry`}
        </Button>
      </VoucherShell>
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
  const voucherValue = resolvedVoucherValue;
  const voucherUoa = resolvedVoucherUoa;
  const locationName = detail?.locationName ?? poolVoucher?.locationName ?? token.location ?? null;
  const lat = detail?.lat ?? token.lat ?? null;
  const lng = detail?.lng ?? token.lng ?? null;
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-bottom-nav">
      <BackChevron label={back.label} to={back.to} search={back.search} />

      <VoucherIdentitySummary
        className="mt-1"
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
        phone={token.phone}
        website={detail?.website}
        catalogResourceId={detail?.id}
        catalogAddress={detail?.address}
        title={
          <h1 className="font-heading text-[1.75rem] font-bold leading-tight [overflow-wrap:anywhere]">
            {token.name}
          </h1>
        }
        headerActions={
          <ShareVoucherButton
            name={token.name}
            address={address}
            destination="detail"
            className="-me-3 -mt-2"
          />
        }
      />

      <VoucherDetailSections
        className="mt-3"
        address={address}
        detail={detail}
        symbol={token.symbol}
        name={token.name}
        decimals={token.tokenDecimals}
        ownerAddress={token.owner ?? null}
        chainId={detail?.chainId ?? poolVoucher?.chainId ?? null}
        voucherValue={voucherValue}
        voucherUoa={voucherUoa}
        description={detail?.description ?? poolVoucher?.description ?? null}
        email={token.email ?? null}
        website={detail?.website ?? null}
        phone={token.phone ?? null}
        terms={detail?.terms ?? null}
        locationName={locationName}
        lat={lat}
        lng={lng}
        dataPending={detailQuery.isPending || supportingDataPending}
      />
    </div>
  );
}

function VoucherShell({
  back,
  message,
  children,
}: {
  back: { label: string; to: string; search: Record<string, unknown> | undefined };
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-bottom-nav">
      <BackChevron label={back.label} to={back.to} search={back.search} />
      <p className="mt-6 text-muted-foreground text-sm">{message}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
