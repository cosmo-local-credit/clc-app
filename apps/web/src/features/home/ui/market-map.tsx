import "maplibre-gl/dist/maplibre-gl.css";
import { Trans } from "@lingui/react/macro";
import MapLibreGL, {
  type DataDrivenPropertyValueSpecification,
  type FilterSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type MapMouseEvent,
} from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { MAP_MAX_ZOOM, MARKET_SOURCE_ID, type MarketLocation } from "./market-data";
import { keepMarketLabelsInsideViewport } from "./market-label-edges";
import { SELECTED_PIN_SUFFIX, addMarketMarkerImages, markerArt, markerPin } from "./market-markers";
import {
  type MarketStack,
  groupByProximity,
  spiderPageCount,
  spiderPageMembers,
  spiderfyOffsets,
} from "./market-stacks";

const NAIROBI = { lat: -1.2921, lng: 36.8219 };
const DEFAULT_ZOOM = 12;

const CLUSTER_MAX_ZOOM = 13;
const CLUSTER_RADIUS = 50;

const LABEL_LAYER_ID = "market-point-labels";
const SELECTED_LABEL_LAYER_ID = "market-point-selected-label";
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
  CLUSTERS_LAYER_ID,
  CLUSTER_COUNT_LAYER_ID,
  UNCLUSTERED_LAYER_ID,
  STACK_LAYER_ID,
  STACK_COUNT_LAYER_ID,
  SELECTED_LAYER_ID,
  SPIDER_POINT_LAYER_ID,
  LABEL_LAYER_ID,
  SELECTED_LABEL_LAYER_ID,
];

const VIEWPORT_SETTLE_MS = 400;
const BADGE_COLOR = "#1f2430";

/** Font stacks the basemap style already uses, so names need no extra glyphs. */
const LABEL_FONT = ["Inter Medium", "Noto Sans Medium"];
const SELECTED_LABEL_FONT = ["Inter Semi Bold", "Noto Sans Semi Bold"];
const LABEL_SIZE = 12;
const LABEL_GAP = 5;
const LABEL_PADDING = 1;

/**
 * Pins point at their location, so the image sits above the coordinate. The
 * offset cancels the transparent padding under the tip.
 */
const PIN_OFFSET: [number, number] = [0, markerPin.padding];

/**
 * The pin image already carries a transparent margin, so its collision box
 * gets no more. MapLibre's default of 2 px pushes the box past the gap to the
 * pin's own name, and every name is then dropped as colliding with its pin.
 */
const PIN_COLLISION_PADDING = 0;

/**
 * A fanned pin is drawn with its disc on the end of its leg, at the 24 px the
 * spiral spacing in `market-stacks` is laid out for.
 */
const FAN_PIN_SIZE = 24 / (markerPin.base.radius * 2);
const FAN_PIN_OFFSET: [number, number] = [0, markerPin.base.tail / 2];

/**
 * Inflates a badge count's collision box to roughly the badge around it, so a
 * name beside a nearby pin does not run underneath the badge.
 */
const BADGE_COLLISION_PADDING = 6;

/** The Material place pin, the silhouette Google Maps drops on a location. */
const USER_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="36" viewBox="4.25 1.25 15.5 21.5" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="currentColor" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><circle cx="12" cy="9" r="2.75" fill="#000000" fill-opacity="0.3"/></svg>`;

type UserLocation = { lat: number; lng: number };

type SymbolLayer = Extract<LayerSpecification, { type: "symbol" }>;

export type MarketCamera = {
  lat: number;
  lng: number;
  zoom: number;
  rank: number;
};

export const EXPLICIT_CAMERA_RANK = 0;

export type MarketViewport = {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
};

export type MarketFitBounds = {
  key: string;
  west: number;
  south: number;
  east: number;
  north: number;
};

const FILTER_FIT_MAX_ZOOM = 14;

const FILTER_FIT_PADDING = { top: 96, bottom: 160, left: 48, right: 48 };

/** How far above a sheet's edge a selected pin's tip must sit to count as visible. */
const REVEAL_MARGIN = 24;

type MarketMapProps = {
  locations: MarketLocation[];
  selectedLocationId: string | null;
  camera: MarketCamera | null;
  fitBounds?: MarketFitBounds | null;
  cameraScope?: string;
  userLocation: UserLocation | null;
  onSelectLocation: (id: string) => void;
  /** A tap on the map that lands on nothing. */
  onDeselect?: () => void;
  /** The viewer started dragging the map. */
  onUserPan?: () => void;
  /**
   * Pixels covered at the bottom by a sheet and the controls riding it. The
   * camera frames the area above, and names keep clear of it.
   */
  bottomInset?: number;
  onViewportSettled?: (viewport: MarketViewport) => void;
  className?: string;
};

type StackFeature = {
  type: "Feature";
  properties: {
    key: string;
    count: number;
    id: string;
    name: string;
  } & PinProperties;
  geometry: { type: "Point"; coordinates: [number, number] };
};

/** The pin's image id and the darker shade of it the name beside it takes. */
type PinProperties = { pin: string; label: string };

type SpiderFeature = {
  type: "Feature";
  properties: { id: string; name: string } & PinProperties;
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

function pinProperties(location: MarketLocation | undefined): PinProperties {
  const art = markerArt(location ?? { kind: "voucher", markerIcon: null, markerColor: null });
  return { pin: art.image, label: art.label };
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
          id: single ? single.id : "",
          name: single?.name ?? "",
          ...pinProperties(first),
        },
        geometry: { type: "Point", coordinates: [stack.lng, stack.lat] },
      };
    }),
  };
}

function createUserMarker(): HTMLDivElement {
  const marker = document.createElement("div");
  // `text-primary` follows `data-brand`: green on prod, red on staging, and the
  // dark-scheme variant of the same token. The white stroke keeps the pin
  // readable on the basemap, and its taller, glyph-free silhouette sets it
  // apart from the voucher pins. No pulse.
  marker.className = "text-primary drop-shadow-sm";
  marker.innerHTML = USER_PIN_SVG;
  return marker;
}

/** North-up and flat. Pan and zoom stay; bearing and pitch cannot change. */
function lockMapUpright(map: MapLibreGL.Map): void {
  map.dragRotate.disable();
  map.touchPitch.disable();
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.setMaxPitch(0);
  map.setPitch(0);
  map.setBearing(0);
}

/**
 * Each feature names its own pin, so the expression stays the same size
 * however many icons and colours the palette grows to.
 */
function pinImage(selected: boolean): DataDrivenPropertyValueSpecification<string> {
  return selected ? ["concat", ["get", "pin"], SELECTED_PIN_SUFFIX] : ["get", "pin"];
}

/**
 * A location's name, Google Maps style: beside the pin's body in a darker shade
 * of the pin, on the right where it fits and the left where it does not.
 */
function labelLayout(
  shape: { radius: number; tail: number },
  font: string[],
): NonNullable<SymbolLayer["layout"]> {
  // Offsets are in ems of the label size, measured from the pin's tip.
  const x = (shape.radius + LABEL_GAP) / LABEL_SIZE;
  const y = -(shape.radius + shape.tail) / LABEL_SIZE;
  return {
    "text-field": ["get", "name"],
    "text-font": font,
    "text-size": LABEL_SIZE,
    "text-max-width": 8,
    "text-line-height": 1.15,
    "text-justify": "auto",
    "text-variable-anchor-offset": ["left", [x, y], "right", [-x, y]],
    "text-padding": LABEL_PADDING,
  };
}

const LABEL_PAINT: NonNullable<SymbolLayer["paint"]> = {
  "text-color": ["get", "label"],
  "text-halo-color": "#ffffff",
  "text-halo-width": 1.5,
  "text-halo-blur": 0.5,
};

/** The selected location uses its own text layer, below every pin and badge. */
function labelFilter(selectedId: string | null): FilterSpecification {
  return [
    "all",
    ["!", ["has", "point_count"]],
    ["==", ["get", "count"], 1],
    ["!=", ["get", "id"], selectedId ?? ""],
  ];
}

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

function countLabel(property: string): DataDrivenPropertyValueSpecification<string> {
  return [
    "step",
    ["get", property],
    ["to-string", ["get", property]],
    1000,
    ["concat", ["to-string", ["round", ["/", ["get", property], 1000]]], "k"],
  ];
}

function badgeRadius(property: string): DataDrivenPropertyValueSpecification<number> {
  return ["step", ["get", property], 14, 10, 16, 100, 18, 1000, 20];
}

function addMarketLayers(map: MapLibreGL.Map, locations: MarketLocation[], stacks: MarketStack[]) {
  addMarketMarkerImages(map, locations);

  map.addSource(MARKET_SOURCE_ID, {
    type: "geojson",
    data: createStackCollection(stacks),
    cluster: true,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    clusterRadius: CLUSTER_RADIUS,
    clusterProperties: { markerCount: ["+", ["get", "count"]] },
  });
  map.addSource(SPIDER_SOURCE_ID, { type: "geojson", data: emptyCollection<SpiderFeature>() });

  // Lowest of the market layers. MapLibre places symbols from the top layer
  // down, so every pin and badge count above has claimed its space by the time
  // names are placed: a name gives way to a pin and never runs under one.
  map.addLayer({
    id: LABEL_LAYER_ID,
    type: "symbol",
    source: MARKET_SOURCE_ID,
    filter: labelFilter(null),
    layout: labelLayout(markerPin.base, LABEL_FONT),
    paint: LABEL_PAINT,
  });
  map.addLayer({
    id: SELECTED_LABEL_LAYER_ID,
    type: "symbol",
    source: MARKET_SOURCE_ID,
    filter: selectedFilter(null),
    layout: labelLayout(markerPin.selected, SELECTED_LABEL_FONT),
    paint: LABEL_PAINT,
  });

  map.addLayer({
    id: CLUSTERS_LAYER_ID,
    type: "circle",
    source: MARKET_SOURCE_ID,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": BADGE_COLOR,
      "circle-radius": badgeRadius("markerCount"),
      "circle-stroke-width": 0,
    },
  });
  map.addLayer({
    id: CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    source: MARKET_SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": countLabel("markerCount"),
      "text-size": 11,
      "text-allow-overlap": true,
      "text-padding": BADGE_COLLISION_PADDING,
    },
    paint: { "text-color": "#ffffff" },
  });

  map.addLayer({
    id: UNCLUSTERED_LAYER_ID,
    type: "symbol",
    source: MARKET_SOURCE_ID,
    filter: singleFilter,
    layout: {
      "icon-image": pinImage(false),
      "icon-size": 1,
      "icon-anchor": "bottom",
      "icon-offset": PIN_OFFSET,
      "icon-padding": PIN_COLLISION_PADDING,
      "icon-allow-overlap": true,
    },
  });

  map.addLayer({
    id: STACK_LAYER_ID,
    type: "circle",
    source: MARKET_SOURCE_ID,
    filter: stackFilter,
    paint: {
      "circle-color": BADGE_COLOR,
      "circle-radius": badgeRadius("count"),
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
  map.addLayer({
    id: STACK_COUNT_LAYER_ID,
    type: "symbol",
    source: MARKET_SOURCE_ID,
    filter: stackFilter,
    layout: {
      "text-field": countLabel("count"),
      "text-size": 11,
      "text-allow-overlap": true,
      "text-padding": BADGE_COLLISION_PADDING,
    },
    paint: { "text-color": "#ffffff" },
  });

  map.addLayer({
    id: SELECTED_LAYER_ID,
    type: "symbol",
    source: MARKET_SOURCE_ID,
    filter: selectedFilter(null),
    layout: {
      "icon-image": pinImage(true),
      "icon-size": 1,
      "icon-anchor": "bottom",
      "icon-offset": PIN_OFFSET,
      "icon-padding": PIN_COLLISION_PADDING,
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
      "icon-image": pinImage(false),
      "icon-size": FAN_PIN_SIZE,
      "icon-offset": FAN_PIN_OFFSET,
      "icon-padding": PIN_COLLISION_PADDING,
      "icon-allow-overlap": true,
    },
  });
}

export function MarketMap({
  locations,
  selectedLocationId,
  camera,
  fitBounds,
  cameraScope,
  userLocation,
  onSelectLocation,
  onDeselect,
  onUserPan,
  bottomInset = 0,
  onViewportSettled,
  className,
}: MarketMapProps) {
  const containerRef = useRef<HTMLElement>(null);
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const userMarkerRef = useRef<MapLibreGL.Marker | null>(null);
  const appliedCameraRef = useRef<MarketCamera | null>(null);
  const appliedFitKeyRef = useRef<string | null>(null);
  const appliedInsetRef = useRef(0);
  const userHasInteractedRef = useRef(false);
  const loadedRef = useRef(false);
  const [failure, setFailure] = useState<"unsupported" | "error" | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [spider, setSpider] = useState<{ key: string; page: number } | null>(null);

  const maptilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
  const maptilerStyle = maptilerKey
    ? `https://api.maptiler.com/maps/base-v4/style.json?key=${encodeURIComponent(maptilerKey)}`
    : null;

  const stacks = useMemo(() => groupByProximity(locations), [locations]);
  const stacksByKey = useMemo(() => new Map(stacks.map((stack) => [stack.key, stack])), [stacks]);

  const stacksRef = useRef(stacks);
  stacksRef.current = stacks;
  const locationsRef = useRef(locations);
  locationsRef.current = locations;
  const bottomInsetRef = useRef(bottomInset);
  bottomInsetRef.current = bottomInset;
  const onSelectRef = useRef(onSelectLocation);
  onSelectRef.current = onSelectLocation;
  const onDeselectRef = useRef(onDeselect);
  onDeselectRef.current = onDeselect;
  const onUserPanRef = useRef(onUserPan);
  onUserPanRef.current = onUserPan;
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
    if (!maptilerStyle || failure || !containerRef.current || mapRef.current) return;
    if (!hasWebGlSupport()) {
      setFailure("unsupported");
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
        bearing: 0,
        pitch: 0,
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 0,
        attributionControl: false,
      });
      lockMapUpright(map);
    } catch {
      setFailure("error");
      return;
    }

    mapRef.current = map;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let removeLabelEdgeListeners: (() => void) | undefined;

    function handleMapClick(event: MapMouseEvent) {
      const [feature] = map.queryRenderedFeatures(event.point, {
        layers: INTERACTIVE_LAYER_IDS,
      });

      if (!feature) {
        setSpider(null);
        onDeselectRef.current?.();
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
      const count = Number(feature.properties?.count);
      if (typeof key === "string" && count > 1) {
        const pageCount = spiderPageCount(count);
        setSpider((current) => {
          if (current?.key !== key) return { key, page: 0 };
          const next = current.page + 1;
          return next >= pageCount ? null : { key, page: next };
        });
        return;
      }

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
      if (event?.originalEvent) userHasInteractedRef.current = true;
    }

    function handleDragStart(event: { originalEvent?: unknown }) {
      handleUserInteraction(event);
      if (event?.originalEvent) onUserPanRef.current?.();
    }

    function handleZoomStart() {
      setSpider(null);
    }

    function handleMoveEnd() {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => reportViewport(map), VIEWPORT_SETTLE_MS);
    }

    function handleLoad() {
      addMarketLayers(map, locationsRef.current, stacksRef.current);
      removeLabelEdgeListeners = keepMarketLabelsInsideViewport(map, () => bottomInsetRef.current);
      loadedRef.current = true;
      setLoaded(true);
    }

    function handleError() {
      if (loadedRef.current) return;
      setFailure("error");
    }

    map.on("load", handleLoad);
    map.on("error", handleError);
    map.on("click", handleMapClick);
    map.on("dragstart", handleDragStart);
    map.on("zoomstart", handleUserInteraction);
    map.on("zoomstart", handleZoomStart);
    map.on("moveend", handleMoveEnd);

    return () => {
      clearTimeout(settleTimer);
      removeLabelEdgeListeners?.();
      map.off("load", handleLoad);
      map.off("error", handleError);
      map.off("click", handleMapClick);
      map.off("dragstart", handleDragStart);
      map.off("zoomstart", handleUserInteraction);
      map.off("zoomstart", handleZoomStart);
      map.off("moveend", handleMoveEnd);
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      appliedCameraRef.current = null;
      appliedFitKeyRef.current = null;
      appliedInsetRef.current = 0;
      userHasInteractedRef.current = false;
      loadedRef.current = false;
      setLoaded(false);
    };
  }, [failure, maptilerStyle, reportViewport]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const source = map.getSource(MARKET_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    // Every member, not only lone pins: a fanned stack draws its members' pins.
    addMarketMarkerImages(map, locationsRef.current);
    source.setData(createStackCollection(stacks));
  }, [loaded, stacks]);

  useEffect(() => {
    if (spider && !stacksByKey.has(spider.key)) setSpider(null);
  }, [spider, stacksByKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const source = map.getSource(SPIDER_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    const stack = spider ? stacksByKey.get(spider.key) : undefined;
    if (!stack) {
      source.setData(emptyCollection<SpiderFeature>());
      return;
    }

    const page = spiderPageMembers(stack.members, spider?.page ?? 0);
    const anchor = map.project([stack.lng, stack.lat]);
    const offsets = spiderfyOffsets(page.length);
    const features: SpiderFeature[] = [];

    offsets.forEach((offset, index) => {
      const member = page[index];
      if (!member) return;
      const point = map.unproject([anchor.x + offset.dx, anchor.y + offset.dy]);
      const coordinates: [number, number] = [point.lng, point.lat];
      const properties = { id: member.id, name: member.name, ...pinProperties(member) };
      features.push({
        type: "Feature",
        properties,
        geometry: { type: "LineString", coordinates: [[stack.lng, stack.lat], coordinates] },
      });
      features.push({
        type: "Feature",
        properties,
        geometry: { type: "Point", coordinates },
      });
    });

    source.setData({ type: "FeatureCollection", features });
  }, [loaded, spider, stacksByKey]);

  const spiderKey = spider?.key ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !spiderKey) return;
    const stack = stacksByKey.get(spiderKey);
    if (!stack) return;
    map.easeTo({ center: [stack.lng, stack.lat] });
  }, [loaded, spiderKey, stacksByKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.setFilter(SELECTED_LAYER_ID, selectedFilter(selectedLocationId));
    map.setFilter(SELECTED_LABEL_LAYER_ID, selectedFilter(selectedLocationId));
    map.setFilter(LABEL_LAYER_ID, labelFilter(selectedLocationId));
    map.setLayoutProperty(SPIDER_POINT_LAYER_ID, "icon-image", [
      "case",
      ["==", ["get", "id"], selectedLocationId ?? ""],
      pinImage(true),
      pinImage(false),
    ]);
  }, [loaded, selectedLocationId]);

  // Pads the camera by the sheet without moving the view: whatever sits at the
  // centre of the area left above the sheet becomes the camera's centre. Every
  // later move then frames that area.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || appliedInsetRef.current === bottomInset) return;
    appliedInsetRef.current = bottomInset;
    const { clientWidth, clientHeight } = map.getCanvas();
    const center = map.unproject([clientWidth / 2, (clientHeight - bottomInset) / 2]);
    map.easeTo({
      center: [center.lng, center.lat],
      padding: { top: 0, right: 0, bottom: bottomInset, left: 0 },
      duration: 0,
    });
  }, [bottomInset, loaded]);

  // A selected pin the sheet would cover is panned into the area above it, on
  // selection and whenever the sheet grows. A pin already in view stays put.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !selectedLocationId) return;
    const location = locationsRef.current.find((candidate) => candidate.id === selectedLocationId);
    if (!location) return;
    const tip = map.project([location.lng, location.lat]);
    if (tip.y <= map.getCanvas().clientHeight - bottomInset - REVEAL_MARGIN) return;
    map.easeTo({ center: [location.lng, location.lat] });
  }, [bottomInset, loaded, selectedLocationId]);

  useEffect(() => {
    appliedCameraRef.current = null;
  }, [cameraScope]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !camera) return;
    if (appliedCameraRef.current === camera) return;

    const applied = appliedCameraRef.current;
    if (camera.rank !== EXPLICIT_CAMERA_RANK) {
      if (userHasInteractedRef.current) return;
      if (applied && camera.rank >= applied.rank) return;

      if (fitBounds) {
        appliedCameraRef.current = camera;
        return;
      }
    }

    appliedCameraRef.current = camera;
    map.easeTo({ center: [camera.lng, camera.lat], zoom: camera.zoom });
  }, [camera, fitBounds, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    if (!fitBounds) {
      appliedFitKeyRef.current = null;
      return;
    }

    if (appliedFitKeyRef.current === fitBounds.key) return;

    appliedFitKeyRef.current = fitBounds.key;
    map.fitBounds(
      [
        [fitBounds.west, fitBounds.south],
        [fitBounds.east, fitBounds.north],
      ],
      {
        maxZoom: FILTER_FIT_MAX_ZOOM,
        // Added to the camera's own padding, which already clears the sheet.
        padding: {
          ...FILTER_FIT_PADDING,
          bottom: Math.max(0, FILTER_FIT_PADDING.bottom - bottomInsetRef.current),
        },
      },
    );
  }, [fitBounds, loaded]);

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
    userMarkerRef.current = new MapLibreGL.Marker({ element: createUserMarker(), anchor: "bottom" })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map);
  }, [loaded, userLocation]);

  if (!maptilerStyle || failure) {
    return (
      <section
        aria-label="Market map"
        className={cn(
          "market-map-fallback relative flex items-center justify-center overflow-hidden bg-card px-6",
          className,
        )}
      >
        <div className="flex max-w-[18rem] flex-col items-center gap-3 text-center">
          <p className="text-muted-foreground text-sm">
            {failure === "error" ? (
              <Trans>The map could not be loaded.</Trans>
            ) : (
              <Trans>The map is not supported on this device.</Trans>
            )}
          </p>
          {failure === "error" ? (
            <Button variant="outline" tap onClick={() => setFailure(null)}>
              <Trans>Retry</Trans>
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section ref={containerRef} aria-label="Market map" className={cn("bg-card", className)} />
  );
}
