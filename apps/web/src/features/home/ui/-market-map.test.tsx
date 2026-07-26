import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mapInstances, markerInstances, MockMap, MockMarker } = vi.hoisted(() => {
  type MapHandler = (event?: {
    features?: Array<{
      properties?: Record<string, unknown>;
      geometry: { type: "Point"; coordinates: [number, number] };
    }>;
    originalEvent?: unknown;
  }) => void;

  type MockMapOptions = {
    container: HTMLElement;
    style: string;
    center: [number, number];
    zoom: number;
    maxZoom?: number;
    fadeDuration?: number;
    attributionControl: boolean;
  };

  type MockSourceSpec = {
    type: string;
    data: unknown;
    cluster?: boolean;
    clusterMaxZoom?: number;
    clusterRadius?: number;
    maxzoom?: number;
  };

  class HoistedMockSource {
    spec: MockSourceSpec;
    setData = vi.fn((data: unknown) => {
      this.spec.data = data;
    });
    getClusterExpansionZoom = vi.fn(async () => this.expansionZoom);
    expansionZoom = 22;

    constructor(spec: MockSourceSpec) {
      this.spec = spec;
    }
  }

  class HoistedMockMap {
    options: MockMapOptions;
    // Several handlers may share one event (e.g. dragstart + zoomstart latch).
    handlers = new Map<string, MapHandler[]>();
    layerHandlers = new Map<string, MapHandler[]>();
    sources = new Map<string, HoistedMockSource>();
    layers: Array<{ id: string; type: string; filter?: unknown; layout?: unknown }> = [];
    images = new Set<string>();
    flyTo = vi.fn();
    easeTo = vi.fn();
    jumpTo = vi.fn();
    setFilter = vi.fn((layerId: string, filter: unknown) => {
      const layer = this.layers.find((entry) => entry.id === layerId);
      if (layer) layer.filter = filter;
    });
    setFeatureState = vi.fn();
    setLayoutProperty = vi.fn();
    queryRenderedFeatures = vi.fn(() => [] as unknown[]);
    project = vi.fn((lngLat: [number, number]) => ({ x: lngLat[0] * 100, y: lngLat[1] * 100 }));
    unproject = vi.fn((point: [number, number]) => ({ lng: point[0] / 100, lat: point[1] / 100 }));
    addImage = vi.fn((id: string) => {
      this.images.add(id);
    });
    hasImage = vi.fn((id: string) => this.images.has(id));
    remove = vi.fn();
    zoom = 12;
    maxZoom = 21;
    bounds = { west: 36.6, south: -1.5, east: 37.1, north: -1.1 };

    constructor(options: MockMapOptions) {
      this.options = options;
      this.maxZoom = options.maxZoom ?? 21;
      mapInstances.push(this);
    }

    on(event: string, layerOrHandler: string | MapHandler, maybeHandler?: MapHandler) {
      if (typeof layerOrHandler === "string" && maybeHandler) {
        const key = `${event}:${layerOrHandler}`;
        this.layerHandlers.set(key, [...(this.layerHandlers.get(key) ?? []), maybeHandler]);
        return;
      }
      const handler = layerOrHandler as MapHandler;
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    }

    off(event: string, layerOrHandler: string | MapHandler, maybeHandler?: MapHandler) {
      if (typeof layerOrHandler === "string" && maybeHandler) {
        const key = `${event}:${layerOrHandler}`;
        this.layerHandlers.set(
          key,
          (this.layerHandlers.get(key) ?? []).filter((entry) => entry !== maybeHandler),
        );
        return;
      }
      this.handlers.set(
        event,
        (this.handlers.get(event) ?? []).filter((entry) => entry !== layerOrHandler),
      );
    }

    addSource(id: string, spec: MockSourceSpec) {
      this.sources.set(id, new HoistedMockSource(spec));
    }

    getSource(id: string) {
      return this.sources.get(id);
    }

    addLayer(layer: { id: string; type: string; filter?: unknown; layout?: unknown }) {
      this.layers.push(layer);
    }

    getLayer(id: string) {
      return this.layers.find((layer) => layer.id === id);
    }

    getZoom() {
      return this.zoom;
    }

    getMaxZoom() {
      return this.maxZoom;
    }

    getBounds() {
      const self = this;
      return {
        adjustAntiMeridian() {
          return this;
        },
        getWest: () => self.bounds.west,
        getSouth: () => self.bounds.south,
        getEast: () => self.bounds.east,
        getNorth: () => self.bounds.north,
      };
    }

    triggerLoad() {
      for (const handler of this.handlers.get("load") ?? []) handler();
    }

    trigger(event: string, payload?: Parameters<MapHandler>[0]) {
      for (const handler of this.handlers.get(event) ?? []) handler(payload);
    }

    triggerLayer(event: string, layerId: string, payload?: Parameters<MapHandler>[0]) {
      for (const handler of this.layerHandlers.get(`${event}:${layerId}`) ?? []) handler(payload);
    }
  }

  class HoistedMockMarker {
    coordinates: [number, number] | null = null;
    remove = vi.fn();

    constructor(_: { element?: HTMLElement }) {
      markerInstances.push(this);
    }

    setLngLat(coordinates: [number, number]) {
      this.coordinates = coordinates;
      return this;
    }

    addTo() {
      return this;
    }
  }

  const mapInstances: HoistedMockMap[] = [];
  const markerInstances: HoistedMockMarker[] = [];

  return {
    mapInstances,
    markerInstances,
    MockMap: HoistedMockMap,
    MockMarker: HoistedMockMarker,
  };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: MockMap,
    Marker: MockMarker,
  },
}));

import { installCanvasStub, installPath2DStub } from "./-market-canvas-stub";
import { type MarketLocation, MARKET_SOURCE_ID } from "./market-data";
import { EXPLICIT_CAMERA_RANK, MarketMap } from "./market-map";
import { resetMarketMarkerCache } from "./market-markers";
import { SPIDER_PAGE_SIZE } from "./market-stacks";

const LOCATIONS: MarketLocation[] = [
  { id: "1", name: "Alpha", kind: "goods", lat: -1.28, lng: 36.82, locationName: "Nairobi" },
  { id: "2", name: "Beta", kind: "services", lat: -1.3, lng: 36.81, locationName: null },
  { id: "3", name: "Gamma", kind: "voucher", lat: -1.27, lng: 36.83, locationName: null },
];

function firstMap() {
  const map = mapInstances[0];
  if (!map) throw new Error("expected a map instance");
  return map;
}

function loadedMap() {
  const map = firstMap();
  act(() => {
    map.triggerLoad();
  });
  return map;
}

beforeEach(() => {
  vi.stubEnv("VITE_MAPTILER_KEY", "test key");
  mapInstances.length = 0;
  markerInstances.length = 0;
  resetMarketMarkerCache();
  installCanvasStub();
  installPath2DStub();
  vi.stubGlobal("CSS", { supports: () => true });
});

/** Simulates a real MapLibre click: one global handler + queryRenderedFeatures. */
function clickFeature(
  map: ReturnType<typeof loadedMap>,
  layerId: string,
  properties: Record<string, unknown>,
  geometry: { type: string; coordinates: unknown } = {
    type: "Point",
    coordinates: [36.82, -1.28],
  },
) {
  map.queryRenderedFeatures.mockReturnValue([{ layer: { id: layerId }, properties, geometry }]);
  act(() => {
    map.trigger("click", { point: { x: 100, y: 100 } } as never);
  });
}

function clickEmptyMap(map: ReturnType<typeof loadedMap>) {
  map.queryRenderedFeatures.mockReturnValue([]);
  act(() => {
    map.trigger("click", { point: { x: 5, y: 5 } } as never);
  });
}

describe("MarketMap lifecycle", () => {
  it("constructs the map once and updates the source when data is appended", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <MarketMap
        locations={LOCATIONS.slice(0, 1)}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={onSelect}
      />,
    );
    const map = loadedMap();

    const source = map.getSource(MARKET_SOURCE_ID);
    expect(source).toBeDefined();

    // A second backend page arrives.
    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={onSelect}
      />,
    );

    expect(mapInstances).toHaveLength(1);
    expect(map.remove).not.toHaveBeenCalled();
    expect(source?.setData).toHaveBeenCalled();

    const data = source?.spec.data as { features: unknown[] };
    expect(data.features).toHaveLength(3);
  });

  it("does not recreate the map when selection, geolocation, or callback identity change", () => {
    const { rerender } = render(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );
    loadedMap();

    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId="2"
        camera={{ lat: 0, lng: 0, zoom: 12, rank: 4 }}
        userLocation={{ lat: -1.29, lng: 36.82 }}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(mapInstances).toHaveLength(1);
    expect(firstMap().remove).not.toHaveBeenCalled();
  });

  it("builds features as [lng, lat] carrying id, name, and kind", () => {
    render(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );
    const map = loadedMap();

    const data = map.getSource(MARKET_SOURCE_ID)?.spec.data as {
      features: Array<{
        properties: { id: string; name: string; kind: string };
        geometry: { coordinates: [number, number] };
      }>;
    };

    expect(data.features[0]?.geometry.coordinates).toEqual([36.82, -1.28]);
    expect(data.features[0]?.properties).toMatchObject({ id: "1", name: "Alpha", kind: "goods" });
    expect(data.features.map((feature) => feature.properties.kind)).toEqual([
      "goods",
      "services",
      "voucher",
    ]);
  });

  it("removes the map on unmount", () => {
    const { unmount } = render(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );
    const map = loadedMap();

    unmount();

    expect(map.remove).toHaveBeenCalledTimes(1);
  });
});

function renderWithCamera(camera: React.ComponentProps<typeof MarketMap>["camera"], extra = {}) {
  return render(
    <MarketMap
      locations={LOCATIONS}
      selectedLocationId={null}
      camera={camera}
      userLocation={null}
      onSelectLocation={vi.fn()}
      {...extra}
    />,
  );
}

describe("MarketMap ranked camera", () => {
  it("applies a candidate once the map has loaded", () => {
    renderWithCamera({ lat: -1.29, lng: 36.82, zoom: 14, rank: 1 });
    const map = loadedMap();

    expect(map.easeTo).toHaveBeenCalledWith({ center: [36.82, -1.29], zoom: 14 });
  });

  it("lets a better rank supersede a worse one", () => {
    const { rerender } = renderWithCamera({ lat: 0, lng: 0, zoom: 12, rank: 4 });
    const map = loadedMap();
    expect(map.easeTo).toHaveBeenCalledTimes(1);

    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={{ lat: -1.29, lng: 36.82, zoom: 14, rank: 1 }}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.easeTo).toHaveBeenLastCalledWith({ center: [36.82, -1.29], zoom: 14 });
  });

  it("ignores a worse rank arriving after a better one", () => {
    const { rerender } = renderWithCamera({ lat: -1.29, lng: 36.82, zoom: 14, rank: 2 });
    const map = loadedMap();
    expect(map.easeTo).toHaveBeenCalledTimes(1);

    // A late MapTiler IP response must not drag the camera off a real fix.
    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={{ lat: 10, lng: 20, zoom: 11, rank: 3 }}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.easeTo).toHaveBeenCalledTimes(1);
  });

  it("stops every automatic candidate once the user drags", () => {
    const { rerender } = renderWithCamera(null);
    const map = loadedMap();

    act(() => {
      map.trigger("dragstart", { originalEvent: new MouseEvent("mousedown") });
    });
    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={{ lat: -1.29, lng: 36.82, zoom: 14, rank: 1 }}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it("stops every automatic candidate once the user zooms", () => {
    const { rerender } = renderWithCamera(null);
    const map = loadedMap();

    act(() => {
      map.trigger("zoomstart", { originalEvent: new WheelEvent("wheel") });
    });
    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={{ lat: -1.29, lng: 36.82, zoom: 14, rank: 1 }}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it("does not latch on a programmatic camera move", () => {
    const { rerender } = renderWithCamera(null);
    const map = loadedMap();

    // A programmatic easeTo emits the same events with no originalEvent.
    act(() => {
      map.trigger("dragstart", {});
      map.trigger("zoomstart", {});
    });
    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={{ lat: -1.29, lng: 36.82, zoom: 14, rank: 1 }}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.easeTo).toHaveBeenCalledWith({ center: [36.82, -1.29], zoom: 14 });
  });

  it("honours the explicit location button even after the user has panned", () => {
    const { rerender } = renderWithCamera(null);
    const map = loadedMap();

    act(() => {
      map.trigger("dragstart", { originalEvent: new MouseEvent("mousedown") });
    });
    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={{ lat: -1.29, lng: 36.82, zoom: 14, rank: EXPLICIT_CAMERA_RANK }}
        userLocation={{ lat: -1.29, lng: 36.82 }}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.easeTo).toHaveBeenCalledWith({ center: [36.82, -1.29], zoom: 14 });
  });

  it("creates exactly one user marker and moves it on later fixes", () => {
    const { rerender } = render(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={{ lat: -1.29, lng: 36.82 }}
        onSelectLocation={vi.fn()}
      />,
    );
    loadedMap();
    expect(markerInstances).toHaveLength(1);
    expect(markerInstances[0]?.coordinates).toEqual([36.82, -1.29]);

    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={{ lat: -1.3, lng: 36.83 }}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(markerInstances).toHaveLength(1);
    expect(markerInstances[0]?.coordinates).toEqual([36.83, -1.3]);
  });
});

describe("MarketMap viewport reporting", () => {
  it("reports settled bounds once after a debounce", () => {
    vi.useFakeTimers();
    const onViewportSettled = vi.fn();
    try {
      renderWithCamera(null, { onViewportSettled });
      const map = loadedMap();

      act(() => {
        map.trigger("moveend", {});
        map.trigger("moveend", {});
        map.trigger("moveend", {});
      });
      expect(onViewportSettled).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(onViewportSettled).toHaveBeenCalledTimes(1);
      expect(onViewportSettled).toHaveBeenCalledWith({
        west: 36.6,
        south: -1.5,
        east: 37.1,
        north: -1.1,
        zoom: 12,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not report a viewport after unmount", () => {
    vi.useFakeTimers();
    const onViewportSettled = vi.fn();
    try {
      const { unmount } = renderWithCamera(null, { onViewportSettled });
      const map = loadedMap();

      act(() => {
        map.trigger("moveend", {});
      });
      unmount();
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(onViewportSettled).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

const KILIFI_STACK: MarketLocation[] = [
  {
    id: "s1",
    name: "Farm Star",
    kind: "goods",
    lat: -3.632178,
    lng: 39.854538,
    locationName: null,
  },
  { id: "s2", name: "Beta", kind: "services", lat: -3.632178, lng: 39.854538, locationName: null },
  { id: "s3", name: "Gamma", kind: "voucher", lat: -3.632178, lng: 39.854538, locationName: null },
];

function renderMap(locations: MarketLocation[], extra = {}) {
  return render(
    <MarketMap
      locations={locations}
      selectedLocationId={null}
      camera={null}
      userLocation={null}
      onSelectLocation={vi.fn()}
      {...extra}
    />,
  );
}

describe("MarketMap clustering scope", () => {
  it("clusters by distance only below zoom 14", () => {
    renderMap(LOCATIONS);
    const map = loadedMap();
    const spec = map.getSource(MARKET_SOURCE_ID)?.spec;

    // Above clusterMaxZoom Supercluster returns raw points, so every distinct
    // coordinate is its own marker from zoom 14 — roughly a 5 km view.
    expect(spec?.cluster).toBe(true);
    expect(spec?.clusterMaxZoom).toBe(13);
    expect((spec?.clusterMaxZoom ?? 0) + 1).toBe(14);
    // Premises-level zoom must remain reachable.
    expect(map.options.maxZoom).toBeGreaterThanOrEqual(18);
  });

  it("emits one feature per distinct coordinate, not per voucher", () => {
    renderMap([...LOCATIONS, ...KILIFI_STACK]);
    const map = loadedMap();
    const data = map.getSource(MARKET_SOURCE_ID)?.spec.data as {
      features: Array<{ properties: { count: number; key: string; id: string } }>;
    };

    // 3 distinct + 1 shared coordinate carrying 3 members.
    expect(data.features).toHaveLength(4);
    expect(data.features.filter((feature) => feature.properties.count === 1)).toHaveLength(3);
    const stack = data.features.find((feature) => feature.properties.count === 3);
    expect(stack).toBeDefined();
    // A stack carries no voucher id: it must be opened before anything is selected.
    expect(stack?.properties.id).toBe("");
  });

  it("separates the stack layer from the distance-cluster layer", () => {
    renderMap(KILIFI_STACK);
    const map = loadedMap();
    const ids = map.layers.map((layer) => layer.id);

    expect(ids).toContain("market-stacks");
    expect(ids).toContain("market-stack-count");
    expect(ids).toContain("market-clusters");
    // Single vouchers and stacks never render through the same filter.
    expect(map.getLayer("market-points")?.filter).toEqual([
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "count"], 1],
    ]);
    expect(map.getLayer("market-stacks")?.filter).toEqual([
      "all",
      ["!", ["has", "point_count"]],
      [">", ["get", "count"], 1],
    ]);
  });
});

describe("MarketMap spiderfy", () => {
  function spiderData(map: ReturnType<typeof loadedMap>) {
    return map.getSource("market-spider")?.spec.data as {
      features: Array<{
        properties: { id: string };
        geometry: { type: string; coordinates: unknown };
      }>;
    };
  }

  function openStack(map: ReturnType<typeof loadedMap>, count = 3) {
    clickFeature(
      map,
      "market-stacks",
      { key: "-3.632178,39.854538", count },
      { type: "Point", coordinates: [39.854538, -3.632178] },
    );
  }

  it("starts closed", () => {
    renderMap(KILIFI_STACK);
    const map = loadedMap();

    expect(spiderData(map).features).toEqual([]);
  });

  it("fans every member out with a leader line when the stack is tapped", () => {
    renderMap(KILIFI_STACK);
    const map = loadedMap();

    openStack(map);

    const features = spiderData(map).features;
    const points = features.filter((feature) => feature.geometry.type === "Point");
    const legs = features.filter((feature) => feature.geometry.type === "LineString");

    expect(points).toHaveLength(3);
    expect(legs).toHaveLength(3);
    expect(points.map((point) => point.properties.id).sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("places every fanned pin somewhere different from the shared anchor", () => {
    renderMap(KILIFI_STACK);
    const map = loadedMap();

    openStack(map);

    const points = spiderData(map)
      .features.filter((feature) => feature.geometry.type === "Point")
      .map((feature) => JSON.stringify(feature.geometry.coordinates));
    expect(new Set(points).size).toBe(3);
    expect(points).not.toContain(JSON.stringify([39.854538, -3.632178]));
  });

  it("selects the tapped member of an open stack", () => {
    const onSelect = vi.fn();
    renderMap(KILIFI_STACK, { onSelectLocation: onSelect });
    const map = loadedMap();
    openStack(map);

    clickFeature(
      map,
      "market-spider-points",
      { id: "s2" },
      {
        type: "Point",
        coordinates: [39.85, -3.63],
      },
    );

    expect(onSelect).toHaveBeenCalledWith("s2");
  });

  it("does not select anything when the stack badge itself is tapped", () => {
    const onSelect = vi.fn();
    renderMap(KILIFI_STACK, { onSelectLocation: onSelect });
    const map = loadedMap();

    openStack(map);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("closes when the same stack is tapped again", () => {
    renderMap(KILIFI_STACK);
    const map = loadedMap();

    openStack(map);
    expect(spiderData(map).features.length).toBeGreaterThan(0);
    openStack(map);

    expect(spiderData(map).features).toEqual([]);
  });

  it("closes on zoom, because legs are laid out in screen pixels", () => {
    renderMap(KILIFI_STACK);
    const map = loadedMap();
    openStack(map);

    act(() => {
      map.trigger("zoomstart", { originalEvent: new WheelEvent("wheel") });
    });

    expect(spiderData(map).features).toEqual([]);
  });

  it("closes when the map background is tapped", () => {
    renderMap(KILIFI_STACK);
    const map = loadedMap();
    openStack(map);

    clickEmptyMap(map);

    expect(spiderData(map).features).toEqual([]);
  });

  it("stays open when the tap lands on another marker", () => {
    renderMap(KILIFI_STACK);
    const map = loadedMap();
    openStack(map);

    map.queryRenderedFeatures.mockReturnValue([
      { layer: { id: "market-points" }, properties: { id: "1", count: 1 }, geometry: {} },
    ]);
    act(() => {
      map.trigger("click", { point: { x: 10, y: 10 } } as never);
    });

    expect(spiderData(map).features.length).toBeGreaterThan(0);
  });

  it("fans one page at a time for a very large stack", () => {
    const huge = Array.from({ length: 200 }, (_, index) => ({
      id: `h${index}`,
      name: `Voucher ${index}`,
      kind: "voucher" as const,
      lat: -3.632178,
      lng: 39.854538,
      locationName: null,
    }));
    renderMap(huge);
    const map = loadedMap();
    openStack(map, 200);

    const points = spiderData(map).features.filter((feature) => feature.geometry.type === "Point");
    expect(points).toHaveLength(SPIDER_PAGE_SIZE);

    // The badge still reports the true total, not the capped one.
    const data = map.getSource(MARKET_SOURCE_ID)?.spec.data as {
      features: Array<{ properties: { count: number } }>;
    };
    expect(data.features[0]?.properties.count).toBe(200);
  });

  it("closes when a refreshed dataset drops the open stack", () => {
    const { rerender } = renderMap(KILIFI_STACK);
    const map = loadedMap();
    openStack(map);
    expect(spiderData(map).features.length).toBeGreaterThan(0);

    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(spiderData(map).features).toEqual([]);
  });
});

describe("MarketMap selection", () => {
  it("selects a lone voucher when its point is tapped", () => {
    const onSelect = vi.fn();
    renderMap(LOCATIONS, { onSelectLocation: onSelect });
    const map = loadedMap();

    clickFeature(
      map,
      "market-points",
      { id: "2", count: 1 },
      {
        type: "Point",
        coordinates: [36.81, -1.3],
      },
    );

    expect(onSelect).toHaveBeenCalledWith("2");
  });

  it("renders selection through a filtered overlay, never setFeatureState", () => {
    const { rerender } = renderMap(LOCATIONS);
    const map = loadedMap();

    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId="3"
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.setFeatureState).not.toHaveBeenCalled();
    expect(map.setFilter).toHaveBeenCalledWith("market-point-selected", [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "count"], 1],
      ["==", ["get", "id"], "3"],
    ]);
    const ids = map.layers.map((layer) => layer.id);
    expect(ids.indexOf("market-point-selected")).toBeGreaterThan(ids.indexOf("market-points"));
  });

  it("highlights a selected member inside an open fan", () => {
    const { rerender } = renderMap(KILIFI_STACK);
    const map = loadedMap();

    rerender(
      <MarketMap
        locations={KILIFI_STACK}
        selectedLocationId="s2"
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      "market-spider-points",
      "icon-image",
      expect.anything(),
    );
  });

  it("never moves the camera or requests a viewport when a point is selected", () => {
    const onViewportSettled = vi.fn();
    const { rerender } = renderMap(LOCATIONS, { onViewportSettled });
    const map = loadedMap();

    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId="1"
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
        onViewportSettled={onViewportSettled}
      />,
    );

    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(map.jumpTo).not.toHaveBeenCalled();
    expect(onViewportSettled).not.toHaveBeenCalled();
  });

  it("does not create a DOM marker per voucher", () => {
    renderMap(LOCATIONS, { selectedLocationId: "1" });
    loadedMap();

    expect(markerInstances).toHaveLength(0);
  });
});

describe("MarketMap click wiring", () => {
  it("registers exactly one click listener", () => {
    renderMap(KILIFI_STACK);
    const map = loadedMap();

    // Regression guard: with a layer-scoped opener AND a global background
    // closer, MapLibre fires both for one click and the close wins, so a
    // stack could never be opened on a real map.
    expect(map.handlers.get("click") ?? []).toHaveLength(1);
    expect([...map.layerHandlers.keys()].filter((key) => key.startsWith("click:"))).toEqual([]);
  });

  it("opens the fan on a single real click without immediately closing it", () => {
    renderMap(KILIFI_STACK);
    const map = loadedMap();

    map.queryRenderedFeatures.mockReturnValue([
      {
        layer: { id: "market-stacks" },
        properties: { key: "-3.632178,39.854538", count: 3 },
        geometry: { type: "Point", coordinates: [39.854538, -3.632178] },
      },
    ]);
    act(() => {
      map.trigger("click", { point: { x: 100, y: 100 } } as never);
    });

    const data = map.getSource("market-spider")?.spec.data as { features: unknown[] };
    expect(data.features.length).toBeGreaterThan(0);
  });

  it("acts on the topmost feature under the tap", () => {
    const onSelect = vi.fn();
    renderMap(KILIFI_STACK, { onSelectLocation: onSelect });
    const map = loadedMap();

    // queryRenderedFeatures sorts topmost first. The fan's pins are the last
    // layers added, so an open fan's pin outranks the badge beneath it.
    map.queryRenderedFeatures.mockReturnValue([
      {
        layer: { id: "market-spider-points" },
        properties: { id: "s3" },
        geometry: { type: "Point", coordinates: [39.8546, -3.6321] },
      },
      {
        layer: { id: "market-stacks" },
        properties: { key: "-3.632178,39.854538", count: 3 },
        geometry: { type: "Point", coordinates: [39.854538, -3.632178] },
      },
    ]);
    act(() => {
      map.trigger("click", { point: { x: 100, y: 100 } } as never);
    });

    expect(onSelect).toHaveBeenCalledWith("s3");
  });

  it("adds the fan layers above the badge layers", () => {
    renderMap(KILIFI_STACK);
    const ids = loadedMap().layers.map((layer) => layer.id);

    // The z-order the tap logic relies on must actually hold.
    expect(ids.indexOf("market-spider-points")).toBeGreaterThan(ids.indexOf("market-stacks"));
    expect(ids.indexOf("market-spider-points")).toBeGreaterThan(ids.indexOf("market-points"));
  });
});

describe("MarketMap fan paging", () => {
  function bigStack(size: number): MarketLocation[] {
    return Array.from({ length: size }, (_, index) => ({
      id: `b${index}`,
      name: `Voucher ${index}`,
      kind: "voucher" as const,
      lat: -1.283253,
      lng: 36.817245,
      locationName: null,
    }));
  }

  function tapBadge(map: ReturnType<typeof loadedMap>, count: number) {
    clickFeature(
      map,
      "market-stacks",
      { key: "-1.283253,36.817245", count },
      { type: "Point", coordinates: [36.817245, -1.283253] },
    );
  }

  function fanIds(map: ReturnType<typeof loadedMap>) {
    const data = map.getSource("market-spider")?.spec.data as {
      features: Array<{ properties: { id: string }; geometry: { type: string } }>;
    };
    return data.features
      .filter((feature) => feature.geometry.type === "Point")
      .map((feature) => feature.properties.id);
  }

  it("fans the whole 63-voucher CBD stack in one go", () => {
    renderMap(bigStack(63));
    const map = loadedMap();

    tapBadge(map, 63);

    expect(fanIds(map)).toHaveLength(63);
  });

  it("walks every member of an oversized stack across taps", () => {
    const size = SPIDER_PAGE_SIZE + 12;
    renderMap(bigStack(size));
    const map = loadedMap();

    tapBadge(map, size);
    const first = fanIds(map);
    expect(first).toHaveLength(SPIDER_PAGE_SIZE);

    tapBadge(map, size);
    const second = fanIds(map);
    expect(second).toHaveLength(12);

    // Together the pages cover the stack exactly once.
    expect(new Set([...first, ...second]).size).toBe(size);
  });

  it("closes after the last page", () => {
    const size = SPIDER_PAGE_SIZE + 12;
    renderMap(bigStack(size));
    const map = loadedMap();

    tapBadge(map, size);
    tapBadge(map, size);
    tapBadge(map, size);

    expect(fanIds(map)).toEqual([]);
  });

  it("still toggles shut on a second tap when the stack fits one page", () => {
    renderMap(bigStack(5));
    clickFeature(
      loadedMap(),
      "market-stacks",
      { key: "-1.283253,36.817245", count: 5 },
      { type: "Point", coordinates: [36.817245, -1.283253] },
    );
    const map = firstMap();
    expect(fanIds(map)).toHaveLength(5);

    tapBadge(map, 5);
    expect(fanIds(map)).toEqual([]);
  });

  it("pages a 200-stack without ever dropping a member", () => {
    renderMap(bigStack(200));
    const map = loadedMap();

    const seen = new Set<string>();
    for (let page = 0; page < Math.ceil(200 / SPIDER_PAGE_SIZE); page++) {
      tapBadge(map, 200);
      for (const id of fanIds(map)) seen.add(id);
    }

    expect(seen.size).toBe(200);
  });

  it("centres the stack when the fan opens so legs cannot fall off-screen", () => {
    renderMap(bigStack(63));
    const map = loadedMap();

    tapBadge(map, 63);

    // Pan only: a zoom would change the pixel scale the legs were laid out in.
    expect(map.easeTo).toHaveBeenCalledWith({ center: [36.817245, -1.283253] });
    const call = map.easeTo.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("zoom");
  });
});

describe("MarketMap badge counts", () => {
  const CBD_STACK: MarketLocation[] = Array.from({ length: 63 }, (_, index) => ({
    id: `c${index}`,
    name: `Voucher ${index}`,
    kind: "voucher" as const,
    lat: -1.283253,
    lng: 36.817245,
    locationName: null,
  }));

  it("makes a distance cluster count vouchers, not locations", () => {
    renderMap([...CBD_STACK, ...LOCATIONS]);
    const map = loadedMap();
    const spec = map.getSource(MARKET_SOURCE_ID)?.spec as {
      clusterProperties?: Record<string, unknown>;
    };

    // Without this, a cluster over the 63-stack plus two singles reads "3"
    // (features) and then jumps to "63" once zoomed past clusterMaxZoom. A
    // count that grows as you zoom in is simply wrong.
    expect(spec.clusterProperties).toBeDefined();
    expect(spec.clusterProperties?.voucherCount).toEqual(["+", ["get", "count"]]);
  });

  it("labels clusters from the summed voucher count", () => {
    renderMap(CBD_STACK);
    const map = loadedMap();
    const layer = map.getLayer("market-cluster-count") as {
      layout?: { "text-field"?: unknown };
    };

    expect(JSON.stringify(layer.layout?.["text-field"])).toContain("voucherCount");
    // point_count would be the location count, which is the bug.
    expect(JSON.stringify(layer.layout?.["text-field"])).not.toContain("point_count");
  });

  it("labels a coincident stack from its own voucher count", () => {
    renderMap(CBD_STACK);
    const map = loadedMap();
    const layer = map.getLayer("market-stack-count") as {
      layout?: { "text-field"?: unknown };
    };

    expect(JSON.stringify(layer.layout?.["text-field"])).toContain('"count"');
  });

  it("abbreviates counts that cannot fit inside the badge", () => {
    renderMap(CBD_STACK);
    const map = loadedMap();
    const field = JSON.stringify(
      (map.getLayer("market-cluster-count") as { layout?: { "text-field"?: unknown } }).layout?.[
        "text-field"
      ],
    );

    // A world-zoom cluster reaches 2,181; four digits do not fit a 28 px circle.
    expect(field).toContain("step");
    expect(field).toContain("k");
  });
});

describe("MarketMap symbol stability", () => {
  it("disables collision fade so zooming does not flicker markers", () => {
    renderMap(LOCATIONS);
    const map = loadedMap();

    // fadeDuration animates every collision-driven appear/disappear. During a
    // cluster expansion the symbol set churns repeatedly, and each change
    // cross-fades — which reads as the map flickering several times.
    expect(map.options.fadeDuration).toBe(0);
  });

  it("draws every badge together with its own count", () => {
    renderMap(KILIFI_STACK);
    const map = loadedMap();

    for (const id of ["market-cluster-count", "market-stack-count"]) {
      const layout = (map.getLayer(id) as { layout?: Record<string, unknown> }).layout ?? {};
      // A number that collides away leaves a bare disc with no count on it.
      expect(layout["text-allow-overlap"]).toBe(true);
      expect(layout["text-ignore-placement"]).toBe(true);
    }
  });

  it("keeps marker icons out of collision placement entirely", () => {
    renderMap(LOCATIONS);
    const map = loadedMap();

    for (const id of ["market-points", "market-point-selected", "market-spider-points"]) {
      const layout = (map.getLayer(id) as { layout?: Record<string, unknown> }).layout ?? {};
      expect(layout["icon-allow-overlap"]).toBe(true);
      expect(layout["icon-ignore-placement"]).toBe(true);
    }
  });
});

describe("MarketMap style failure", () => {
  it("shows the unavailable surface when the style fails to load", () => {
    renderMap(LOCATIONS);
    const map = firstMap();

    // A style fetch failure is asynchronous: the constructor succeeds, then
    // MapLibre emits `error` and `load` never fires. Without handling it the
    // user is left staring at an empty container forever.
    act(() => {
      map.trigger("error", { error: { message: "NetworkError" } } as never);
    });

    expect(screen.getByText(/map is unavailable/i)).toBeTruthy();
  });

  it("offers a retry that rebuilds the map", () => {
    renderMap(LOCATIONS);
    const first = firstMap();
    act(() => {
      first.trigger("error", { error: { message: "NetworkError" } } as never);
    });
    expect(first.remove).toHaveBeenCalled();

    act(() => {
      screen.getByRole("button", { name: /retry/i }).click();
    });

    expect(mapInstances).toHaveLength(2);
  });

  it("ignores transient tile errors once the map is up", () => {
    renderMap(LOCATIONS);
    const map = loadedMap();

    // A single failed tile must not blank a working map.
    act(() => {
      map.trigger("error", { error: { status: 404, message: "tile missing" } } as never);
    });

    expect(screen.queryByText(/map is unavailable/i)).toBeNull();
    expect(map.remove).not.toHaveBeenCalled();
  });
});
