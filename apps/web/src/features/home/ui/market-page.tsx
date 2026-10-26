import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RiFocus3Line } from "react-icons/ri";
import { canonicalMarketBounds, type MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import { viewportToBoundingBoxes } from "@clc/api/features/market/client";

import { CreditableBrowseControl, hasCreditFeedback } from "#/components/creditable-browse-control";
import { MarketBar } from "#/components/market-bar";
import { Button } from "#/components/ui/button";
import { Progress, ProgressTrack } from "#/components/ui/progress";
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
import { useMarketMap } from "#/features/home/hooks/use-market-map";
import { useMarketMapResourceSelection } from "#/features/home/hooks/use-market-map-resource-selection";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
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
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import { CHAIN_ID } from "#/lib/chain";

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
    bufferedTileBounds(area?.boxes ?? [], area?.zoom ?? 2),
  );
  const [fetchZoom, setFetchZoom] = useState(() => Math.floor(area?.zoom ?? 2));
  const fetchZoomRef = useRef(fetchZoom);
  const areaOwnerRef = useRef(locationOwner);
  useEffect(() => {
    if (areaOwnerRef.current === locationOwner) return;
    areaOwnerRef.current = locationOwner;
    setFetchBounds(bufferedTileBounds(area?.boxes ?? [], area?.zoom ?? 2));
    setFetchZoom(Math.floor(area?.zoom ?? 2));
    fetchZoomRef.current = Math.floor(area?.zoom ?? 2);
  }, [area, locationOwner]);
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersEverOpened, setFiltersEverOpened] = useState(false);
  const parsedFilter = filter.result.ok ? filter.result.filter : EMPTY_CATALOG_FILTER;
  const marketMap = useMarketMap({
    filter: parsedFilter,
    bounds: fetchBounds,
    zoom: fetchZoom,
    kinds: mapResources.selected,
    creditablePools: credit.enabled ? credit.poolRefs : undefined,
    enabled:
      mapDiscoveryReady &&
      mapResources.selected.length > 0 &&
      !filter.isRestoringPreference &&
      filter.result.ok &&
      !credit.blocksResults &&
      !(credit.enabled && credit.poolRefs?.length === 0),
    facets: filtersEverOpened,
  });
  const locations = marketMap.locations;
  const tagFacets = marketMap.tagFacets;

  const isCardOpen = voucherSelection.voucher !== null || wantSelection.want !== null;
  const [snap, setSnap] = useVoucherSheetSnap(isCardOpen);
  const cardAddress = voucherSelection.voucher?.toLowerCase() ?? null;
  const cardLocation = locations.find(
    (location) =>
      location.resourceKind === "voucher" && location.resourceId.toLowerCase() === cardAddress,
  );
  const cardCatalogVoucher = cardLocation
    ? {
        id: cardLocation.id,
        chainId: CHAIN_ID,
        address: cardLocation.resourceId as `0x${string}`,
        name: cardLocation.name,
        symbol: "",
        iconUrl: null,
        locationName: cardLocation.locationName,
        lat: cardLocation.lat,
        lng: cardLocation.lng,
        kind: "voucher" as const,
        markerIcon: cardLocation.markerIcon,
        markerColor: cardLocation.markerColor,
      }
    : null;
  const selectedLocationId =
    locations.find((location) => {
      if (location.resourceKind === "want") return location.resourceId === wantSelection.want;
      return (
        location.resourceKind === "voucher" && location.resourceId.toLowerCase() === cardAddress
      );
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
      if (location.resourceKind === "pool") {
        void navigate({
          to: "/pools/$poolAddress",
          params: { poolAddress: location.resourceId },
        });
        return;
      }
      if (location.resourceKind === "catalog") {
        void navigate({
          to: "/catalogs/$catalogId",
          params: { catalogId: location.resourceId },
        });
        return;
      }
      if (location.resourceKind === "post") {
        void navigate({
          to: "/posts/$reportId",
          params: { reportId: location.resourceId },
        });
        return;
      }
      if (location.resourceKind === "want") {
        openWant(location.resourceId);
        return;
      }
      if (location.resourceKind === "voucher") {
        openVoucher(location.resourceId as `0x${string}`);
      }
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
      const zoom = Math.floor(settled.zoom);
      const zoomChanged = fetchZoomRef.current !== zoom;
      fetchZoomRef.current = zoom;
      if (boxes.length === 0) {
        if (Math.abs(settled.east - settled.west) >= 360) {
          clearArea();
          setFetchBounds([]);
          setFetchZoom(zoom);
        }
        return;
      }
      setArea({ center: settled.center, zoom: settled.zoom, boxes });
      setFetchZoom(zoom);
      setFetchBounds((current) =>
        !zoomChanged && boundsContain(current, boxes)
          ? current
          : bufferedTileBounds(boxes, settled.zoom),
      );
    },
    [area, camera?.rank, clearArea, setArea],
  );

  const notice = useMarketFilterNotice(
    filter,
    marketMap.error,
    marketMap.retry,
    marketMap.retrying,
    t`Couldn't load complete marketplace results.`,
  );

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
    marketMap.clusters.length === 0 &&
    filter.result.ok &&
    marketMap.isSettled;

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
            clusters={marketMap.clusters}
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
        progress={<MarketMapLoading loading={marketMap.isFetching} />}
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

const FETCH_PADDING_RATIO = 0.2;

function bufferedTileBounds(
  boxes: readonly MarketBoundingBox[],
  zoom: number,
): readonly MarketBoundingBox[] {
  const expanded = boxes.map((box) => {
    const lngPadding = (box.maxLng - box.minLng) * FETCH_PADDING_RATIO;
    const latPadding = (box.maxLat - box.minLat) * FETCH_PADDING_RATIO;
    return snapBoxToTiles(
      {
        minLng: Math.max(-180, box.minLng - lngPadding),
        minLat: Math.max(-90, box.minLat - latPadding),
        maxLng: Math.min(180, box.maxLng + lngPadding),
        maxLat: Math.min(90, box.maxLat + latPadding),
      },
      zoom,
    );
  });
  return canonicalMarketBounds(expanded);
}

function snapBoxToTiles(box: MarketBoundingBox, zoom: number): MarketBoundingBox {
  const tileZoom = Math.max(0, Math.min(16, Math.floor(zoom)));
  const tiles = 2 ** tileZoom;
  const minX = Math.floor(((box.minLng + 180) / 360) * tiles);
  const maxX = Math.ceil(((box.maxLng + 180) / 360) * tiles);
  const minY = Math.floor(latitudeToTileY(box.maxLat, tiles));
  const maxY = Math.ceil(latitudeToTileY(box.minLat, tiles));
  return {
    minLng: Math.max(-180, (minX / tiles) * 360 - 180),
    maxLng: Math.min(180, (maxX / tiles) * 360 - 180),
    minLat: tileYToLatitude(maxY, tiles),
    maxLat: tileYToLatitude(minY, tiles),
  };
}

function latitudeToTileY(latitude: number, tiles: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const radians = (clamped * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * tiles;
}

function tileYToLatitude(y: number, tiles: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / tiles))) * 180) / Math.PI;
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
