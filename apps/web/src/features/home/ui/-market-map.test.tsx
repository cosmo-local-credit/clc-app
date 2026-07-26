import { act, render } from "@testing-library/react";
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
import { markerImageIds, resetMarketMarkerCache } from "./market-markers";

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

describe("MarketMap clustering ceiling", () => {
  it("locks the source and map zoom so coincident points stay a terminal badge", () => {
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
    const spec = map.getSource(MARKET_SOURCE_ID)?.spec;

    expect(spec?.cluster).toBe(true);
    expect(spec?.clusterMaxZoom).toBe(21);
    expect(spec?.clusterRadius).toBe(50);
    // MapLibre requires maxzoom > clusterMaxZoom, so the raw-point tree exists
    // at 22 but is unreachable.
    expect(spec?.maxzoom).toBe(22);
    expect(map.options.maxZoom).toBe(21);
  });

  it("clamps a fully coincident cluster's expansion to the reachable maximum", async () => {
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
    const source = map.getSource(MARKET_SOURCE_ID);
    if (source) source.expansionZoom = 22;

    await act(async () => {
      map.triggerLayer("click", "market-clusters", {
        features: [
          {
            properties: { cluster_id: 7 },
            geometry: { type: "Point", coordinates: [36.82, -1.28] },
          },
        ],
      });
      await Promise.resolve();
    });

    expect(map.easeTo).toHaveBeenCalledWith({ center: [36.82, -1.28], zoom: 21 });
  });

  it("still zooms to a normal cluster's own expansion zoom", async () => {
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
    const source = map.getSource(MARKET_SOURCE_ID);
    if (source) source.expansionZoom = 15;

    await act(async () => {
      map.triggerLayer("click", "market-clusters", {
        features: [
          {
            properties: { cluster_id: 3 },
            geometry: { type: "Point", coordinates: [36.9, -1.2] },
          },
        ],
      });
      await Promise.resolve();
    });

    expect(map.easeTo).toHaveBeenCalledWith({ center: [36.9, -1.2], zoom: 15 });
  });
});

describe("MarketMap selection", () => {
  it("registers exactly the six base and selected voucher marker images", () => {
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

    expect([...map.images].sort()).toEqual(
      [
        markerImageIds.base.goods,
        markerImageIds.base.services,
        markerImageIds.base.voucher,
        markerImageIds.selected.goods,
        markerImageIds.selected.services,
        markerImageIds.selected.voucher,
      ].sort(),
    );
    expect(map.images.size).toBe(6);
  });

  it("selects a voucher when its point is tapped", () => {
    const onSelect = vi.fn();
    render(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={onSelect}
      />,
    );
    const map = loadedMap();

    act(() => {
      map.triggerLayer("click", "market-points", {
        features: [
          { properties: { id: "2" }, geometry: { type: "Point", coordinates: [36.81, -1.3] } },
        ],
      });
    });

    expect(onSelect).toHaveBeenCalledWith("2");
  });

  it("renders selection through a filtered overlay layer, never setFeatureState", () => {
    const { rerender } = render(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );
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
      ["==", ["get", "id"], "3"],
    ]);
    // The overlay must sit above the base marker layer.
    const ids = map.layers.map((layer) => layer.id);
    expect(ids.indexOf("market-point-selected")).toBeGreaterThan(ids.indexOf("market-points"));
  });

  it("never moves the camera or requests a viewport when a point is selected", () => {
    const onViewportSettled = vi.fn();
    const { rerender } = render(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
        onViewportSettled={onViewportSettled}
      />,
    );
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
    render(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId="1"
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );
    loadedMap();

    expect(markerInstances).toHaveLength(0);
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

describe("MarketMap clustering invariants", () => {
  it("keeps Supercluster's raw-point tree beyond the reachable zoom", () => {
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
    const spec = map.getSource(MARKET_SOURCE_ID)?.spec;
    const clusterMaxZoom = spec?.clusterMaxZoom ?? Number.NaN;
    const sourceMaxZoom = spec?.maxzoom ?? Number.NaN;
    const reachableMaxZoom = map.options.maxZoom ?? Number.NaN;

    // Supercluster exposes unclustered points at clusterMaxZoom + 1. Holding
    // that strictly above the reachable ceiling is what makes an exactly
    // coincident stack a terminal badge at zoom 15 AND at zoom 21, instead of
    // a 200-symbol pile. Assert the relationship, not just the numbers.
    expect(clusterMaxZoom).toBeGreaterThanOrEqual(reachableMaxZoom);
    expect(clusterMaxZoom + 1).toBeGreaterThan(reachableMaxZoom);
    // MapLibre warns unless the source maximum exceeds the cluster maximum.
    expect(sourceMaxZoom).toBeGreaterThan(clusterMaxZoom);
    // Premises-level zoom must survive the ceiling.
    expect(reachableMaxZoom).toBeGreaterThanOrEqual(18);
  });
});
