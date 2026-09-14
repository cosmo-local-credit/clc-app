import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import {
  RiAddLine,
  RiFocus3Line,
  RiListUnordered,
  RiPencilLine,
  RiSettings3Line,
} from "react-icons/ri";

import { MarketMap } from "#/components/catalog-map/market-map.lazy";
import type { MarketFitBounds } from "#/components/catalog-map/market-map";
import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { BackChevron, TokenLogo, type WalletToken } from "#/components/wallet";
import { GUEST_LOCATION_OWNER } from "#/features/home/api/last-location-storage";
import { CAMERA_RANK, useMarketCamera } from "#/features/home/hooks/use-market-camera";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { usePoolVoucherRates } from "#/features/pools/hooks/use-pool-quoter";
import { usePoolTreasury } from "#/features/pools/hooks/use-pool-treasury";
import { usePoolVoucherTokens } from "#/features/pools/hooks/use-pool-voucher-tokens";
import { usePoolVouchers } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";
import { formatPoolAvailableValue } from "#/features/pools/logic/pool-available-value";
import { poolVoucherToMarketLocation } from "#/features/pools/logic/pool-voucher-location";
import { POOL_PRICE_INDEX_DECIMALS } from "@clc/core/features/pool-admin/logic";
import { PoolControlsPanel } from "./pool-controls-panel";
import { PoolLogo } from "./pool-logo";
import { PoolProfileEditorSheet } from "./pool-profile-editor-sheet";
import { type ExploreSheetSnap, PoolVoucherExploreSheet } from "./pool-voucher-explore-sheet";
import { PoolVoucherSheet } from "./pool-voucher-sheet";

export function PoolDetailPage({
  poolAddress,
  selectedVoucherAddress,
  onSelectVoucher,
  onClearVoucher,
}: {
  poolAddress: string;
  selectedVoucherAddress?: string;
  onSelectVoucher?: (address: string) => void;
  onClearVoucher?: () => void;
}) {
  const { t } = useLingui();
  const poolQuery = useUserPoolByAddress(poolAddress);
  const pool = poolQuery.data;
  const vouchers = usePoolVouchers(pool);
  const voucherTokens = usePoolVoucherTokens(vouchers);
  const treasury = usePoolTreasury(pool, vouchers, !!pool);
  const auth = useAuthStatus();
  const camera = useMarketCamera(auth.session?.address ?? GUEST_LOCATION_OWNER);
  const isPoolOwner =
    auth.isAuthenticated &&
    !!pool &&
    !!auth.session?.address &&
    !!pool.ownerAddress &&
    auth.session.address.toLowerCase() === pool.ownerAddress.toLowerCase();
  const canEditDetails =
    auth.isAuthenticated && !!pool && (auth.session?.role === "SUPERADMIN" || isPoolOwner);
  const canManageOnChain = isPoolOwner;
  const rates = usePoolVoucherRates(pool, vouchers, canManageOnChain);
  const [managing, setManaging] = useState<PoolVoucher | null>(null);
  const [approving, setApproving] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [snap, setSnap] = useState<ExploreSheetSnap>("peek");

  const selectedAddress = selectedVoucherAddress?.toLowerCase();
  const selectedVoucher =
    vouchers.find((voucher) => voucher.tokenAddress.toLowerCase() === selectedAddress) ?? null;

  const locations = useMemo(
    () => vouchers.map(poolVoucherToMarketLocation).filter((item) => item !== null),
    [vouchers],
  );

  const fitBounds = useMemo((): MarketFitBounds | null => {
    if (locations.length === 0) return null;
    let west = locations[0]!.lng;
    let east = locations[0]!.lng;
    let south = locations[0]!.lat;
    let north = locations[0]!.lat;
    for (const location of locations) {
      west = Math.min(west, location.lng);
      east = Math.max(east, location.lng);
      south = Math.min(south, location.lat);
      north = Math.max(north, location.lat);
    }
    return { key: `${poolAddress}:${locations.length}`, west, south, east, north };
  }, [locations, poolAddress]);

  const poolCamera =
    pool && typeof pool.geoLat === "number" && typeof pool.geoLng === "number"
      ? { lat: pool.geoLat, lng: pool.geoLng, zoom: 13, rank: CAMERA_RANK.countryDefault }
      : camera.camera;

  function selectVoucher(address: string) {
    setListOpen(false);
    onSelectVoucher?.(address.toLowerCase());
  }

  function clearVoucher() {
    setSnap("peek");
    onClearVoucher?.();
  }

  if (poolQuery.isPending) {
    return <DetailShell message={t`Loading pool…`} />;
  }
  if (poolQuery.isError) {
    return <DetailShell message={t`Couldn't load this pool.`} />;
  }
  if (!pool) {
    return <DetailShell message={t`Pool not found.`} />;
  }

  const selectedTreasury = selectedVoucher
    ? treasury.data?.get(selectedVoucher.tokenAddress.toLowerCase())
    : undefined;
  const availableValue = selectedVoucher
    ? formatPoolAvailableValue({
        balanceRaw: selectedTreasury?.balanceRaw,
        decimals: selectedVoucher.decimals,
        voucherValue: selectedVoucher.voucherValue,
        voucherUoa: selectedVoucher.voucherUoa,
      })
    : null;

  const locationButtonLabel =
    camera.locationStatus === "requesting"
      ? t`Finding location`
      : camera.locationStatus === "denied"
        ? t`Location denied`
        : camera.locationStatus === "unavailable"
          ? t`Location unavailable`
          : t`Use current location`;

  return (
    <main className="relative h-[100svh] overflow-hidden bg-card">
      <Suspense fallback={<div className="absolute inset-0 bg-card" />}>
        <MarketMap
          locations={locations}
          selectedLocationId={selectedVoucher?.tokenAddress.toLowerCase() ?? null}
          camera={poolCamera}
          fitBounds={selectedVoucher ? null : fitBounds}
          cameraScope={poolAddress}
          userLocation={camera.userLocation}
          onSelectLocation={selectVoucher}
          onClearSelection={clearVoucher}
          focusPadding={
            selectedVoucher
              ? {
                  top: 112,
                  bottom: Math.round(
                    (typeof window === "undefined" ? 800 : window.innerHeight) * 0.32,
                  ),
                  left: 48,
                  right: 48,
                }
              : undefined
          }
          className="absolute inset-0 h-full w-full"
        />
      </Suspense>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <div className="pointer-events-auto">
          <BackChevron label={t`Pools`} to="/pools" className="bg-transparent" />
        </div>
        <section className="pointer-events-auto mt-1 border border-border bg-card p-3">
          <div className="flex items-start gap-3">
            <PoolLogo imageUrl={pool.imageUrl} name={pool.name} seed={pool.address} size={40} />
            <div className="min-w-0 flex-1 overflow-hidden">
              <h1 className="truncate font-heading text-[1.125rem] font-bold leading-tight">
                {pool.name}
              </h1>
              {pool.description ? (
                <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                  {pool.description}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button asChild variant="outline" className="h-11 flex-1 bg-card">
              <Link
                to="/wallet/send/amount"
                search={{ recipient: pool.address, recipientLabel: pool.name }}
              >
                <Trans>Deposit</Trans>
              </Link>
            </Button>
            <Button asChild className="h-11 flex-1">
              <Link
                to="/pools/$poolAddress/swap"
                params={{ poolAddress }}
                search={selectedVoucher ? { to: selectedVoucher.tokenAddress } : undefined}
              >
                <Trans>Swap</Trans>
              </Link>
            </Button>
          </div>
          {canEditDetails || canManageOnChain ? (
            <div className="mt-2 flex gap-2">
              {canEditDetails ? <EditPoolDetails pool={pool} /> : null}
              {canManageOnChain ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 flex-1 bg-card"
                  onClick={() => setToolsOpen(true)}
                >
                  <RiSettings3Line className="size-4" aria-hidden="true" />
                  <Trans>Manage pool</Trans>
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {selectedVoucher ? (
        <PoolVoucherExploreSheet
          poolAddress={poolAddress}
          voucher={selectedVoucher}
          availableValue={availableValue}
          availableLoading={treasury.isPending}
          snap={snap}
          onSnapChange={setSnap}
          onClose={clearVoucher}
        />
      ) : (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--bottom-nav-offset)+1rem)] z-20 flex gap-2 px-4">
          <Button className="pointer-events-auto h-11 flex-1" onClick={() => setListOpen(true)}>
            <RiListUnordered className="size-4" aria-hidden="true" />
            <Trans>Browse vouchers</Trans>
          </Button>
          <Button
            size="icon-lg"
            className="pointer-events-auto h-11 w-11 shrink-0 bg-foreground text-background hover:bg-foreground/90 disabled:bg-foreground disabled:text-background/70"
            aria-label={locationButtonLabel}
            disabled={
              camera.locationStatus === "requesting" ||
              camera.locationStatus === "denied" ||
              camera.locationStatus === "unavailable"
            }
            onClick={camera.requestLocation}
          >
            <RiFocus3Line className="size-5" aria-hidden="true" />
          </Button>
        </div>
      )}

      <SheetRoot open={listOpen} onOpenChange={setListOpen}>
        <SheetPortal>
          <SheetBackdrop />
          <SheetContent className="rounded-none border-t border-border bg-background shadow-none">
            <SheetHeader>
              <SheetTitle className="font-heading text-base font-semibold">
                <Trans>Vouchers</Trans>
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {canManageOnChain ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-3 h-9 w-full bg-card"
                  onClick={() => {
                    setListOpen(false);
                    setApproving(true);
                  }}
                >
                  <RiAddLine className="size-4" aria-hidden="true" />
                  <Trans>Approve voucher</Trans>
                </Button>
              ) : null}
              {vouchers.length === 0 ? (
                <p className="border border-border bg-card p-3 text-muted-foreground text-sm">
                  <Trans>No vouchers in this pool yet.</Trans>
                </p>
              ) : (
                <div className="border border-border bg-card">
                  {vouchers.map((voucher, index) => (
                    <VoucherRow
                      key={voucher.id}
                      voucher={voucher}
                      token={voucherTokens[index]}
                      isLast={index === vouchers.length - 1}
                      unitSymbol={pool.unitOfAccount ?? pool.symbol}
                      ratePpm={rates.data?.get(voucher.tokenAddress.toLowerCase())}
                      onSelect={() => selectVoucher(voucher.tokenAddress)}
                      onManage={canManageOnChain ? () => setManaging(voucher) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          </SheetContent>
        </SheetPortal>
      </SheetRoot>

      <SheetRoot open={toolsOpen} onOpenChange={setToolsOpen}>
        <SheetPortal>
          <SheetBackdrop />
          <SheetContent className="rounded-none border-t border-border bg-background shadow-none">
            <SheetHeader>
              <SheetTitle className="font-heading text-base font-semibold">
                <Trans>Manage pool</Trans>
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <PoolControlsPanel pool={pool} vouchers={vouchers} />
            </div>
          </SheetContent>
        </SheetPortal>
      </SheetRoot>

      {canManageOnChain ? (
        <PoolVoucherSheet
          pool={pool}
          poolVouchers={vouchers}
          voucher={null}
          currentRatePpm={undefined}
          rateIsPending={false}
          open={approving}
          onClose={() => setApproving(false)}
        />
      ) : null}

      {canManageOnChain && managing ? (
        <PoolVoucherSheet
          pool={pool}
          poolVouchers={vouchers}
          voucher={managing}
          currentRatePpm={rates.data?.get(managing.tokenAddress.toLowerCase())}
          rateIsPending={rates.isEnabled && rates.isPending}
          open
          onClose={() => setManaging(null)}
        />
      ) : null}
    </main>
  );
}

function EditPoolDetails({ pool }: { pool: UserPool }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 flex-1 bg-card"
        onClick={() => setEditing(true)}
      >
        <RiPencilLine className="size-4" aria-hidden="true" />
        <Trans>Edit details</Trans>
      </Button>
      <PoolProfileEditorSheet open={editing} pool={pool} onClose={() => setEditing(false)} />
    </>
  );
}

function DetailShell({ message }: { message: string }) {
  const { t } = useLingui();
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
      <BackChevron label={t`Pools`} to="/pools" />
      <p className="border border-border bg-card p-3 text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

function VoucherRow({
  voucher,
  token,
  isLast,
  unitSymbol,
  ratePpm,
  onSelect,
  onManage,
}: {
  voucher: PoolVoucher;
  token: WalletToken | undefined;
  isLast: boolean;
  unitSymbol: string;
  ratePpm: bigint | undefined;
  onSelect: () => void;
  onManage?: () => void;
}) {
  const { t } = useLingui();
  return (
    <div className={["flex items-center", isLast ? "" : "border-b border-border"].join(" ")}>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
      >
        {token ? <TokenLogo token={token} size={36} /> : null}
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate font-bold text-sm tracking-tight">{voucher.name}</p>
          {ratePpm === undefined ? null : (
            <p className="truncate font-mono text-muted-foreground text-xs">
              1 {voucher.symbol} ={" "}
              {formatTokenAmount(ratePpm.toString(), POOL_PRICE_INDEX_DECIMALS)} {unitSymbol}
            </p>
          )}
        </div>
        {voucher.offerCount === null ? null : (
          <span className="shrink-0 text-primary text-[0.6875rem] font-semibold">
            {voucher.offerCount === 1 ? (
              <Trans>1 offer</Trans>
            ) : (
              <Trans>{voucher.offerCount} offers</Trans>
            )}
          </span>
        )}
      </button>
      {onManage ? (
        <button
          type="button"
          aria-label={t`Manage ${voucher.symbol}`}
          onClick={onManage}
          className="flex size-11 shrink-0 items-center justify-center text-muted-foreground"
        >
          <RiSettings3Line className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
