import "maplibre-gl/dist/maplibre-gl.css";
import { Trans } from "@lingui/react/macro";
import MapLibreGL, {
  type DataDrivenPropertyValueSpecification,
  type FilterSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "#/lib/utils";
import { MARKET_SOURCE_ID, type MarketLocation, type MarketLocationKind } from "./market-data";
import { addMarketMarkerImages, markerImageIds } from "./market-markers";

const NAIROBI = { lat: -1.2921, lng: 36.8219 };
const DEFAULT_ZOOM = 12;

/**
 * Supercluster exposes raw points at `clusterMaxZoom + 1`. Keeping the cluster
 * ceiling at the map's reachable maximum means an exactly-coincident stack
 * stays one terminal count badge at every zoom the user can reach, instead of
 * exploding into hundreds of overlapping symbols. The source maximum is one
 * higher because MapLibre expects `maxzoom > clusterMaxZoom`.
 */
const MAP_MAX_ZOOM = 21;
const SOURCE_MAX_ZOOM = 22;
/** ~1.9 m at the equator at zoom 21, so distinct traders can still separate. */
const CLUSTER_RADIUS = 50;

const CLUSTERS_LAYER_ID = "market-clusters";
const CLUSTER_COUNT_LAYER_ID = "market-cluster-count";
const UNCLUSTERED_LAYER_ID = "market-points";
const SELECTED_LAYER_ID = "market-point-selected";

const VIEWPORT_SETTLE_MS = 400;

type UserLocation = { lat: number; lng: number };

/**
 * A camera candidate resolved by rank, never by arrival order. Lower rank
 * wins, and a candidate only applies when it beats the already-applied rank.
 */
export type MarketCamera = {
  lat: number;
  lng: number;
  zoom: number;
  rank: number;
};

/**
 * The black location button is an explicit user request, so it outranks every
 * automatic candidate and is exempt from the interaction latch.
 */
export const EXPLICIT_CAMERA_RANK = 0;

export type MarketViewport = {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
};

type MarketMapProps = {
  locations: MarketLocation[];
  selectedLocationId: string | null;
  camera: MarketCamera | null;
  userLocation: UserLocation | null;
  onSelectLocation: (id: string) => void;
  onViewportSettled?: (viewport: MarketViewport) => void;
  className?: string;
};

type MarketFeature = {
  type: "Feature";
  properties: { id: string; kind: MarketLocationKind; name: string };
  geometry: { type: "Point"; coordinates: [number, number] };
};

type MarketFeatureCollection = {
  type: "FeatureCollection";
  features: MarketFeature[];
};

function hasWebGlSupport(): boolean {
  const canvas = document.createElement("canvas");
  return !!(canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl"));
}

function createMarketFeatureCollection(locations: MarketLocation[]): MarketFeatureCollection {
  return {
    type: "FeatureCollection",
    features: locations.map((location) => ({
      type: "Feature",
      properties: { id: location.id, kind: location.kind, name: location.name },
      geometry: { type: "Point", coordinates: [location.lng, location.lat] },
    })),
  };
}

function createUserMarker(): HTMLDivElement {
  const marker = document.createElement("div");
  marker.className = "relative flex size-7 items-center justify-center rounded-full bg-transparent";
  marker.innerHTML =
    "<span class='absolute size-5 rounded-full bg-foreground/30 animate-ping'></span><span class='relative size-2 rounded-full bg-foreground'></span>";
  return marker;
}

function kindMatchExpression(selected: boolean): DataDrivenPropertyValueSpecification<string> {
  const ids = selected ? markerImageIds.selected : markerImageIds.base;
  return [
    "match",
    ["get", "kind"],
    "goods",
    ids.goods,
    "services",
    ids.services,
    "voucher",
    ids.voucher,
    ids.voucher,
  ];
}

function addMarketLayers(map: MapLibreGL.Map, locations: MarketLocation[]) {
  addMarketMarkerImages(map);

  map.addSource(MARKET_SOURCE_ID, {
    type: "geojson",
    data: createMarketFeatureCollection(locations),
    cluster: true,
    clusterMaxZoom: MAP_MAX_ZOOM,
    clusterRadius: CLUSTER_RADIUS,
    maxzoom: SOURCE_MAX_ZOOM,
  });

  map.addLayer({
    id: CLUSTERS_LAYER_ID,
    type: "circle",
    source: MARKET_SOURCE_ID,
    filter: ["has", "point_count"],
    paint: { "circle-color": "#1f2430", "circle-radius": 14, "circle-stroke-width": 0 },
  });
  map.addLayer({
    id: CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    source: MARKET_SOURCE_ID,
    filter: ["has", "point_count"],
    layout: { "text-field": "{point_count_abbreviated}", "text-size": 11 },
    paint: { "text-color": "#ffffff" },
  });
  map.addLayer({
    id: UNCLUSTERED_LAYER_ID,
    type: "symbol",
    source: MARKET_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": kindMatchExpression(false),
      "icon-size": 1,
      "icon-allow-overlap": true,
    },
  });
  // Selection is a filtered overlay layer, not setFeatureState: MapLibre does
  // not forward promoteId into Supercluster's cluster options, so the voucher
  // property id is not a usable source feature id on a clustered source.
  map.addLayer({
    id: SELECTED_LAYER_ID,
    type: "symbol",
    source: MARKET_SOURCE_ID,
    filter: selectedFilter(null),
    layout: {
      "icon-image": kindMatchExpression(true),
      "icon-size": 1,
      "icon-allow-overlap": true,
    },
  });
}

function selectedFilter(selectedId: string | null): FilterSpecification {
  return ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], selectedId ?? ""]];
}

export function MarketMap({
  locations,
  selectedLocationId,
  camera,
  userLocation,
  onSelectLocation,
  onViewportSettled,
  className,
}: MarketMapProps) {
  const containerRef = useRef<HTMLElement>(null);
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const userMarkerRef = useRef<MapLibreGL.Marker | null>(null);
  const appliedCameraRef = useRef<MarketCamera | null>(null);
  const userHasInteractedRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const maptilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
  const maptilerStyle = maptilerKey
    ? `https://api.maptiler.com/maps/base-v4/style.json?key=${encodeURIComponent(maptilerKey)}`
    : null;

  // Latest-value refs keep the construction effect free of data, selection, and
  // callback dependencies, so the map is built once per style/container.
  const locationsRef = useRef(locations);
  locationsRef.current = locations;
  const onSelectRef = useRef(onSelectLocation);
  onSelectRef.current = onSelectLocation;
  const onViewportSettledRef = useRef(onViewportSettled);
  onViewportSettledRef.current = onViewportSettled;

  const reportViewport = useCallback((map: MapLibreGL.Map) => {
    const report = onViewportSettledRef.current;
    if (!report) return;
    const bounds = map.getBounds().adjustAntiMeridian();
    report({
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
      zoom: map.getZoom(),
    });
  }, []);

  useEffect(() => {
    if (!maptilerStyle || failed || !containerRef.current || mapRef.current) return;
    if (!hasWebGlSupport()) {
      setFailed(true);
      return;
    }

    let map: MapLibreGL.Map;
    try {
      map = new MapLibreGL.Map({
        container: containerRef.current,
        style: maptilerStyle,
        center: [NAIROBI.lng, NAIROBI.lat],
        zoom: DEFAULT_ZOOM,
        maxZoom: MAP_MAX_ZOOM,
        attributionControl: false,
      });
    } catch {
      setFailed(true);
      return;
    }

    mapRef.current = map;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    function handlePointClick(event: MapLayerMouseEvent) {
      const id = event.features?.[0]?.properties?.id;
      // Selection styles a feature and opens the preview. It deliberately does
      // not move the camera: the marker is already on screen, so animating to
      // it fights the user and triggers a needless viewport request.
      if (typeof id === "string") onSelectRef.current(id);
    }

    function handleClusterClick(event: MapLayerMouseEvent) {
      const feature = event.features?.[0];
      const clusterId = feature?.properties?.cluster_id;
      if (typeof clusterId !== "number") return;
      const source = map.getSource(MARKET_SOURCE_ID) as GeoJSONSource | undefined;
      void source?.getClusterExpansionZoom(clusterId).then((zoom) => {
        if (!feature || feature.geometry.type !== "Point") return;
        // A fully coincident cluster expands to the source maximum, which is
        // past the reachable ceiling. Clamping keeps it a terminal badge.
        map.easeTo({
          center: feature.geometry.coordinates as [number, number],
          zoom: Math.min(zoom, map.getMaxZoom()),
        });
      });
    }

    function handleUserInteraction(event: { originalEvent?: unknown }) {
      // Programmatic camera moves emit the same events without an originalEvent.
      if (event?.originalEvent) userHasInteractedRef.current = true;
    }

    function handleMoveEnd() {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => reportViewport(map), VIEWPORT_SETTLE_MS);
    }

    function handleLoad() {
      addMarketLayers(map, locationsRef.current);
      setLoaded(true);
    }

    map.on("load", handleLoad);
    map.on("click", UNCLUSTERED_LAYER_ID, handlePointClick);
    map.on("click", SELECTED_LAYER_ID, handlePointClick);
    map.on("click", CLUSTERS_LAYER_ID, handleClusterClick);
    map.on("dragstart", handleUserInteraction);
    map.on("zoomstart", handleUserInteraction);
    map.on("moveend", handleMoveEnd);

    return () => {
      clearTimeout(settleTimer);
      map.off("load", handleLoad);
      map.off("click", UNCLUSTERED_LAYER_ID, handlePointClick);
      map.off("click", SELECTED_LAYER_ID, handlePointClick);
      map.off("click", CLUSTERS_LAYER_ID, handleClusterClick);
      map.off("dragstart", handleUserInteraction);
      map.off("zoomstart", handleUserInteraction);
      map.off("moveend", handleMoveEnd);
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      appliedCameraRef.current = null;
      userHasInteractedRef.current = false;
      setLoaded(false);
    };
  }, [failed, maptilerStyle, reportViewport]);

  // Data: update the single GeoJSON source in place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const source = map.getSource(MARKET_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(createMarketFeatureCollection(locations));
  }, [loaded, locations]);

  // Selection: swap the overlay layer's filter only.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.setFilter(SELECTED_LAYER_ID, selectedFilter(selectedLocationId));
  }, [loaded, selectedLocationId]);

  // Camera: ranked candidates plus the explicit location button.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !camera) return;
    if (appliedCameraRef.current === camera) return;

    const applied = appliedCameraRef.current;
    if (camera.rank !== EXPLICIT_CAMERA_RANK) {
      if (userHasInteractedRef.current) return;
      if (applied && camera.rank >= applied.rank) return;
    }

    appliedCameraRef.current = camera;
    map.easeTo({ center: [camera.lng, camera.lat], zoom: camera.zoom });
  }, [camera, loaded]);

  // The only DOM marker on the map is the user's own position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    if (!userLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }

    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
      return;
    }
    userMarkerRef.current = new MapLibreGL.Marker({ element: createUserMarker() })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map);
  }, [loaded, userLocation]);

  if (!maptilerStyle || failed) {
    // Deliberately does not map over `locations`: a decorative stand-in for
    // thousands of vouchers is both meaningless and expensive.
    return (
      <section
        aria-label="Market map"
        className={cn(
          "market-map-fallback relative flex items-center justify-center overflow-hidden bg-card px-6",
          className,
        )}
      >
        <p className="max-w-[18rem] text-center text-muted-foreground text-sm">
          <Trans>The map is unavailable on this device. Browse vouchers as a list instead.</Trans>
        </p>
      </section>
    );
  }

  return (
    <section ref={containerRef} aria-label="Market map" className={cn("bg-card", className)} />
  );
}
