import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  mapInstances,
  markerInstances,
  MockMap,
  MockMarker,
  MockNavigationControl,
  MockAttributionControl,
} = vi.hoisted(() => {
  type MapHandler = (event?: { lngLat?: { lat: number; lng: number }; error?: Error }) => void;
  type MockMapOptions = {
    container: HTMLElement;
    style: string;
    center: [number, number];
    zoom: number;
    interactive: boolean;
    attributionControl: boolean;
  };

  class HoistedMockMap {
    options: MockMapOptions;
    handlers = new Map<string, MapHandler>();
    controls: Array<{ control: unknown; position?: string }> = [];
    canvas = { style: {} as Record<string, string> };
    loadedValue = false;
    flyTo = vi.fn();
    setStyle = vi.fn((style: string) => {
      this.options.style = style;
    });
    remove = vi.fn();

    constructor(options: MockMapOptions) {
      this.options = options;
      mapInstances.push(this);
    }

    addControl(control: unknown, position?: string) {
      this.controls.push({ control, position });
    }

    on(event: string, handler: MapHandler) {
      this.handlers.set(event, handler);
    }

    off(event: string) {
      this.handlers.delete(event);
    }

    loaded() {
      return this.loadedValue;
    }

    getCanvas() {
      return this.canvas;
    }

    triggerLoad() {
      this.loadedValue = true;
      this.handlers.get("load")?.();
    }

    triggerClick(lat: number, lng: number) {
      this.handlers.get("click")?.({ lngLat: { lat, lng } });
    }

    triggerDragStart() {
      this.handlers.get("dragstart")?.();
    }

    triggerError(error = new Error("tile failed")) {
      this.handlers.get("error")?.({ error });
    }
  }

  class HoistedMockMarker {
    coordinates: [number, number] | null = null;
    handlers = new Map<string, () => void>();
    remove = vi.fn();
    options: { color?: string; draggable?: boolean; element?: HTMLElement; anchor?: string };

    constructor(options: {
      color?: string;
      draggable?: boolean;
      element?: HTMLElement;
      anchor?: string;
    }) {
      this.options = options;
      markerInstances.push(this);
    }

    setLngLat(coordinates: [number, number]) {
      this.coordinates = coordinates;
      return this;
    }

    addTo() {
      return this;
    }

    on(event: string, handler: () => void) {
      this.handlers.set(event, handler);
      return this;
    }

    getLngLat() {
      return {
        lng: this.coordinates?.[0] ?? 0,
        lat: this.coordinates?.[1] ?? 0,
      };
    }

    triggerDragEnd() {
      this.handlers.get("dragend")?.();
    }
  }

  const mapInstances: HoistedMockMap[] = [];
  const markerInstances: HoistedMockMarker[] = [];

  return {
    mapInstances,
    markerInstances,
    MockMap: HoistedMockMap,
    MockMarker: HoistedMockMarker,
    MockNavigationControl: class HoistedMockNavigationControl {},
    MockAttributionControl: class HoistedMockAttributionControl {
      options: { compact?: boolean };
      constructor(options: { compact?: boolean }) {
        this.options = options;
      }
    },
  };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: MockMap,
    Marker: MockMarker,
    NavigationControl: MockNavigationControl,
    AttributionControl: MockAttributionControl,
  },
}));

import { LocationMap } from "./location-map";
import { useThemeStore } from "#/providers/theme";

beforeEach(() => {
  vi.stubEnv("VITE_MAPTILER_KEY", "test key");
  window.localStorage.clear();
  useThemeStore.setState({ theme: "light" });
  mapInstances.length = 0;
  markerInstances.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as RenderingContext);
});

describe("LocationMap", () => {
  it("creates a MapLibre map with the keyless light style and navigation control", () => {
    render(<LocationMap />);

    expect(mapInstances).toHaveLength(1);
    expect(mapInstances[0]?.options.style).toBe("https://tiles.openfreemap.org/styles/liberty");
    expect(mapInstances[0]?.options.center).toEqual([20, 0]);
    expect(mapInstances[0]?.options.zoom).toBe(2);
    expect(mapInstances[0]?.controls.map((control) => control.position)).toEqual([
      "bottom-right",
      "bottom-left",
    ]);
  });

  it("starts an empty picker at its approximate camera without creating a marker", () => {
    render(<LocationMap cameraHint={{ lat: -6.7924, lng: 39.2083, zoom: 10 }} interactive />);

    expect(mapInstances[0]?.options.center).toEqual([39.2083, -6.7924]);
    expect(mapInstances[0]?.options.zoom).toBe(10);
    mapInstances[0]?.triggerLoad();
    expect(markerInstances).toHaveLength(0);
  });

  it("applies a late approximate camera without creating a marker or a second map", () => {
    const { rerender } = render(<LocationMap interactive />);
    const map = mapInstances[0];
    act(() => map?.triggerLoad());

    rerender(<LocationMap cameraHint={{ lat: 44.7866, lng: 20.4489, zoom: 10 }} interactive />);

    expect(mapInstances).toHaveLength(1);
    expect(map?.flyTo).toHaveBeenCalledWith({ center: [20.4489, 44.7866], zoom: 10 });
    expect(markerInstances).toHaveLength(0);
  });

  it("does not override an empty map after the user has started browsing it", () => {
    const { rerender } = render(<LocationMap interactive />);
    const map = mapInstances[0];
    act(() => map?.triggerLoad());
    act(() => map?.triggerDragStart());

    rerender(<LocationMap cameraHint={{ lat: 44.7866, lng: 20.4489, zoom: 10 }} interactive />);

    expect(map?.flyTo).not.toHaveBeenCalled();
  });

  it("switches the existing map to the dark style when the app theme changes", () => {
    render(<LocationMap interactive lat={-1.2921} lng={36.8219} />);
    const map = mapInstances[0];
    act(() => map?.triggerLoad());

    act(() => useThemeStore.getState().setTheme("dark"));

    expect(mapInstances).toHaveLength(1);
    expect(map?.setStyle).toHaveBeenCalledWith("https://tiles.openfreemap.org/styles/fiord");
    expect(map?.remove).not.toHaveBeenCalled();
    expect(markerInstances).toHaveLength(1);
  });

  it("removes the map when a theme style cannot be applied", () => {
    render(<LocationMap interactive lat={-1.2921} lng={36.8219} />);
    const map = mapInstances[0];
    act(() => map?.triggerLoad());
    map?.setStyle.mockImplementationOnce(() => {
      throw new Error("style unavailable");
    });

    act(() => useThemeStore.getState().setTheme("dark"));

    expect(screen.queryByLabelText("Location map")).toBeNull();
  });

  it("places a pending marker after style load and flies to zoom 13", () => {
    render(<LocationMap interactive lat={-1.2921} lng={36.8219} />);

    mapInstances[0]?.triggerLoad();

    expect(markerInstances[0]?.coordinates).toEqual([36.8219, -1.2921]);
    expect(markerInstances[0]?.options.draggable).toBe(true);
    expect(mapInstances[0]?.flyTo).toHaveBeenCalledWith({
      center: [36.8219, -1.2921],
      zoom: 13,
    });
  });

  it("calls onLocationChange from map clicks and marker drags", () => {
    const onLocationChange = vi.fn();
    render(<LocationMap interactive onLocationChange={onLocationChange} />);

    mapInstances[0]?.triggerClick(-1.29, 36.82);
    markerInstances[0]?.setLngLat([36.83, -1.28]);
    markerInstances[0]?.triggerDragEnd();

    expect(onLocationChange).toHaveBeenNthCalledWith(1, -1.29, 36.82);
    expect(onLocationChange).toHaveBeenNthCalledWith(2, -1.28, 36.83);
  });

  it("keeps the map mounted for non-fatal errors after the style has loaded", () => {
    render(<LocationMap interactive lat={-1.2921} lng={36.8219} />);
    mapInstances[0]?.triggerLoad();

    mapInstances[0]?.triggerError();

    expect(screen.getByLabelText("Location map")).toBeTruthy();
    expect(mapInstances[0]?.remove).not.toHaveBeenCalled();
  });

  it("keeps the map mounted for recoverable errors before load", () => {
    render(<LocationMap interactive />);

    act(() => {
      mapInstances[0]?.triggerError(new Error("tile failed"));
    });

    expect(screen.getByLabelText("Location map")).toBeTruthy();
    expect(mapInstances[0]?.remove).not.toHaveBeenCalled();
  });

  it("removes map and marker on cleanup", () => {
    const { unmount } = render(<LocationMap interactive lat={-1.2921} lng={36.8219} />);
    mapInstances[0]?.triggerLoad();

    unmount();

    expect(markerInstances[0]?.remove).toHaveBeenCalled();
    expect(mapInstances[0]?.remove).toHaveBeenCalled();
  });

  it("renders the standard map when VITE_MAPTILER_KEY is absent", () => {
    vi.stubEnv("VITE_MAPTILER_KEY", "");
    render(<LocationMap />);
    expect(screen.getByLabelText("Location map")).toBeTruthy();
    expect(mapInstances[0]?.options.style).toBe("https://tiles.openfreemap.org/styles/liberty");
  });

  it("renders nothing when WebGL is not supported", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container } = render(<LocationMap />);
    expect(container.firstChild).toBeNull();
    expect(mapInstances).toHaveLength(0);
  });

  it("updates the marker position and preview without recreating the map", () => {
    const { rerender } = render(
      <LocationMap interactive markerStyle={{ icon: "education", color: "blue" }} />,
    );
    act(() => mapInstances[0]?.triggerLoad());
    // Tile fetching during a camera move makes loaded() false after the
    // map's one-time load event has already fired.
    const map = mapInstances[0];
    if (map) map.loadedValue = false;

    rerender(
      <LocationMap
        interactive
        lat={-1.2921}
        lng={36.8219}
        markerStyle={{ icon: "education", color: "blue" }}
      />,
    );

    expect(markerInstances[0]?.coordinates).toEqual([36.8219, -1.2921]);
    expect(mapInstances[0]?.flyTo).toHaveBeenCalledWith({
      center: [36.8219, -1.2921],
      zoom: 13,
    });
    const element = markerInstances[0]?.options.element;
    expect(markerInstances[0]?.options.anchor).toBe("bottom");
    expect(element?.querySelector("path")?.getAttribute("fill")).toBe("#007A55");
    const glyph = element?.querySelector("svg svg")?.innerHTML;
    mapInstances[0]?.flyTo.mockClear();

    rerender(
      <LocationMap
        interactive
        lat={-1.2921}
        lng={36.8219}
        markerStyle={{ icon: "food", color: "pink" }}
      />,
    );

    expect(element?.querySelector("path")?.getAttribute("fill")).toBe("#007A55");
    expect(element?.querySelector("svg svg")?.innerHTML).not.toBe(glyph);
    expect(mapInstances).toHaveLength(1);
    expect(markerInstances).toHaveLength(1);
    expect(mapInstances[0]?.flyTo).not.toHaveBeenCalled();
  });

  it("updates a Want icon live while keeping the fixed orange marker", () => {
    const { rerender } = render(
      <LocationMap
        interactive
        lat={-1.2921}
        lng={36.8219}
        markerStyle={{ icon: "question", color: "orange" }}
      />,
    );
    act(() => mapInstances[0]?.triggerLoad());
    const element = markerInstances[0]?.options.element;
    const glyph = element?.querySelector("svg svg")?.innerHTML;

    rerender(
      <LocationMap
        interactive
        lat={-1.2921}
        lng={36.8219}
        markerStyle={{ icon: "message", color: "cyan" }}
      />,
    );

    expect(element?.querySelector("path")?.getAttribute("fill")).toBe("#EA580C");
    expect(element?.querySelector("svg svg")?.innerHTML).not.toBe(glyph);
    expect(mapInstances).toHaveLength(1);
    expect(markerInstances).toHaveLength(1);
  });

  it.each([
    ["pool", "#125A98"],
    ["catalog", "#7C3AED"],
  ] as const)("previews a %s with its fixed resource colour", (markerResource, fill) => {
    render(<LocationMap lat={-1.2921} lng={36.8219} markerResource={markerResource} interactive />);
    act(() => mapInstances[0]?.triggerLoad());

    const element = markerInstances[0]?.options.element;
    expect(element?.querySelector("path")?.getAttribute("fill")).toBe(fill);
    expect(element?.querySelector("svg svg")).toBeTruthy();
  });
});
