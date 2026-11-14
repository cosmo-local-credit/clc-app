import { viewportToBoundingBoxes } from "@clc/api/features/market/client";
import { withCreditDepth, type CreditDepthValue } from "#/lib/navigation/pool-search";
import { wantDetailQueryOptions } from "@clc/api/features/wants/queries";
import { canonicalMarketBounds } from "@clc/core/features/catalog/nearby";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import type { MarketMapKind } from "@clc/core/features/market-map/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RiFocus3Line } from "react-icons/ri";

import { CreditableBrowseControl, hasCreditFeedback } from "#/components/creditable-browse-control";
import { MarketEmptyMessage } from "#/components/market-empty-message";
import { Button } from "#/components/ui/button";
import type { MapSheetSnap } from "#/components/ui/map-sheet";
import { useVoucherSheetSnap } from "#/components/vouchers/voucher-sheet";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import {
  CAMERA_RANK,
  REAL_FIX_ZOOM,
  useMarketCamera,
} from "#/features/home/hooks/use-market-camera";
import { useMarketPostFilter } from "#/features/home/hooks/use-market-post-filter";
import { useMarketMap } from "#/features/home/hooks/use-market-map";
import { useMarketMapFacets } from "#/features/home/hooks/use-market-map-facets";
import { countPointsInBoxes } from "#/features/home/logic/market-map-clusters";
import { useMarketMapResourceSelection } from "#/features/home/hooks/use-market-map-resource-selection";
import type { OutputVoucherBrowse } from "#/features/home/hooks/use-output-voucher-browse";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { useMarketFilterNotice } from "#/features/home/ui/market-filter-ui";
import type { MarketCamera, MarketViewport } from "#/features/home/ui/market-map";
import { wantsClient } from "#/lib/api/wants";
import { CHAIN_ID } from "#/lib/chain";
import { usePostTiming } from "#/lib/navigation/use-post-timing";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import { useWantSheetSelection } from "#/lib/navigation/use-want-sheet-selection";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { useMarketDiscoveryArea } from "#/components/nearby-catalog";

type Coordinates = { lat: number; lng: number };

/** What the map's one notice slot says, for a surface that draws its own notice. */
type MarketMapStatus =
  | { kind: "no-kinds" }
  | { kind: "credit" }
  | { kind: "credit-empty" }
  | { kind: "notice"; notice: NonNullable<ReturnType<typeof useMarketFilterNotice>> }
  | { kind: "empty"; filtered: boolean }
  | null;

/**
 * Map screen state shared by the phone map and the desktop split.
 * `kinds` forces one scope's markers. Absent, the viewer's saved resource
 * selection applies, which is what the phone map does.
 */
export function useMarketScreen({
  isAuthenticated = false,
  locationOwner = GUEST_STORAGE_OWNER,
  creditDepthSearch,
  kinds,
  creditRoute = "home",
  output,
  alsoClear,
}: {
  isAuthenticated?: boolean;
  locationOwner?: string;
  creditDepthSearch?: number | string | readonly (number | string)[];
  kinds?: readonly MarketMapKind[];
  /** Where Credit writes its search param. The phone map is the home tab. */
  creditRoute?: "home" | "market";
  /**
   * The link's requested output voucher (`out_voucher`), already read by the
   * caller through `useOutputVoucherBrowse` together with Credit. Only the
   * desktop pools map passes it: its pool restriction replaces Credit's alone
   * (it already contains it), and a selected pool opens its swap with the
   * voucher on the receiving side. The phone map leaves it out and is unchanged.
   */
  output?: Pick<OutputVoucherBrowse, "address" | "poolRefs" | "blocksResults" | "state">;
  /** Runs after `filter.clear`, for a surface whose Clear filters also drops Credit or the output. */
  alsoClear?: () => void;
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
  const [hasSettledViewport, setHasSettledViewport] = useState(() => Boolean(area));
  const areaOwnerRef = useRef(locationOwner);
  useEffect(() => {
    if (areaOwnerRef.current === locationOwner) return;
    areaOwnerRef.current = locationOwner;
    setHasSettledViewport(Boolean(area));
  }, [area, locationOwner]);
  const voucherSelection = useVoucherSheetSelection();
  const wantSelection = useWantSheetSelection();

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

  // A link that names an output voucher is explicit: a remembered tag set must not join it.
  const storageOwner = useStorageOwner();
  const filter = useMarketPostFilter(storageOwner, output !== undefined && output.state !== "off");
  const postTiming = usePostTiming(storageOwner);
  const credit = useCreditableBrowse(creditDepthSearch);
  const mapResources = useMarketMapResourceSelection(locationOwner);
  const activeKinds = kinds ?? mapResources.selected;
  const includesPosts = activeKinds.includes("post");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersEverOpened, setFiltersEverOpened] = useState(false);
  const parsedFilter = filter.result.ok ? filter.result.filter : EMPTY_CATALOG_FILTER;
  const mapFilters = {
    filter: parsedFilter,
    kinds: activeKinds,
    postTiming: postTiming.timing,
    postVouchers: includesPosts ? parsedFilter.vouchers : [],
    postVoucherMatch: parsedFilter.voucherMatch,
    postPools: includesPosts ? parsedFilter.pools : [],
    postPoolMatch: parsedFilter.poolMatch,
    // With an output voucher the filter is that voucher's pools, already narrowed to
    // Credit's; otherwise Credit alone is resolved by the server for this wallet.
    creditablePools: output?.address ? output.poolRefs : undefined,
    credit: !output?.address && credit.enabled ? credit.scope : undefined,
  };
  const discoveryEnabled =
    activeKinds.length > 0 &&
    !filter.isRestoringPreference &&
    filter.result.ok &&
    !credit.blocksResults &&
    !output?.blocksResults &&
    !(credit.enabled && credit.poolRefs?.length === 0);
  // The points do not depend on the viewport, so they need not wait for one.
  const marketMap = useMarketMap({ ...mapFilters, enabled: discoveryEnabled });
  const visibleBoxes = area?.boxes ?? [];
  const { tagFacets, postVoucherFacets, postPoolFacets } = useMarketMapFacets({
    ...mapFilters,
    bounds: visibleBoxes,
    enabled: discoveryEnabled && filtersEverOpened,
  });
  const locations = marketMap.locations;
  const visibleCount = useMemo(
    () => countPointsInBoxes(locations, visibleBoxes),
    [locations, visibleBoxes],
  );

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
    if (at !== "full") setSheetInset(height);
  }, []);
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
        // A member who asked for a voucher arrives at its swap with it chosen.
        if (isAuthenticated && output?.address) {
          void navigate({
            to: "/pools/$poolAddress/swap",
            params: { poolAddress: location.resourceId },
            search: { receive: output.address },
          });
          return;
        }
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
    [isAuthenticated, locations, navigate, openVoucher, openWant, output?.address],
  );
  const closeSelection = useCallback(() => {
    if (wantSelection.want) wantSelection.close();
    else voucherSelection.close();
  }, [voucherSelection, wantSelection]);

  const handleViewportSettled = useCallback(
    (settled: MarketViewport) => {
      setHasSettledViewport(true);
      if (!area && !settled.userInitiated && !camera) return;

      const boxes = canonicalMarketBounds(viewportToBoundingBoxes(settled));
      if (boxes.length === 0) {
        if (Math.abs(settled.east - settled.west) >= 360) clearArea();
        return;
      }
      setArea({ center: settled.center, zoom: settled.zoom, boxes });
    },
    [area, camera?.rank, clearArea, setArea],
  );

  const filterClear = filter.clear;
  const clearFilters = useCallback(() => {
    filterClear();
    postTiming.setTiming("future");
    alsoClear?.();
  }, [alsoClear, filterClear, postTiming.setTiming]);
  const incomplete = t`Couldn't load complete marketplace results.`;
  const notice = useMarketFilterNotice(
    { ...filter, clear: clearFilters },
    marketMap.error,
    marketMap.retry,
    marketMap.retrying,
    incomplete,
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

  const isEmpty =
    activeKinds.length > 0 && visibleCount === 0 && filter.result.ok && marketMap.isSettled;

  const changeCredit = (depth: CreditDepthValue | undefined) =>
    void navigate({
      to: creditRoute === "market" ? "/market" : "/",
      search: (previous) =>
        creditRoute === "market"
          ? { ...previous, ...withCreditDepth(depth) }
          : { ...previous, tab: "market", view: "map", ...withCreditDepth(depth) },
    });
  const clearCredit = () =>
    void navigate({
      to: creditRoute === "market" ? "/market" : "/",
      replace: true,
      search: (previous) =>
        creditRoute === "market"
          ? { ...previous, ...withCreditDepth(undefined) }
          : { ...previous, tab: "market", view: "map", ...withCreditDepth(undefined) },
    });

  // What the result count may claim. A zero is only a count once a result set
  // has arrived; a failed or blocked request has no count, and one that has not
  // started yet is still on its way.
  const resultsBlocked =
    activeKinds.length === 0 ||
    !filter.result.ok ||
    credit.blocksResults ||
    output?.blocksResults === true ||
    (credit.enabled && credit.poolRefs?.length === 0);
  const resultsState: "ready" | "unavailable" | "pending" = marketMap.hasData
    ? "ready"
    : marketMap.status === "error" || resultsBlocked
      ? "unavailable"
      : "pending";

  const mapStatus: MarketMapStatus =
    activeKinds.length === 0
      ? { kind: "no-kinds" }
      : hasCreditFeedback(credit)
        ? { kind: "credit" }
        : credit.enabled && credit.poolRefs?.length === 0
          ? { kind: "credit-empty" }
          : notice
            ? { kind: "notice", notice }
            : marketMap.truncated
              ? { kind: "notice", notice: { message: incomplete } }
              : isEmpty
                ? {
                    kind: "empty",
                    filtered:
                      filter.isFiltered || (includesPosts && postTiming.timing !== "future"),
                  }
                : null;

  const mapNotice: ReactNode =
    mapStatus?.kind === "no-kinds" ? (
      <div className="border border-border bg-card px-4 py-3 text-center text-muted-foreground text-sm">
        <Trans>Choose a resource type to show it on the map.</Trans>
      </div>
    ) : mapStatus?.kind === "credit" ? (
      <CreditableBrowseControl
        part="feedback"
        state={credit}
        onChange={changeCredit}
        onClear={clearCredit}
      />
    ) : mapStatus?.kind === "credit-empty" ? (
      <div className="border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Trans>No marketplace results are available through your Credit pools.</Trans>
      </div>
    ) : mapStatus?.kind === "notice" ? (
      <div
        className="flex items-center justify-between gap-3 border border-border bg-card px-4 py-3"
        role="alert"
      >
        <span className="min-w-0 text-sm">{mapStatus.notice.message}</span>
        {mapStatus.notice.actionLabel && mapStatus.notice.onAction ? (
          <Button
            variant="outline"
            tap
            pending={mapStatus.notice.actionPending}
            onClick={mapStatus.notice.onAction}
          >
            {mapStatus.notice.actionLabel}
          </Button>
        ) : null}
      </div>
    ) : mapStatus?.kind === "empty" ? (
      <div className="space-y-3 border border-border bg-card px-4 py-3 text-center text-muted-foreground text-sm">
        {mapStatus.filtered ? (
          <>
            <p>
              <Trans>No marketplace results match this search.</Trans>
            </p>
            <Button variant="outline" tap onClick={clearFilters}>
              <Trans>Clear filters</Trans>
            </Button>
          </>
        ) : (
          <MarketEmptyMessage surface="map" />
        )}
      </div>
    ) : null;

  return {
    camera,
    cameraBootstrapPending,
    realFix,
    userLocation,
    locationOwner,
    locations,
    activeKinds,
    exactBounds: area?.boxes ?? [],
    viewportCenter: area?.center ?? null,
    hasSettledViewport,
    isFetching: marketMap.isFetching,
    tagFacets,
    postVoucherFacets,
    postPoolFacets,
    postTiming,
    includesPosts,
    selectedLocationId,
    filter,
    mapResources,
    credit,
    results: {
      state: resultsState,
      /** Points inside the visible viewport, or every point before one has settled. */
      total: visibleCount,
    },
    filtersOpen,
    setFiltersOpen,
    setFiltersEverOpened,
    voucherSelection,
    wantSelection,
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
    mapStatus,
    changeCredit,
    clearCredit,
    clearFilters,
  };
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
