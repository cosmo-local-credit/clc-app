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
    bearing?: number;
    pitch?: number;
    maxPitch?: number;
    dragRotate?: boolean;
    pitchWithRotate?: boolean;
    touchPitch?: boolean;
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
    handlers = new Map<string, MapHandler[]>();
    layerHandlers = new Map<string, MapHandler[]>();
    sources = new Map<string, HoistedMockSource>();
    layers: Array<{ id: string; type: string; filter?: unknown; layout?: unknown }> = [];
    images = new Set<string>();
    flyTo = vi.fn();
    easeTo = vi.fn();
    fitBounds = vi.fn();
    jumpTo = vi.fn();
    setStyle = vi.fn((style: string) => {
      this.options.style = style;
      this.sources.clear();
      this.layers = [];
      this.images.clear();
    });
    setMaxPitch = vi.fn();
    setPitch = vi.fn();
    setBearing = vi.fn();
    dragRotate = { disable: vi.fn() };
    touchPitch = { disable: vi.fn() };
    touchZoomRotate = { disableRotation: vi.fn() };
    keyboard = { disableRotation: vi.fn() };
    setFilter = vi.fn((layerId: string, filter: unknown) => {
      const layer = this.layers.find((entry) => entry.id === layerId);
      if (layer) layer.filter = filter;
    });
    setFeatureState = vi.fn();
    setLayoutProperty = vi.fn();
    queryRenderedFeatures = vi.fn(() => [] as unknown[]);
    project = vi.fn((lngLat: [number, number]) => ({ x: lngLat[0] * 100, y: lngLat[1] * 100 }));
    unproject = vi.fn((point: [number, number]) => ({
      lng: point[0] / 100,
      lat: point[1] / 100,
    }));
    addImage = vi.fn((id: string) => {
      this.images.add(id);
    });
    hasImage = vi.fn((id: string) => this.images.has(id));
    remove = vi.fn();
    removeImage = vi.fn((id: string) => this.images.delete(id));
    getCanvas = vi.fn(() => ({ clientWidth: 360, clientHeight: 640 }));
    zoom = 12;
    maxZoom = 21;
    bounds = { west: 36.6, south: -1.5, east: 37.1, north: -1.1 };
    controls: Array<{ control: unknown; position?: string }> = [];

    constructor(options: MockMapOptions) {
      this.options = options;
      this.maxZoom = options.maxZoom ?? 21;
      mapInstances.push(this);
    }

    addControl(control: unknown, position?: string) {
      this.controls.push({ control, position });
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

    getBounds = () => {
      const { west, south, east, north } = this.bounds;
      const view = {
        adjustAntiMeridian: () => view,
        getWest: () => west,
        getSouth: () => south,
        getEast: () => east,
        getNorth: () => north,
      };
      return view;
    };

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
    element: HTMLElement | undefined;
    anchor: string | undefined;
    remove = vi.fn();

    constructor(options: { element?: HTMLElement; anchor?: string }) {
      this.element = options.element;
      this.anchor = options.anchor;
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
    AttributionControl: class MockAttributionControl {},
  },
}));

import { installCanvasStub, installPath2DStub } from "./-market-canvas-stub";
import { type MarketLocation, MARKET_SOURCE_ID } from "./market-data";
import { EXPLICIT_CAMERA_RANK } from "#/features/home/logic/market-camera";
import { useThemeStore } from "#/providers/theme";
import { type MarketCamera, MarketMap } from "./market-map";
import {
  MARKET_NETWORK_BADGE_COLOR,
  MARKET_NETWORK_BADGE_IMAGE_ID,
  POOL_PIN_HEX,
  POOL_PIN_IMAGE_ID,
  markerPin,
  resetMarketMarkerCache,
} from "./market-markers";
import { SPIDER_PAGE_SIZE } from "./market-stacks";

const LOCATIONS: MarketLocation[] = [
  {
    id: "1",
    name: "Alpha",
    kind: "goods",
    markerIcon: null,
    markerColor: null,
    lat: -1.28,
    lng: 36.82,
    locationName: "Nairobi",
  },
  {
    id: "2",
    name: "Beta",
    kind: "services",
    markerIcon: null,
    markerColor: null,
    lat: -1.3,
    lng: 36.81,
    locationName: null,
  },
  {
    id: "3",
    name: "Gamma",
    kind: "voucher",
    markerIcon: null,
    markerColor: null,
    lat: -1.27,
    lng: 36.83,
    locationName: null,
  },
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
  window.localStorage.clear();
  useThemeStore.setState({ theme: "light" });
  mapInstances.length = 0;
  markerInstances.length = 0;
  resetMarketMarkerCache();
  installCanvasStub();
  installPath2DStub();
  vi.stubGlobal("CSS", { supports: () => true });
});

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
  it("switches Standard themes in place and restores theme-aware overlays", () => {
    render(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId="1"
        camera={null}
        userLocation={{ lat: -1.29, lng: 36.82 }}
        onSelectLocation={vi.fn()}
      />,
    );
    const map = loadedMap();
    const originalMarker = markerInstances[0];

    expect(map.options.style).toBe("https://tiles.openfreemap.org/styles/positron");
    expect(map.hasImage(MARKET_NETWORK_BADGE_IMAGE_ID.light)).toBe(true);

    act(() => useThemeStore.getState().setTheme("dark"));

    expect(map.setStyle).toHaveBeenCalledWith("https://tiles.openfreemap.org/styles/fiord");
    expect(mapInstances).toHaveLength(1);
    expect(map.getSource(MARKET_SOURCE_ID)).toBeUndefined();

    act(() => map.trigger("style.load"));

    expect(map.getSource(MARKET_SOURCE_ID)).toBeDefined();
    expect(map.getSource("market-label-edges")).toBeDefined();
    expect(map.getLayer("market-point-selected")).toBeDefined();
    expect(map.getLayer("market-clusters")).toBeDefined();
    expect(map.hasImage(MARKET_NETWORK_BADGE_IMAGE_ID.dark)).toBe(true);
    expect(markerInstances).toEqual([originalMarker]);
    expect(map.remove).not.toHaveBeenCalled();
  });

  it("switches styles in place and restores every app-owned overlay", () => {
    const { rerender } = render(
      <MarketMap
        mode="standard"
        locations={KILIFI_STACK}
        selectedLocationId="s2"
        camera={null}
        userLocation={{ lat: -1.29, lng: 36.82 }}
        onSelectLocation={vi.fn()}
      />,
    );
    const map = loadedMap();
    const originalMarker = markerInstances[0];
    const spiderFeatures = () => {
      const source = map.getSource("market-spider");
      if (!source) throw new Error("expected spider source");
      return (source.spec.data as { features: unknown[] }).features;
    };

    expect(map.options.style).toBe("https://tiles.openfreemap.org/styles/positron");
    clickFeature(
      map,
      "market-stacks",
      { key: "-3.632178,39.854538", count: 3 },
      { type: "Point", coordinates: [39.854538, -3.632178] },
    );
    const cameraMoves = map.easeTo.mock.calls.length;
    expect(spiderFeatures()).toHaveLength(6);

    rerender(
      <MarketMap
        mode="satellite"
        locations={KILIFI_STACK}
        selectedLocationId="s2"
        camera={null}
        userLocation={{ lat: -1.29, lng: 36.82 }}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.setStyle).toHaveBeenCalledWith(
      "https://api.maptiler.com/maps/hybrid-v4/style.json?key=test%20key",
    );
    expect(mapInstances).toHaveLength(1);
    expect(map.getSource(MARKET_SOURCE_ID)).toBeUndefined();

    act(() => map.trigger("style.load"));

    expect(map.getSource(MARKET_SOURCE_ID)).toBeDefined();
    expect(map.getSource("market-spider")).toBeDefined();
    expect(map.getSource("market-label-edges")).toBeDefined();
    expect(map.getLayer("market-point-selected")).toBeDefined();
    expect(map.getLayer("market-clusters")).toBeDefined();
    expect(markerInstances).toEqual([originalMarker]);
    expect(spiderFeatures()).toHaveLength(6);
    expect(map.easeTo).toHaveBeenCalledTimes(cameraMoves);

    act(() => useThemeStore.getState().setTheme("dark"));
    expect(map.setStyle).toHaveBeenLastCalledWith(
      "https://api.maptiler.com/maps/hybrid-v4-dark/style.json?key=test%20key",
    );
  });

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

  it("builds features as [lng, lat] carrying id, name, and the pin to draw", () => {
    render(
      <MarketMap
        locations={[
          ...LOCATIONS,
          {
            id: "4",
            name: "Delta",
            kind: "goods",
            markerIcon: "farm",
            markerColor: "cyan",
            lat: -1.26,
            lng: 36.84,
            locationName: null,
          },
        ]}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );
    const map = loadedMap();

    const data = map.getSource(MARKET_SOURCE_ID)?.spec.data as {
      features: Array<{
        properties: { id: string; name: string; pin: string; label: string };
        geometry: { coordinates: [number, number] };
      }>;
    };

    expect(data.features[0]?.geometry.coordinates).toEqual([36.82, -1.28]);
    expect(data.features[0]?.properties).toMatchObject({
      id: "1",
      name: "Alpha",
      pin: "market-pin-basket-blue",
      label: "#1d4ed8",
    });
    expect(data.features.map((feature) => feature.properties.pin)).toEqual([
      "market-pin-basket-blue",
      "market-pin-hand-coin-purple",
      "market-pin-coupon-orange",
      "market-pin-farm-cyan",
    ]);
    // Registered before the source that references them, so no pin is skipped.
    expect(map.hasImage("market-pin-farm-cyan")).toBe(true);
    expect(map.hasImage("market-pin-farm-cyan-selected")).toBe(true);
  });

  it("gives a pool its own pin, named in the pool's blue", () => {
    render(
      <MarketMap
        locations={[
          ...LOCATIONS,
          {
            id: "pool:0x49d3e72becc7870cd9d1981d5f4ec8e1cb5394e2",
            name: "Mina G Pool",
            kind: "pool",
            markerIcon: null,
            markerColor: null,
            lat: -3.6457,
            lng: 39.85,
            locationName: "Mnarani, Kilifi, Kenya",
          },
        ]}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );
    const map = loadedMap();

    const data = map.getSource(MARKET_SOURCE_ID)?.spec.data as {
      features: Array<{ properties: { id: string; pin: string; label: string } }>;
    };
    const pool = data.features.find((feature) => feature.properties.id.startsWith("pool:"));

    expect(pool?.properties).toMatchObject({ pin: POOL_PIN_IMAGE_ID, label: POOL_PIN_HEX.label });
    expect(map.hasImage(POOL_PIN_IMAGE_ID)).toBe(true);
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
  it.each<MarketCamera>([
    { lat: 43.8563, lng: 18.4131, zoom: 14, rank: 4 },
    { lat: 48.2082, lng: 16.3738, zoom: 14, rank: 3 },
    { lat: 43.9, lng: 18.5, zoom: 16, rank: 2, restore: { fitKey: null } },
  ])("starts at the known camera before tiles load (rank $rank)", (camera) => {
    const { unmount } = renderWithCamera(camera);
    const first = firstMap();
    expect(first.options).toMatchObject({
      center: [camera.lng, camera.lat],
      zoom: camera.zoom,
    });

    loadedMap();
    unmount();
    renderWithCamera(camera);

    // Returning from Wallet creates a new map, which must also start here.
    expect(mapInstances).toHaveLength(2);
    expect(mapInstances[1]?.options).toMatchObject({
      center: [camera.lng, camera.lat],
      zoom: camera.zoom,
    });
  });

  it("keeps the fallback camera when no location or saved view is known", () => {
    renderWithCamera(null);
    expect(firstMap().options).toMatchObject({ center: [36.8219, -1.2921], zoom: 12 });
  });

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

  it("stays north-up and flat", () => {
    render(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );
    const map = firstMap();

    expect(map.options).toMatchObject({
      bearing: 0,
      pitch: 0,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    expect(map.dragRotate.disable).toHaveBeenCalledOnce();
    expect(map.touchPitch.disable).toHaveBeenCalledOnce();
    expect(map.touchZoomRotate.disableRotation).toHaveBeenCalledOnce();
    expect(map.keyboard.disableRotation).toHaveBeenCalledOnce();
    expect(map.setMaxPitch).toHaveBeenCalledWith(0);
    expect(map.setPitch).toHaveBeenCalledWith(0);
    expect(map.setBearing).toHaveBeenCalledWith(0);
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

  it("paints the live location in the brand colour without a pulse", () => {
    render(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={{ lat: -1.29, lng: 36.82 }}
        onSelectLocation={vi.fn()}
      />,
    );
    loadedMap();

    const element = markerInstances[0]?.element;
    expect(element?.className).toContain("text-primary");
    expect(element?.querySelector("path")?.getAttribute("fill")).toBe("currentColor");
    expect(element?.className).not.toContain("animate-ping");
    expect(element?.querySelector(".animate-ping")).toBeNull();
  });

  it("drops the live location as a pin whose tip marks the fix", () => {
    render(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={{ lat: -1.29, lng: 36.82 }}
        onSelectLocation={vi.fn()}
      />,
    );
    loadedMap();

    expect(markerInstances[0]?.anchor).toBe("bottom");
    expect(markerInstances[0]?.element?.querySelector("svg")).not.toBeNull();
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
    markerIcon: null,
    markerColor: null,
    lat: -3.632178,
    lng: 39.854538,
    locationName: null,
  },
  {
    id: "s2",
    name: "Beta",
    kind: "services",
    markerIcon: null,
    markerColor: null,
    lat: -3.632178,
    lng: 39.854538,
    locationName: null,
  },
  {
    id: "s3",
    name: "Gamma",
    kind: "voucher",
    markerIcon: null,
    markerColor: null,
    lat: -3.632178,
    lng: 39.854538,
    locationName: null,
  },
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

    expect(spec?.cluster).toBe(true);
    expect(spec?.clusterMaxZoom).toBe(13);
    expect((spec?.clusterMaxZoom ?? 0) + 1).toBe(14);
    expect(map.options.maxZoom).toBeGreaterThanOrEqual(18);
  });

  it("emits one feature per distinct coordinate, not per voucher", () => {
    renderMap([...LOCATIONS, ...KILIFI_STACK]);
    const map = loadedMap();
    const data = map.getSource(MARKET_SOURCE_ID)?.spec.data as {
      features: Array<{ properties: { count: number; key: string; id: string } }>;
    };

    expect(data.features).toHaveLength(4);
    expect(data.features.filter((feature) => feature.properties.count === 1)).toHaveLength(3);
    const stack = data.features.find((feature) => feature.properties.count === 3);
    expect(stack).toBeDefined();
    expect(stack?.properties.id).toBe("");
  });

  it("separates the stack layer from the distance-cluster layer", () => {
    renderMap(KILIFI_STACK);
    const map = loadedMap();
    const ids = map.layers.map((layer) => layer.id);

    expect(ids).toContain("market-stacks");
    expect(ids).toContain("market-stack-count");
    expect(ids).toContain("market-clusters");
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
      markerIcon: null,
      markerColor: null,
      lat: -3.632178,
      lng: 39.854538,
      locationName: null,
    }));
    renderMap(huge);
    const map = loadedMap();
    openStack(map, 200);

    const points = spiderData(map).features.filter((feature) => feature.geometry.type === "Point");
    expect(points).toHaveLength(SPIDER_PAGE_SIZE);

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

    expect(map.setLayoutProperty).toHaveBeenCalledWith("market-spider-points", "icon-image", [
      "case",
      ["==", ["get", "id"], "s2"],
      ["concat", ["get", "pin"], "-selected"],
      ["get", "pin"],
    ]);
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

    expect(map.handlers.get("click") ?? []).toHaveLength(1);
    expect([...map.layerHandlers.keys()].filter((key) => key.startsWith("click:"))).toEqual([]);
  });

  it("reports a tap on empty map as a deselection, and a tap on a pin as a selection", () => {
    const onSelect = vi.fn();
    const onDeselect = vi.fn();
    renderMap(LOCATIONS, { onSelectLocation: onSelect, onDeselect });
    const map = loadedMap();

    clickEmptyMap(map);
    expect(onDeselect).toHaveBeenCalledTimes(1);

    clickFeature(map, "market-points", { id: "2", count: 1 });
    expect(onSelect).toHaveBeenCalledWith("2");
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it("does not deselect when a cluster is tapped", () => {
    const onDeselect = vi.fn();
    renderMap(LOCATIONS, { onDeselect });
    const map = loadedMap();

    clickFeature(map, "market-clusters", { cluster_id: 7, point_count: 3 });

    expect(onDeselect).not.toHaveBeenCalled();
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
      markerIcon: null,
      markerColor: null,
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
    markerIcon: null,
    markerColor: null,
    lat: -1.283253,
    lng: 36.817245,
    locationName: null,
  }));

  it("makes a distance cluster count markers, not locations", () => {
    renderMap([...CBD_STACK, ...LOCATIONS]);
    const map = loadedMap();
    const spec = map.getSource(MARKET_SOURCE_ID)?.spec as {
      clusterProperties?: Record<string, unknown>;
    };

    expect(spec.clusterProperties).toBeDefined();
    expect(spec.clusterProperties?.markerCount).toEqual(["+", ["get", "count"]]);
  });

  it("draws clusters and coincident stacks as theme-aware network badges", () => {
    renderMap(CBD_STACK);
    const map = loadedMap();

    for (const id of ["market-clusters", "market-stacks"]) {
      const layer = map.getLayer(id) as {
        type?: string;
        layout?: Record<string, unknown>;
      };
      expect(layer.type).toBe("symbol");
      expect(layer.layout?.["icon-image"]).toBe(MARKET_NETWORK_BADGE_IMAGE_ID.light);
      expect(layer.layout?.["icon-allow-overlap"]).toBe(true);
    }
    for (const id of ["market-cluster-count", "market-stack-count"]) {
      const layer = map.getLayer(id) as { paint?: Record<string, unknown> };
      expect(layer.paint?.["text-color"]).toBe(MARKET_NETWORK_BADGE_COLOR.light.ink);
    }
  });

  it("labels clusters from the summed marker count", () => {
    renderMap(CBD_STACK);
    const map = loadedMap();
    const layer = map.getLayer("market-cluster-count") as {
      layout?: { "text-field"?: unknown };
    };

    expect(JSON.stringify(layer.layout?.["text-field"])).toContain("markerCount");
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

    expect(field).toContain("step");
    expect(field).toContain("k");
  });
});

describe("MarketMap symbol stability", () => {
  it("disables collision fade so zooming does not flicker markers", () => {
    renderMap(LOCATIONS);
    const map = loadedMap();

    expect(map.options.fadeDuration).toBe(0);
  });

  it("draws every badge together with its own count, and keeps names off it", () => {
    renderMap(KILIFI_STACK);
    const map = loadedMap();

    for (const id of ["market-cluster-count", "market-stack-count"]) {
      const layout = (map.getLayer(id) as { layout?: Record<string, unknown> }).layout ?? {};
      expect(layout["text-allow-overlap"]).toBe(true);
      expect(layout["text-ignore-placement"]).not.toBe(true);
      expect(layout["text-padding"]).toBeGreaterThan(0);
    }
  });

  it("always draws marker icons, and keeps names off them", () => {
    renderMap(LOCATIONS);
    const map = loadedMap();

    for (const id of ["market-points", "market-point-selected", "market-spider-points"]) {
      const layout = (map.getLayer(id) as { layout?: Record<string, unknown> }).layout ?? {};
      expect(layout["icon-allow-overlap"]).toBe(true);
      expect(layout["icon-ignore-placement"]).not.toBe(true);
      // The default 2 px would overlap each pin's own name and hide all of them.
      expect(layout["icon-padding"]).toBe(0);
    }
  });
});

describe("MarketMap pins and names", () => {
  function layoutOf(map: ReturnType<typeof loadedMap>, id: string) {
    return (map.getLayer(id) as { layout?: Record<string, unknown> }).layout ?? {};
  }

  it("points each pin at its location with its tip", () => {
    renderMap(LOCATIONS);
    const map = loadedMap();

    for (const id of ["market-points", "market-point-selected"]) {
      expect(layoutOf(map, id)["icon-anchor"]).toBe("bottom");
      expect(layoutOf(map, id)["icon-offset"]).toEqual([0, markerPin.padding]);
    }
  });

  it("names every lone pin after its voucher, coloured by its pin", () => {
    renderMap([...LOCATIONS, ...KILIFI_STACK]);
    const map = loadedMap();
    const layer = map.getLayer("market-point-labels") as {
      type: string;
      filter?: unknown;
      layout?: Record<string, unknown>;
      paint?: Record<string, unknown>;
    };

    expect(layer.type).toBe("symbol");
    expect(layer.layout?.["text-field"]).toEqual(["get", "name"]);
    expect(layer.filter).toEqual([
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "count"], 1],
      ["!=", ["get", "id"], ""],
    ]);
    expect(layer.paint?.["text-color"]).toEqual(["get", "label"]);
    expect(layer.paint?.["text-halo-color"]).toBe("#ffffff");
  });

  it("sets each name beside the pin, on whichever side fits", () => {
    renderMap(LOCATIONS);
    const map = loadedMap();
    const offsets = layoutOf(map, "market-point-labels")["text-variable-anchor-offset"] as [
      string,
      [number, number],
      string,
      [number, number],
    ];

    expect(offsets[0]).toBe("left");
    expect(offsets[2]).toBe("right");
    // Level with the disc, which sits above the tip the feature is anchored on.
    expect(offsets[1][0]).toBeGreaterThan(0);
    expect(offsets[1][1]).toBeLessThan(0);
    expect(offsets[3]).toEqual([-offsets[1][0], offsets[1][1]]);
  });

  it("places names below every marker layer, so pins claim their space first", () => {
    renderMap(LOCATIONS);
    const ids = loadedMap().layers.map((layer) => layer.id);
    const labels = Math.max(
      ids.indexOf("market-point-labels"),
      ids.indexOf("market-point-selected-label"),
    );

    expect(ids.indexOf("market-point-labels")).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf("market-point-selected-label")).toBeGreaterThanOrEqual(0);
    for (const id of [
      "market-clusters",
      "market-cluster-count",
      "market-points",
      "market-stacks",
      "market-stack-count",
      "market-point-selected",
      "market-spider-points",
    ]) {
      expect(ids.indexOf(id)).toBeGreaterThan(labels);
    }
  });

  it("moves the selected voucher's name onto its enlarged pin", () => {
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

    expect(map.setFilter).toHaveBeenCalledWith("market-point-labels", [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "count"], 1],
      ["!=", ["get", "id"], "3"],
    ]);
    expect(map.setFilter).toHaveBeenCalledWith("market-point-selected-label", [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "count"], 1],
      ["==", ["get", "id"], "3"],
    ]);
    expect(layoutOf(map, "market-point-selected-label")["text-field"]).toEqual(["get", "name"]);
    // Text placement cannot hide or cover a marker in its separate layer.
    expect(layoutOf(map, "market-point-selected")["text-field"]).toBeUndefined();
  });

  it("selects a voucher when its name is tapped", () => {
    const onSelect = vi.fn();
    renderMap(LOCATIONS, { onSelectLocation: onSelect });
    const map = loadedMap();

    clickFeature(map, "market-point-labels", { id: "2", count: 1 });

    expect(onSelect).toHaveBeenCalledWith("2");
  });

  it("lists the name layer among the tappable layers", () => {
    renderMap(LOCATIONS);
    const map = loadedMap();

    clickEmptyMap(map);

    expect(map.queryRenderedFeatures).toHaveBeenCalledWith(expect.anything(), {
      layers: expect.arrayContaining(["market-point-labels", "market-point-selected-label"]),
    });
  });
});

describe("MarketMap viewport edges", () => {
  function edgeSource(map: ReturnType<typeof loadedMap>) {
    const source = map.getSource("market-label-edges");
    if (!source) throw new Error("expected the label edge source");
    return source;
  }

  it("rings the viewport with collision obstacles once the map loads", () => {
    renderMap(LOCATIONS);
    const map = loadedMap();
    const layout = (map.getLayer("market-label-edges") as { layout?: Record<string, unknown> })
      .layout;

    // Two 200 px columns past both corners of a 360 x 640 canvas, two rows
    // between them.
    expect((edgeSource(map).spec.data as { features: unknown[] }).features).toHaveLength(16);
    expect(layout?.["icon-allow-overlap"]).toBe(true);
    expect(map.addImage).toHaveBeenCalledWith("market-label-edge", {
      width: 1,
      height: 1,
      data: new Uint8Array(4),
    });
  });

  it("never rebuilds the obstacles on a move frame", () => {
    // A setData per frame re-tiled the source and re-placed every symbol on
    // each frame of a pan: about a third of the frame rate, gone.
    renderMap(LOCATIONS);
    const map = loadedMap();
    act(() => map.trigger("movestart"));
    const source = edgeSource(map);
    source.setData.mockClear();

    act(() => {
      for (let frame = 0; frame < 60; frame++) map.trigger("move");
    });

    expect(source.setData).not.toHaveBeenCalled();
  });

  it("lifts the obstacles while the map moves and restores them where it settles", () => {
    renderMap(LOCATIONS);
    const map = loadedMap();
    const source = edgeSource(map);
    const ring = source.spec.data;
    source.setData.mockClear();

    act(() => map.trigger("movestart"));
    expect(source.setData).toHaveBeenCalledTimes(1);
    expect((source.spec.data as { features: unknown[] }).features).toHaveLength(0);

    act(() => map.trigger("moveend"));
    expect(source.setData).toHaveBeenCalledTimes(2);
    expect(source.spec.data).toEqual(ring);
  });

  it("stops following the map after unmount", () => {
    const { unmount } = renderMap(LOCATIONS);
    const map = loadedMap();
    const source = edgeSource(map);
    unmount();
    source.setData.mockClear();

    act(() => {
      map.trigger("movestart");
      map.trigger("moveend");
    });

    expect(source.setData).not.toHaveBeenCalled();
  });
});

describe("MarketMap style failure", () => {
  it("shows the unavailable surface when the style fails to load", () => {
    renderMap(LOCATIONS);
    const map = firstMap();

    act(() => {
      map.trigger("error", { error: { message: "NetworkError" } } as never);
    });

    expect(screen.getByText(/could not be loaded/i)).toBeTruthy();
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

    act(() => {
      map.trigger("error", { error: { status: 404, message: "tile missing" } } as never);
    });

    expect(screen.queryByText(/could not be loaded/i)).toBeNull();
    expect(map.remove).not.toHaveBeenCalled();
  });

  it("uses the unavailable surface when switching Standard themes throws", () => {
    renderMap(LOCATIONS);
    const map = loadedMap();
    map.setStyle.mockImplementationOnce(() => {
      throw new Error("standard style unavailable");
    });

    act(() => useThemeStore.getState().setTheme("dark"));

    expect(screen.getByText(/could not be loaded/i)).toBeTruthy();
  });

  it("falls back to the standard map when the satellite style fails", () => {
    const onSatelliteUnavailable = vi.fn();
    const { rerender } = render(
      <MarketMap
        mode="standard"
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
        onSatelliteUnavailable={onSatelliteUnavailable}
      />,
    );
    const map = loadedMap();

    rerender(
      <MarketMap
        mode="satellite"
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
        onSatelliteUnavailable={onSatelliteUnavailable}
      />,
    );
    act(() => {
      map.trigger("error", { error: { message: "style failed" } } as never);
    });

    expect(screen.queryByText(/could not be loaded/i)).toBeNull();
    expect(map.setStyle).toHaveBeenLastCalledWith("https://tiles.openfreemap.org/styles/positron");
    expect(onSatelliteUnavailable).toHaveBeenCalledOnce();
    expect(map.remove).not.toHaveBeenCalled();
  });

  it("falls back when applying the satellite style throws synchronously", () => {
    const onSatelliteUnavailable = vi.fn();
    const { rerender } = render(
      <MarketMap
        mode="standard"
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
        onSatelliteUnavailable={onSatelliteUnavailable}
      />,
    );
    const map = loadedMap();
    map.setStyle.mockImplementationOnce(() => {
      throw new Error("style unavailable");
    });

    rerender(
      <MarketMap
        mode="satellite"
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
        onSatelliteUnavailable={onSatelliteUnavailable}
      />,
    );

    expect(screen.queryByText(/could not be loaded/i)).toBeNull();
    expect(map.setStyle).toHaveBeenLastCalledWith("https://tiles.openfreemap.org/styles/positron");
    expect(onSatelliteUnavailable).toHaveBeenCalledOnce();
  });

  it("uses the unavailable surface when Satellite and its Standard fallback both throw", () => {
    const { rerender } = renderMap(LOCATIONS);
    const map = loadedMap();
    map.setStyle.mockImplementation(() => {
      throw new Error("all styles unavailable");
    });

    rerender(
      <MarketMap
        mode="satellite"
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(screen.getByText(/could not be loaded/i)).toBeTruthy();
  });

  it("keeps Standard and reports Satellite unavailable when the key is absent", () => {
    vi.stubEnv("VITE_MAPTILER_KEY", "");
    const onSatelliteUnavailable = vi.fn();
    render(
      <MarketMap
        mode="satellite"
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
        onSatelliteUnavailable={onSatelliteUnavailable}
      />,
    );
    const map = loadedMap();

    expect(map.options.style).toBe("https://tiles.openfreemap.org/styles/positron");
    expect(map.setStyle).not.toHaveBeenCalled();
    expect(onSatelliteUnavailable).toHaveBeenCalledOnce();
  });
});

describe("MarketMap trailing fan page", () => {
  it("renders the final one-member page of an oversized stack", () => {
    const size = SPIDER_PAGE_SIZE + 1;
    const stack: MarketLocation[] = Array.from({ length: size }, (_, index) => ({
      id: `t${index}`,
      name: `Voucher ${index}`,
      kind: "voucher" as const,
      markerIcon: null,
      markerColor: null,
      lat: -1.283253,
      lng: 36.817245,
      locationName: null,
    }));
    renderMap(stack);
    const map = loadedMap();

    const tap = () =>
      clickFeature(
        map,
        "market-stacks",
        { key: "-1.283253,36.817245", count: size },
        { type: "Point", coordinates: [36.817245, -1.283253] },
      );

    tap();
    const first = map.getSource("market-spider")?.spec.data as { features: unknown[] };
    expect(first.features.length).toBeGreaterThan(0);

    tap();
    const second = map.getSource("market-spider")?.spec.data as {
      features: Array<{ geometry: { type: string } }>;
    };
    expect(second.features.filter((f) => f.geometry.type === "Point")).toHaveLength(1);
  });
});

describe("MarketMap fallback copy", () => {
  it("never tells the user to browse a list that does not exist", () => {
    renderMap(LOCATIONS);
    const map = firstMap();
    act(() => {
      map.trigger("error", { error: { message: "NetworkError" } } as never);
    });

    expect(screen.queryByText(/as a list/i)).toBeNull();
    expect(screen.queryByText(/browse vouchers/i)).toBeNull();
  });

  it("offers no retry on a device that cannot render the map at all", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    renderMap(LOCATIONS);

    expect(screen.getByText(/not supported on this device/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });
});

describe("MarketMap camera scope", () => {
  function renderScoped(scope: string, camera: MarketCamera | null) {
    return render(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={camera}
        cameraScope={scope}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );
  }

  it("lets a worse-ranked camera apply after the scope changes", () => {
    const persisted: MarketCamera = { lat: -1.2, lng: 36.7, zoom: 14, rank: 2 };
    const { rerender } = renderScoped("0xabc", persisted);
    const map = loadedMap();
    expect(map.easeTo).toHaveBeenCalledWith({ center: [36.7, -1.2], zoom: 14 });

    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={{ lat: 12, lng: 34, zoom: 11, rank: 3 }}
        cameraScope="guest"
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.easeTo).toHaveBeenLastCalledWith({ center: [34, 12], zoom: 11 });
  });

  it("still ignores a worse rank within the same scope", () => {
    const { rerender } = renderScoped("0xabc", { lat: -1.2, lng: 36.7, zoom: 14, rank: 2 });
    const map = loadedMap();
    expect(map.easeTo).toHaveBeenCalledTimes(1);

    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={{ lat: 12, lng: 34, zoom: 11, rank: 3 }}
        cameraScope="0xabc"
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.easeTo).toHaveBeenCalledTimes(1);
  });
});

describe("MarketMap filtered framing", () => {
  const BOUNDS = { key: "art", west: 36.8, south: -1.5, east: 37.1, north: -1.2 };

  it("frames the bounds once, capped so a lone result keeps its context", () => {
    const { rerender } = renderMap(LOCATIONS, { fitBounds: BOUNDS });
    const map = loadedMap();

    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [36.8, -1.5],
        [37.1, -1.2],
      ],
      expect.objectContaining({ maxZoom: 14 }),
    );

    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        fitBounds={{ ...BOUNDS }}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("caps the zoom for degenerate single-result bounds", () => {
    const single = { key: "solo", west: 36.82, south: -1.29, east: 36.82, north: -1.29 };
    renderMap(LOCATIONS, { fitBounds: single });
    const map = loadedMap();

    const [bounds, options] = map.fitBounds.mock.calls[0] as [number[][], { maxZoom: number }];
    expect(bounds).toEqual([
      [36.82, -1.29],
      [36.82, -1.29],
    ]);
    expect(options.maxZoom).toBe(14);
    expect(options.maxZoom).toBeLessThan(map.maxZoom);
  });

  it("does not let a late automatic camera pan away from the results", () => {
    const { rerender } = renderMap(LOCATIONS, { fitBounds: BOUNDS });
    const map = loadedMap();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={{ lat: -4.05, lng: 39.66, zoom: 12, rank: 2 }}
        fitBounds={BOUNDS}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it("still lets the explicit location button win while framed", () => {
    const { rerender } = renderMap(LOCATIONS, { fitBounds: BOUNDS });
    const map = loadedMap();

    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={{ lat: -4.05, lng: 39.66, zoom: 12, rank: EXPLICIT_CAMERA_RANK }}
        fitBounds={BOUNDS}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.easeTo).toHaveBeenCalledWith({ center: [39.66, -4.05], zoom: 12 });
  });

  it("does not fire a suppressed automatic camera once the filter clears", () => {
    const { rerender } = renderMap(LOCATIONS, { fitBounds: BOUNDS });
    const map = loadedMap();

    const late = { lat: -4.05, lng: 39.66, zoom: 12, rank: 2 };
    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={late}
        fitBounds={BOUNDS}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    rerender(
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={late}
        fitBounds={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />,
    );

    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it("re-arms so the same filter frames again after being cleared", () => {
    const { rerender } = renderMap(LOCATIONS, { fitBounds: BOUNDS });
    const map = loadedMap();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    const withBounds = (fitBounds: typeof BOUNDS | null) => (
      <MarketMap
        locations={LOCATIONS}
        selectedLocationId={null}
        camera={null}
        fitBounds={fitBounds}
        userLocation={null}
        onSelectLocation={vi.fn()}
      />
    );

    rerender(withBounds(null));
    rerender(withBounds(BOUNDS));

    expect(map.fitBounds).toHaveBeenCalledTimes(2);
  });
});

describe("MarketMap under a sheet", () => {
  // The mock projects [lng, lat] to (lng * 100, lat * 100) on a 360 x 640 canvas.
  const LOW: MarketLocation = {
    id: "low",
    name: "Low",
    kind: "goods",
    markerIcon: null,
    markerColor: null,
    lat: 6,
    lng: 1,
    locationName: null,
  };
  const HIGH: MarketLocation = {
    id: "high",
    name: "High",
    kind: "goods",
    markerIcon: null,
    markerColor: null,
    lat: 3,
    lng: 1,
    locationName: null,
  };

  function revealCalls(map: ReturnType<typeof loadedMap>) {
    return map.easeTo.mock.calls.filter(
      ([options]) => !(options as { padding?: unknown }).padding,
    ) as [{ center: [number, number] }][];
  }

  it("pads the camera by the sheet without moving the view", () => {
    const { rerender } = renderMap([HIGH]);
    const map = loadedMap();
    expect(map.easeTo).not.toHaveBeenCalled();

    rerender(
      <MarketMap
        locations={[HIGH]}
        selectedLocationId={null}
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
        bottomInset={300}
      />,
    );

    // What sat at the centre of the 340 px left above the sheet becomes the centre.
    expect(map.easeTo).toHaveBeenCalledWith({
      center: [1.8, 1.7],
      padding: { top: 0, right: 0, bottom: 300, left: 0 },
      duration: 0,
    });
  });

  it("re-centres a selected pin the sheet covers, and leaves a visible one", () => {
    const { rerender } = renderMap([LOW, HIGH], { selectedLocationId: "high", bottomInset: 200 });
    const map = loadedMap();
    expect(revealCalls(map)).toEqual([]);

    rerender(
      <MarketMap
        locations={[LOW, HIGH]}
        selectedLocationId="low"
        camera={null}
        userLocation={null}
        onSelectLocation={vi.fn()}
        bottomInset={200}
      />,
    );

    expect(revealCalls(map)).toEqual([[{ center: [1, 6] }]]);
  });

  it("reveals the selected pin again when the sheet grows over it", () => {
    const props = {
      locations: [HIGH],
      selectedLocationId: "high",
      camera: null,
      userLocation: null,
      onSelectLocation: vi.fn(),
    };
    const { rerender } = render(<MarketMap {...props} bottomInset={160} />);
    const map = loadedMap();
    expect(revealCalls(map)).toEqual([]);

    rerender(<MarketMap {...props} bottomInset={420} />);

    expect(revealCalls(map)).toEqual([[{ center: [1, 3] }]]);
  });

  it("keeps names above the sheet's edge", () => {
    renderMap(LOCATIONS, { bottomInset: 200 });
    const map = loadedMap();

    const source = map.getSource("market-label-edges");
    if (!source) throw new Error("expected the label edge source");
    const bottomRow = (
      source.spec.data as {
        features: { properties: { anchor: string }; geometry: { coordinates: number[] } }[];
      }
    ).features.filter((feature) => feature.properties.anchor === "top");
    // 640 - 200, less the 2 px inset; the mock unprojects y / 100.
    expect(bottomRow.map((feature) => feature.geometry.coordinates[1])).toEqual([4.38, 4.38]);
  });

  it("frames filtered results in the area above the sheet without padding twice", () => {
    renderMap(LOCATIONS, {
      bottomInset: 300,
      fitBounds: { key: "f", west: 36.8, south: -1.3, east: 36.9, north: -1.2 },
    });
    const map = loadedMap();

    const [, options] = map.fitBounds.mock.calls[0] as [unknown, { padding: { bottom: number } }];
    expect(options.padding.bottom).toBe(0);
  });

  it("reports a drag the viewer starts, and no programmatic move", () => {
    const onUserPan = vi.fn();
    renderMap(LOCATIONS, { onUserPan });
    const map = loadedMap();

    act(() => map.trigger("dragstart", {}));
    expect(onUserPan).not.toHaveBeenCalled();

    act(() => map.trigger("dragstart", { originalEvent: new Event("pointerdown") }));
    expect(onUserPan).toHaveBeenCalledTimes(1);
  });
});
