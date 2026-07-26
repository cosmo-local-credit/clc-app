import "maplibre-gl/dist/maplibre-gl.css";
import { Trans } from "@lingui/react/macro";
import MapLibreGL, {
  type DataDrivenPropertyValueSpecification,
  type FilterSpecification,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "#/lib/utils";
import { MARKET_SOURCE_ID, type MarketLocation, type MarketLocationKind } from "./market-data";
import { addMarketMarkerImages, markerImageIds } from "./market-markers";
import { type MarketStack, groupByCoordinate, spiderfyOffsets } from "./market-stacks";

const NAIROBI = { lat: -1.2921, lng: 36.8219 };
const DEFAULT_ZOOM = 12;
const MAP_MAX_ZOOM = 20;

/**
 * Distance clustering exists only to keep country- and world-level views
 * drawable. From zoom 14 (roughly a 5 km view) every distinct coordinate gets
 * its own marker: a badge the user cannot open is worse than a busy map.
 *
 * Vouchers sharing one exact coordinate are a separate problem — 76% of the
 * imported catalog does, with stacks as large as 200, because whole towns were
 * geocoded to a single centroid. No zoom can separate those, so they are
 * grouped up front and fanned out on tap.
 */
const CLUSTER_MAX_ZOOM = 13;
const CLUSTER_RADIUS = 50;

const CLUSTERS_LAYER_ID = "market-clusters";
const CLUSTER_COUNT_LAYER_ID = "market-cluster-count";
const UNCLUSTERED_LAYER_ID = "market-points";
const SELECTED_LAYER_ID = "market-point-selected";
const STACK_LAYER_ID = "market-stacks";
const STACK_COUNT_LAYER_ID = "market-stack-count";
const SPIDER_SOURCE_ID = "market-spider";
const SPIDER_LEG_LAYER_ID = "market-spider-legs";
const SPIDER_POINT_LAYER_ID = "market-spider-points";

const INTERACTIVE_LAYER_IDS = [
  SPIDER_POINT_LAYER_ID,
  STACK_LAYER_ID,
  STACK_COUNT_LAYER_ID,
  SELECTED_LAYER_ID,
  UNCLUSTERED_LAYER_ID,
  CLUSTERS_LAYER_ID,
  CLUSTER_COUNT_LAYER_ID,
];

const VIEWPORT_SETTLE_MS = 400;
const BADGE_COLOR = "#1f2430";

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

type StackFeature = {
  type: "Feature";
  properties: {
    key: string;
    count: number;
    id: string;
    kind: MarketLocationKind;
    name: string;
  };
  geometry: { type: "Point"; coordinates: [number, number] };
};

type SpiderFeature = {
  type: "Feature";
  properties: { id: string; kind: MarketLocationKind; name: string };
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] };
};

type FeatureCollection<T> = { type: "FeatureCollection"; features: T[] };

function hasWebGlSupport(): boolean {
  const canvas = document.createElement("canvas");
  return !!(canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl"));
}

function emptyCollection<T>(): FeatureCollection<T> {
  return { type: "FeatureCollection", features: [] };
}

function createStackCollection(stacks: MarketStack[]): FeatureCollection<StackFeature> {
  return {
    type: "FeatureCollection",
    features: stacks.map((stack) => {
      const first = stack.members[0];
      const single = stack.members.length === 1 && first ? first : null;
      return {
        type: "Feature",
        properties: {
          key: stack.key,
          count: stack.members.length,
          // Only a lone voucher carries an id; a stack must be opened first.
          id: single ? single.id : "",
          kind: single?.kind ?? first?.kind ?? "voucher",
          name: single?.name ?? "",
        },
        geometry: { type: "Point", coordinates: [stack.lng, stack.lat] },
      };
    }),
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

/** Selected styling is a filtered overlay: promoteId is not forwarded to Supercluster. */
function selectedFilter(selectedId: string | null): FilterSpecification {
  return [
    "all",
    ["!", ["has", "point_count"]],
    ["==", ["get", "count"], 1],
    ["==", ["get", "id"], selectedId ?? ""],
  ];
}

const singleFilter: FilterSpecification = [
  "all",
  ["!", ["has", "point_count"]],
  ["==", ["get", "count"], 1],
];

const stackFilter: FilterSpecification = [
  "all",
  ["!", ["has", "point_count"]],
  [">", ["get", "count"], 1],
];

/**
 * Query results are ordered by the style's layer order, which is not the same
 * as "what the user thinks they tapped". Pick explicitly: an open fan's pins
 * sit above everything, then coincident stacks, then lone vouchers.
 */
function pickTopFeature(
  features: MapLibreGL.MapGeoJSONFeature[],
): MapLibreGL.MapGeoJSONFeature | null {
  for (const layerId of INTERACTIVE_LAYER_IDS) {
    const match = features.find((feature) => feature.layer.id === layerId);
    if (match) return match;
  }
  return features[0] ?? null;
}

function addMarketLayers(map: MapLibreGL.Map, stacks: MarketStack[]) {
  addMarketMarkerImages(map);

  map.addSource(MARKET_SOURCE_ID, {
    type: "geojson",
    data: createStackCollection(stacks),
    cluster: true,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    clusterRadius: CLUSTER_RADIUS,
  });
  map.addSource(SPIDER_SOURCE_ID, { type: "geojson", data: emptyCollection<SpiderFeature>() });

  map.addLayer({
    id: CLUSTERS_LAYER_ID,
    type: "circle",
    source: MARKET_SOURCE_ID,
    filter: ["has", "point_count"],
    paint: { "circle-color": BADGE_COLOR, "circle-radius": 14, "circle-stroke-width": 0 },
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
    filter: singleFilter,
    layout: {
      "icon-image": kindMatchExpression(false),
      "icon-size": 1,
      "icon-allow-overlap": true,
    },
  });

  // A coincident stack keeps a white ring so it reads as openable, unlike a
  // distance cluster which simply expands when you zoom.
  map.addLayer({
    id: STACK_LAYER_ID,
    type: "circle",
    source: MARKET_SOURCE_ID,
    filter: stackFilter,
    paint: {
      "circle-color": BADGE_COLOR,
      "circle-radius": 14,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
  map.addLayer({
    id: STACK_COUNT_LAYER_ID,
    type: "symbol",
    source: MARKET_SOURCE_ID,
    filter: stackFilter,
    layout: { "text-field": ["to-string", ["get", "count"]], "text-size": 11 },
    paint: { "text-color": "#ffffff" },
  });

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

  map.addLayer({
    id: SPIDER_LEG_LAYER_ID,
    type: "line",
    source: SPIDER_SOURCE_ID,
    filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": BADGE_COLOR, "line-width": 1.25, "line-opacity": 0.6 },
  });
  map.addLayer({
    id: SPIDER_POINT_LAYER_ID,
    type: "symbol",
    source: SPIDER_SOURCE_ID,
    filter: ["==", ["geometry-type"], "Point"],
    layout: {
      "icon-image": kindMatchExpression(false),
      "icon-size": 1,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
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
  const [spiderKey, setSpiderKey] = useState<string | null>(null);

  const maptilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
  const maptilerStyle = maptilerKey
    ? `https://api.maptiler.com/maps/base-v4/style.json?key=${encodeURIComponent(maptilerKey)}`
    : null;

  const stacks = useMemo(() => groupByCoordinate(locations), [locations]);
  const stacksByKey = useMemo(() => new Map(stacks.map((stack) => [stack.key, stack])), [stacks]);

  // Latest-value refs keep the construction effect free of data, selection, and
  // callback dependencies, so the map is built once per style/container.
  const stacksRef = useRef(stacks);
  stacksRef.current = stacks;
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

    // One handler, not several layer-scoped ones. MapLibre fires every matching
    // listener for a single click, so a separate "close the fan" listener would
    // race the listener that just opened it and win.
    function handleMapClick(event: MapMouseEvent) {
      const hits = map.queryRenderedFeatures(event.point, { layers: INTERACTIVE_LAYER_IDS });
      const feature = pickTopFeature(hits);

      if (!feature) {
        setSpiderKey(null);
        return;
      }

      if (feature.layer.id === SPIDER_POINT_LAYER_ID) {
        selectFeature(feature);
        return;
      }

      const clusterId = feature.properties?.cluster_id;
      if (typeof clusterId === "number") {
        expandCluster(clusterId, feature);
        return;
      }

      const key = feature.properties?.key;
      if (typeof key === "string" && Number(feature.properties?.count) > 1) {
        setSpiderKey((current) => (current === key ? null : key));
        return;
      }

      // Selection styles a feature and opens the preview. It deliberately does
      // not move the camera: the marker is already on screen.
      selectFeature(feature);
    }

    function selectFeature(feature: MapLibreGL.MapGeoJSONFeature) {
      const id = feature.properties?.id;
      if (typeof id === "string" && id) onSelectRef.current(id);
    }

    function expandCluster(clusterId: number, feature: MapLibreGL.MapGeoJSONFeature) {
      const source = map.getSource(MARKET_SOURCE_ID) as GeoJSONSource | undefined;
      void source?.getClusterExpansionZoom(clusterId).then((zoom) => {
        if (feature.geometry.type !== "Point") return;
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

    function handleZoomStart() {
      // Legs are laid out in screen pixels, so zooming would slide them off
      // their anchor. Closing on zoom matches every other map.
      setSpiderKey(null);
    }

    function handleMoveEnd() {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => reportViewport(map), VIEWPORT_SETTLE_MS);
    }

    function handleLoad() {
      addMarketLayers(map, stacksRef.current);
      setLoaded(true);
    }

    map.on("load", handleLoad);
    map.on("click", handleMapClick);
    map.on("dragstart", handleUserInteraction);
    map.on("zoomstart", handleUserInteraction);
    map.on("zoomstart", handleZoomStart);
    map.on("moveend", handleMoveEnd);

    return () => {
      clearTimeout(settleTimer);
      map.off("load", handleLoad);
      map.off("click", handleMapClick);
      map.off("dragstart", handleUserInteraction);
      map.off("zoomstart", handleUserInteraction);
      map.off("zoomstart", handleZoomStart);
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
    source?.setData(createStackCollection(stacks));
  }, [loaded, stacks]);

  // A refreshed dataset that no longer contains the open stack closes it.
  useEffect(() => {
    if (spiderKey && !stacksByKey.has(spiderKey)) setSpiderKey(null);
  }, [spiderKey, stacksByKey]);

  // Spiderfy: fan the open stack's members out around their shared anchor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const source = map.getSource(SPIDER_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    const stack = spiderKey ? stacksByKey.get(spiderKey) : undefined;
    if (!stack) {
      source.setData(emptyCollection<SpiderFeature>());
      return;
    }

    const anchor = map.project([stack.lng, stack.lat]);
    const offsets = spiderfyOffsets(stack.members.length);
    const features: SpiderFeature[] = [];

    offsets.forEach((offset, index) => {
      const member = stack.members[index];
      if (!member) return;
      const point = map.unproject([anchor.x + offset.dx, anchor.y + offset.dy]);
      const coordinates: [number, number] = [point.lng, point.lat];
      features.push({
        type: "Feature",
        properties: { id: member.id, kind: member.kind, name: member.name },
        geometry: { type: "LineString", coordinates: [[stack.lng, stack.lat], coordinates] },
      });
      features.push({
        type: "Feature",
        properties: { id: member.id, kind: member.kind, name: member.name },
        geometry: { type: "Point", coordinates },
      });
    });

    source.setData({ type: "FeatureCollection", features });
  }, [loaded, spiderKey, stacksByKey]);

  // Selection: swap the overlay filter and the spider layer's icon expression.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.setFilter(SELECTED_LAYER_ID, selectedFilter(selectedLocationId));
    map.setLayoutProperty(SPIDER_POINT_LAYER_ID, "icon-image", [
      "case",
      ["==", ["get", "id"], selectedLocationId ?? ""],
      kindMatchExpression(true),
      kindMatchExpression(false),
    ]);
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
