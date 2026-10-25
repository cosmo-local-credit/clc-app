import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RiFocus3Line } from "react-icons/ri";
import { canonicalMarketBounds, type MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import { viewportToBoundingBoxes } from "@clc/api/features/market/client";
import type { MarketTagFacet } from "@clc/api/features/market/client";

import { CreditableBrowseControl, hasCreditFeedback } from "#/components/creditable-browse-control";
import { MarketBar } from "#/components/market-bar";
import { Button } from "#/components/ui/button";
import type { MapSheetSnap } from "#/components/ui/map-sheet";
import { useVoucherSheetSnap, VoucherSheet } from "#/components/vouchers/voucher-sheet";
import { WantSheet } from "#/components/wants/want-sheet";
import { wantDetailQueryOptions } from "@clc/api/features/wants/queries";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import {
  CAMERA_RANK,
  REAL_FIX_ZOOM,
  useMarketCamera,
} from "#/features/home/hooks/use-market-camera";
import { useMarketCatalogVouchers } from "#/features/home/hooks/use-market-catalog";
import { useMarketMapPools } from "#/features/home/hooks/use-market-pools";
import { useMarketMapWants } from "#/features/home/hooks/use-market-wants";
import { useMarketMapCatalogs } from "#/features/home/hooks/use-market-catalogs";
import { useMarketMapReports } from "#/features/home/hooks/use-market-reports";
import { useMarketMapResourceSelection } from "#/features/home/hooks/use-market-map-resource-selection";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import {
  useMarketplaceMapFacets,
  useMarketplaceMapSearch,
} from "#/features/home/hooks/use-marketplace-map-search";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useMarketFilter } from "#/features/home/hooks/use-market-filter";
import { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import { useWantSheetSelection } from "#/lib/navigation/use-want-sheet-selection";
import { wantsClient } from "#/lib/api/wants";
import { cn } from "#/lib/utils";
import { useMarketDiscoveryArea } from "#/components/nearby-catalog";
import { MarketFilterSheet, useMarketFilterNotice } from "./market-filter-ui";
import type { MarketCamera, MarketViewport } from "./market-map";
import { MarketMap } from "./market-map.lazy";
import type { MarketplaceKind } from "@clc/core/features/marketplace/logic";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";

type Coordinates = { lat: number; lng: number };

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
    camera: automaticCamera,
    realFix,
    userLocation,
    locationStatus,
    requestLocation,
    isResolvingInitialCamera,
  } = useMarketCamera(locationOwner);
  const { area, setArea, clearArea } = useMarketDiscoveryArea();
  const [fetchBounds, setFetchBounds] = useState<readonly MarketBoundingBox[]>(() =>
    expandBoundingBoxes(area?.boxes ?? []),
  );
  const areaOwnerRef = useRef(area?.owner);
  useEffect(() => {
    if (areaOwnerRef.current === area?.owner) return;
    areaOwnerRef.current = area?.owner;
    setFetchBounds(expandBoundingBoxes(area?.boxes ?? []));
  }, [area]);
  const voucherSelection = useVoucherSheetSelection();
  const wantSelection = useWantSheetSelection();

  // A link that opens the market on a card centres the map on its voucher,
  // which may lie far outside anything the catalog has loaded.
  const [linkedVoucher] = useState(voucherSelection.voucher);
  const linkedDetail = useMarketVoucherDetail(linkedVoucher ?? undefined).data;
  const linkedLat = linkedDetail?.lat ?? undefined;
  const linkedLng = linkedDetail?.lng ?? undefined;
  const voucherCamera = useMemo<MarketCamera | null>(
    () =>
      linkedLat !== undefined && linkedLng !== undefined
        ? {
            lat: linkedLat,
            lng: linkedLng,
            zoom: REAL_FIX_ZOOM,
            rank: CAMERA_RANK.selectedVoucher,
          }
        : null,
    [linkedLat, linkedLng],
  );
  const linkedWant = useQuery({
    ...wantDetailQueryOptions(wantsClient, wantSelection.want ?? ""),
    enabled: wantSelection.want !== null,
    retry: false,
  }).data;
  const wantCamera = useMemo<MarketCamera | null>(
    () =>
      linkedWant
        ? {
            lat: linkedWant.geoLat,
            lng: linkedWant.geoLng,
            zoom: REAL_FIX_ZOOM,
            rank: CAMERA_RANK.selectedVoucher,
          }
        : null,
    [linkedWant],
  );

  // Otherwise the map opens on the profile's saved location. It outranks every
  // automatic source, so only the location button's explicit fix takes the map
  // off it.
  const profileQuery = useAuthProfile({ enabled: isAuthenticated });
  const saved = isAuthenticated ? profileCoordinates(profileQuery.data) : null;
  const savedLat = saved?.lat;
  const savedLng = saved?.lng;
  const savedCamera = useMemo<MarketCamera | null>(
    () =>
      savedLat !== undefined && savedLng !== undefined
        ? { lat: savedLat, lng: savedLng, zoom: REAL_FIX_ZOOM, rank: CAMERA_RANK.savedProfile }
        : null,
    [savedLat, savedLng],
  );
  const areaCamera = useMemo<MarketCamera | null>(
    () =>
      area
        ? {
            lat: area.center.lat,
            lng: area.center.lng,
            zoom: area.zoom,
            rank: CAMERA_RANK.savedProfile,
          }
        : null,
    [area],
  );
  const camera =
    automaticCamera?.rank === CAMERA_RANK.explicit
      ? automaticCamera
      : (wantCamera ?? voucherCamera ?? areaCamera ?? savedCamera ?? automaticCamera);
  const cameraBootstrapPending =
    !wantCamera &&
    !voucherCamera &&
    !areaCamera &&
    !savedCamera &&
    !automaticCamera &&
    isResolvingInitialCamera;
  // A trustworthy initial camera becomes the first viewport after MapLibre has
  // measured the rendered canvas. Avoid starting a whole-Global marker walk in
  // the short interval before that first settled rectangle is available.
  const mapDiscoveryReady = fetchBounds.length > 0 || (!camera && !cameraBootstrapPending);

  const filter = useMarketFilter(useStorageOwner());
  const credit = useCreditableBrowse(creditableSearch);
  const mapResources = useMarketMapResourceSelection(locationOwner);
  const selectedResources = useMemo(() => new Set(mapResources.selected), [mapResources.selected]);
  const showVouchers = selectedResources.has("voucher");
  const showWants = selectedResources.has("want");
  const showPools = selectedResources.has("pool");
  const showCatalogs = selectedResources.has("catalog");
  const showPosts = selectedResources.has("post");
  const selectedCommerceKinds = useMemo<MarketplaceKind[]>(() => {
    const kinds: MarketplaceKind[] = [];
    if (showVouchers) kinds.push("voucher");
    if (showWants) kinds.push("want");
    if (showPools) kinds.push("pool");
    if (showCatalogs) kinds.push("catalog");
    return kinds;
  }, [showCatalogs, showPools, showVouchers, showWants]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersEverOpened, setFiltersEverOpened] = useState(false);
  const usesUnifiedSearch = filter.isFiltered || credit.enabled;
  const voucherCatalog = useMarketCatalogVouchers(
    filter,
    fetchBounds,
    mapDiscoveryReady &&
      showVouchers &&
      !usesUnifiedSearch &&
      !filter.isRestoringPreference &&
      !credit.blocksResults,
    false,
    credit.enabled ? credit.poolRefs : undefined,
  );
  const { vouchers, isCatalogComplete, error, retry, retrying } = voucherCatalog;
  // The same text, tag and Credit dimensions apply to every selected resource;
  // each query remains independently switchable so stale pins disappear at once.
  const poolCatalog = useMarketMapPools(
    mapDiscoveryReady && showPools && !filter.isRestoringPreference && !usesUnifiedSearch,
    fetchBounds,
  );
  const { pools } = poolCatalog;
  const wantCatalog = useMarketMapWants(
    fetchBounds,
    mapDiscoveryReady && showWants && !filter.isRestoringPreference && !usesUnifiedSearch,
  );
  const catalogCatalog = useMarketMapCatalogs(
    fetchBounds,
    mapDiscoveryReady && showCatalogs && !filter.isRestoringPreference && !usesUnifiedSearch,
  );
  const unifiedSearch = useMarketplaceMapSearch(
    filter,
    credit.enabled ? credit.poolRefs : undefined,
    fetchBounds,
    selectedCommerceKinds,
    mapDiscoveryReady &&
      usesUnifiedSearch &&
      selectedCommerceKinds.length > 0 &&
      !filter.isRestoringPreference &&
      filter.result.ok &&
      !credit.blocksResults &&
      !(credit.enabled && credit.poolRefs?.length === 0),
    filtersEverOpened,
  );
  const parsedFilter = filter.result.ok ? filter.result.filter : EMPTY_CATALOG_FILTER;
  const reportCatalog = useMarketMapReports({
    filter: parsedFilter,
    bounds: fetchBounds,
    creditablePools: credit.enabled ? credit.poolRefs : undefined,
    enabled:
      mapDiscoveryReady &&
      showPosts &&
      !filter.isRestoringPreference &&
      filter.result.ok &&
      !credit.blocksResults &&
      !(credit.enabled && credit.poolRefs?.length === 0),
    facets: filtersEverOpened,
  });
  const commerceTagFacets = useMarketplaceMapFacets(
    fetchBounds,
    selectedCommerceKinds,
    mapDiscoveryReady &&
      filtersEverOpened &&
      !usesUnifiedSearch &&
      selectedCommerceKinds.length > 0,
  );
  const tagFacets = useMemo(
    () =>
      mergeTagFacets(
        usesUnifiedSearch ? unifiedSearch.tagFacets : commerceTagFacets,
        reportCatalog.tagFacets,
      ),
    [commerceTagFacets, reportCatalog.tagFacets, unifiedSearch.tagFacets, usesUnifiedSearch],
  );
  // Pools go last: a stack is keyed by its first member, so pools arriving
  // after the vouchers do not re-key a fan the viewer has open.
  const locations = useMemo(() => {
    const commerce = usesUnifiedSearch
      ? unifiedSearch.locations
      : [...vouchers, ...wantCatalog.wants, ...pools, ...catalogCatalog.catalogs];
    return [...commerce, ...reportCatalog.reports];
  }, [
    catalogCatalog.catalogs,
    pools,
    reportCatalog.reports,
    unifiedSearch.locations,
    usesUnifiedSearch,
    vouchers,
    wantCatalog.wants,
  ]);

  const isCardOpen = voucherSelection.voucher !== null || wantSelection.want !== null;
  const [snap, setSnap] = useVoucherSheetSnap(isCardOpen);
  const cardAddress = voucherSelection.voucher?.toLowerCase() ?? null;
  const cardCatalogVoucher = useMemo(
    () => vouchers.find((voucher) => voucher.address.toLowerCase() === cardAddress) ?? null,
    [vouchers, cardAddress],
  );
  const selectedLocationId =
    locations.find((location) => {
      if (location.kind === "want") {
        return "wantId" in location && location.wantId === wantSelection.want;
      }
      return "address" in location && location.address.toLowerCase() === cardAddress;
    })?.id ?? null;

  const [sheetInset, setSheetInset] = useState(0);
  const handleCoveredHeightChange = useCallback((height: number, at: MapSheetSnap) => {
    // At full the map is out of sight: keep framing the area it last showed.
    if (at !== "full") setSheetInset(height);
  }, []);
  // Panning never fights a half-height card.
  const handleUserPan = useCallback(() => {
    setSnap((current) => (current === "half" ? "peek" : current));
  }, []);

  const locationButtonLabel =
    locationStatus === "requesting"
      ? t`Finding location`
      : locationStatus === "denied"
        ? t`Location denied`
        : t`Use current location`;

  const navigate = useNavigate();
  const { open: openVoucher } = voucherSelection;
  const { open: openWant } = wantSelection;
  const handleSelectLocation = useCallback(
    (id: string) => {
      const location = locations.find((candidate) => candidate.id === id);
      if (!location) return;
      if (location.kind === "pool") {
        void navigate({
          to: "/pools/$poolAddress",
          params: { poolAddress: location.address },
        });
        return;
      }
      if (location.kind === "catalog" && "catalogId" in location) {
        void navigate({
          to: "/catalogs/$catalogId",
          params: { catalogId: location.catalogId },
        });
        return;
      }
      if (location.kind === "post" && "reportId" in location) {
        void navigate({
          to: "/posts/$reportId",
          params: { reportId: location.reportId },
        });
        return;
      }
      if (location.kind === "want" && "wantId" in location) {
        openWant(location.wantId);
        return;
      }
      const voucher = "address" in location ? location : undefined;
      if (voucher) openVoucher(voucher.address);
    },
    [locations, navigate, openVoucher, openWant],
  );
  const closeSelection = useCallback(() => {
    if (wantSelection.want) wantSelection.close();
    else voucherSelection.close();
  }, [voucherSelection, wantSelection]);

  const handleViewportSettled = useCallback(
    (settled: MarketViewport) => {
      if (!area && !settled.userInitiated && !camera) return;

      const boxes = canonicalMarketBounds(viewportToBoundingBoxes(settled));
      if (boxes.length === 0) {
        if (Math.abs(settled.east - settled.west) >= 360) {
          clearArea();
          setFetchBounds([]);
        }
        return;
      }
      setArea({ center: settled.center, zoom: settled.zoom, boxes });
      setFetchBounds((current) =>
        boundsContain(current, boxes) ? current : expandBoundingBoxes(boxes),
      );
    },
    [area, camera?.rank, clearArea, setArea],
  );

  // The vouchers' notice wins: their retry is the one that fills an empty map.
  const notice =
    useMarketFilterNotice(
      filter,
      usesUnifiedSearch ? unifiedSearch.error : error,
      usesUnifiedSearch ? unifiedSearch.retry : retry,
      usesUnifiedSearch ? unifiedSearch.retrying : retrying,
    ) ??
    (unifiedSearch.error
      ? {
          message: t`Couldn't load complete marketplace results.`,
          actionLabel: t`Retry`,
          onAction: unifiedSearch.retry,
          actionPending: unifiedSearch.retrying,
        }
      : null) ??
    (poolCatalog.error
      ? {
          message: t`Couldn't load pools.`,
          actionLabel: t`Retry`,
          onAction: poolCatalog.retry,
          actionPending: poolCatalog.retrying,
        }
      : wantCatalog.error
        ? {
            message: t`Couldn't load Wants.`,
            actionLabel: t`Retry`,
            onAction: wantCatalog.retry,
            actionPending: wantCatalog.retrying,
          }
        : catalogCatalog.error
          ? {
              message: t`Couldn't load catalogs.`,
              actionLabel: t`Retry`,
              onAction: catalogCatalog.retry,
              actionPending: catalogCatalog.retrying,
            }
          : reportCatalog.error
            ? {
                message: t`Couldn't load posts.`,
                actionLabel: t`Retry`,
                onAction: reportCatalog.retry,
                actionPending: reportCatalog.retrying,
              }
            : null);

  const locationButton = (
    <Button
      size="icon-lg"
      className="pointer-events-auto bg-foreground text-background hover:bg-foreground/90 disabled:bg-foreground disabled:text-background/70"
      aria-label={locationButtonLabel}
      disabled={locationStatus === "requesting" || locationStatus === "denied"}
      onClick={requestLocation}
    >
      <RiFocus3Line className="size-5" aria-hidden="true" />
    </Button>
  );

  const mapControls = locationButton;

  const isEmpty =
    mapResources.selected.length > 0 &&
    locations.length === 0 &&
    filter.result.ok &&
    (usesUnifiedSearch
      ? (!selectedCommerceKinds.length || unifiedSearch.status === "ready") &&
        (!showPosts || !reportCatalog.retrying)
      : (!showVouchers || isCatalogComplete) &&
        (!showWants || !wantCatalog.retrying) &&
        (!showPools || !poolCatalog.retrying) &&
        (!showCatalogs || !catalogCatalog.retrying) &&
        (!showPosts || !reportCatalog.retrying));

  const changeCredit = (checked: boolean) =>
    void navigate({
      to: "/",
      search: (previous) => ({ ...previous, tab: "market", view: "map", creditable: checked }),
    });
  const clearCredit = () =>
    void navigate({
      to: "/",
      replace: true,
      search: (previous) => ({ ...previous, tab: "market", view: "map", creditable: false }),
    });

  const mapNotice =
    mapResources.selected.length === 0 ? (
      <div className="border border-border bg-card px-4 py-3 text-center text-muted-foreground text-sm">
        <Trans>Choose a resource type to show it on the map.</Trans>
      </div>
    ) : hasCreditFeedback(credit) ? (
      <CreditableBrowseControl
        part="feedback"
        state={credit}
        onChange={changeCredit}
        onClear={clearCredit}
      />
    ) : credit.enabled && credit.poolRefs?.length === 0 ? (
      <div className="border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Trans>No marketplace results are available through your Credit pools.</Trans>
      </div>
    ) : notice ? (
      <div
        className="flex items-center justify-between gap-3 border border-border bg-card px-4 py-3"
        role="alert"
      >
        <span className="min-w-0 text-sm">{notice.message}</span>
        {notice.actionLabel && notice.onAction ? (
          <Button variant="outline" tap pending={notice.actionPending} onClick={notice.onAction}>
            {notice.actionLabel}
          </Button>
        ) : null}
      </div>
    ) : isEmpty ? (
      <div className="space-y-3 border border-border bg-card px-4 py-3 text-center text-muted-foreground text-sm">
        {filter.isFiltered ? (
          <>
            <p>
              <Trans>No marketplace results match this search.</Trans>
            </p>
            <Button variant="outline" tap onClick={filter.clear}>
              <Trans>Clear filters</Trans>
            </Button>
          </>
        ) : (
          <Trans>No marketplace results to show yet.</Trans>
        )}
      </div>
    ) : null;

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
          <div className="flex justify-end">{mapControls}</div>
        </div>
      )}

      <VoucherSheet
        modal={false}
        placeholder={cardCatalogVoucher}
        realFix={realFix}
        snap={snap}
        onSnapChange={setSnap}
        onCoveredHeightChange={handleCoveredHeightChange}
        floating={mapControls}
        bottomNavigationVisible
      />
      <WantSheet
        realFix={realFix}
        snap={snap}
        onSnapChange={setSnap}
        onCoveredHeightChange={handleCoveredHeightChange}
        floating={mapControls}
      />
    </main>
  );
}

const FETCH_PADDING_RATIO = 0.2;

function expandBoundingBoxes(boxes: readonly MarketBoundingBox[]): readonly MarketBoundingBox[] {
  const expanded = boxes.map((box) => {
    const lngPadding = (box.maxLng - box.minLng) * FETCH_PADDING_RATIO;
    const latPadding = (box.maxLat - box.minLat) * FETCH_PADDING_RATIO;
    return {
      minLng: Math.max(-180, box.minLng - lngPadding),
      minLat: Math.max(-90, box.minLat - latPadding),
      maxLng: Math.min(180, box.maxLng + lngPadding),
      maxLat: Math.min(90, box.maxLat + latPadding),
    };
  });
  return canonicalMarketBounds(expanded);
}

function boundsContain(
  envelope: readonly MarketBoundingBox[],
  visible: readonly MarketBoundingBox[],
): boolean {
  return (
    envelope.length > 0 &&
    visible.every((box) =>
      envelope.some(
        (outer) =>
          outer.minLng <= box.minLng &&
          outer.minLat <= box.minLat &&
          outer.maxLng >= box.maxLng &&
          outer.maxLat >= box.maxLat,
      ),
    )
  );
}

function profileCoordinates(
  profile: { geoLat?: number | null; geoLng?: number | null } | null | undefined,
): Coordinates | null {
  const lat = profile?.geoLat;
  const lng = profile?.geoLng;
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}

function mergeTagFacets(
  first: readonly MarketTagFacet[],
  second: readonly { tag: string; count: number }[],
): MarketTagFacet[] {
  const merged = new Map<string, MarketTagFacet>();
  for (const facet of [...first, ...second]) {
    const key = facet.tag.trim().toLocaleLowerCase();
    if (!key) continue;
    const existing = merged.get(key);
    merged.set(key, {
      tag: existing?.tag ?? facet.tag,
      count: (existing?.count ?? 0) + facet.count,
    });
  }
  return [...merged.values()].sort((left, right) =>
    left.tag.localeCompare(right.tag, undefined, { sensitivity: "base" }),
  );
}
