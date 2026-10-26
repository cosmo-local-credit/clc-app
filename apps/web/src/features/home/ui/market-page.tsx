import { Trans, useLingui } from "@lingui/react/macro";
import { Suspense, useEffect, useState } from "react";

import { CreditableBrowseControl } from "#/components/creditable-browse-control";
import { MarketBar } from "#/components/market-bar";
import { Progress, ProgressTrack } from "#/components/ui/progress";
import { VoucherSheet } from "#/components/vouchers/voucher-sheet";
import { WantSheet } from "#/components/wants/want-sheet";
import { useMarketScreen } from "#/features/home/hooks/use-market-screen";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { cn } from "#/lib/utils";
import { MarketFilterSheet } from "./market-filter-ui";
import { MarketMap } from "./market-map.lazy";

export function MarketPage({
  isAuthenticated = false,
  locationOwner = GUEST_STORAGE_OWNER,
  creditableSearch,
}: {
  isAuthenticated?: boolean;
  locationOwner?: string;
  creditableSearch?: boolean | string | readonly (boolean | string)[];
}) {
  const { t } = useLingui();
  const {
    camera,
    cameraBootstrapPending,
    realFix,
    userLocation,
    locations,
    clusters,
    isFetching,
    tagFacets,
    selectedLocationId,
    filter,
    mapResources,
    credit,
    filtersOpen,
    setFiltersOpen,
    setFiltersEverOpened,
    isCardOpen,
    snap,
    setSnap,
    sheetInset,
    cardCatalogVoucher,
    handleCoveredHeightChange,
    handleUserPan,
    handleSelectLocation,
    closeSelection,
    handleViewportSettled,
    locationButton,
    mapNotice,
    changeCredit,
    clearCredit,
  } = useMarketScreen({ isAuthenticated, locationOwner, creditableSearch });

  return (
    <main className="relative h-[100svh] overflow-hidden bg-card">
      <h1 className="sr-only">
        <Trans>Market</Trans>
      </h1>
      {cameraBootstrapPending ? (
        <div className="market-map-fallback absolute inset-0 h-full w-full bg-card" />
      ) : (
        <Suspense
          fallback={<div className="market-map-fallback absolute inset-0 h-full w-full bg-card" />}
        >
          <MarketMap
            locations={locations}
            clusters={clusters}
            selectedLocationId={selectedLocationId}
            camera={camera}
            fitBounds={null}
            cameraScope={locationOwner}
            userLocation={userLocation}
            onSelectLocation={handleSelectLocation}
            onDeselect={closeSelection}
            onUserPan={handleUserPan}
            bottomInset={isCardOpen ? sheetInset : 0}
            onViewportSettled={handleViewportSettled}
            className="absolute inset-0 h-full w-full"
          />
        </Suspense>
      )}

      <MarketBar
        current="map"
        surface="map"
        className={cn(
          "absolute inset-x-4 top-[calc(env(safe-area-inset-top)+1rem)]",
          isCardOpen ? "z-20" : "z-30",
        )}
        filter={filter}
        mapResources={mapResources}
        progress={<MarketMapLoading loading={isFetching} />}
        searchLabel={t`Search the marketplace`}
        credit={
          <CreditableBrowseControl
            part="control"
            state={credit}
            onChange={changeCredit}
            onClear={clearCredit}
          />
        }
        filters={
          <MarketFilterSheet
            filter={filter}
            facets={tagFacets}
            open={filtersOpen}
            onOpenChange={(next) => {
              if (next) setFiltersEverOpened(true);
              setFiltersOpen(next);
            }}
          />
        }
      />

      {/* One notice at a time, under the badges: the first that applies wins. */}
      {mapNotice ? (
        <div className="pointer-events-none absolute inset-x-4 top-[calc(env(safe-area-inset-top)+7.5rem)] z-20">
          <div className="pointer-events-auto">{mapNotice}</div>
        </div>
      ) : null}

      {/* With a card open, the location control stays available and rides the sheet. */}
      {isCardOpen ? null : (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(var(--bottom-nav-offset),env(safe-area-inset-bottom))+1.25rem)] z-20 flex flex-col gap-2 px-4">
          <div className="flex justify-end">{locationButton}</div>
        </div>
      )}

      <VoucherSheet
        modal={false}
        placeholder={cardCatalogVoucher}
        realFix={realFix}
        snap={snap}
        onSnapChange={setSnap}
        onCoveredHeightChange={handleCoveredHeightChange}
        floating={locationButton}
        bottomNavigationVisible
      />
      <WantSheet
        realFix={realFix}
        snap={snap}
        onSnapChange={setSnap}
        onCoveredHeightChange={handleCoveredHeightChange}
        floating={locationButton}
      />
    </main>
  );
}

function MarketMapLoading({ loading }: { loading: boolean }) {
  const { t } = useLingui();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!loading) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 250);
    return () => clearTimeout(timer);
  }, [loading]);

  if (!loading || !visible) return null;
  return (
    <Progress
      value={null}
      aria-label={t`Loading marketplace…`}
      className="pointer-events-none h-0.5 overflow-hidden bg-card"
    >
      <ProgressTrack className="h-full w-full">
        <div className="market-results-loading-indicator h-full bg-primary" />
      </ProgressTrack>
    </Progress>
  );
}
