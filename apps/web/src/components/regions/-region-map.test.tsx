import type { Region } from "@clc/core/features/regions/logic";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { RegionMap } from "./region-map";

const state = vi.hoisted(() => {
  const events = new Map<string, () => void>();
  const source = { setData: vi.fn() };
  return {
    events,
    source,
    theme: "light",
    available: true,
    sourceAdded: false,
    mapConstructed: vi.fn(),
    addControl: vi.fn(),
    addLayer: vi.fn(),
    fitBounds: vi.fn(),
    remove: vi.fn(),
    setStyle: vi.fn(),
  };
});
vi.mock("#/providers/theme", () => ({
  useHydratedTheme: () => ({ theme: state.theme }),
}));
vi.mock("maplibre-gl", () => ({
  default: {
    Map: class {
      constructor(options: unknown) {
        if (!state.available) throw new Error("WebGL is unavailable");
        state.mapConstructed(options);
      }
      on(event: string, listener: () => void) {
        state.events.set(event, listener);
      }
      off(event: string) {
        state.events.delete(event);
      }
      addSource() {
        state.sourceAdded = true;
      }
      getSource() {
        return state.sourceAdded ? state.source : undefined;
      }
      setStyle(style: string) {
        state.sourceAdded = false;
        state.setStyle(style);
      }
      addControl = state.addControl;
      addLayer = state.addLayer;
      fitBounds = state.fitBounds;
      remove = state.remove;
    },
    AttributionControl: class {},
  },
}));

const initial: Region = {
  id: "bt",
  name: "Bhutan",
  countryCode: "BTN",
  active: true,
  revision: 1,
  boundary: {
    type: "Polygon",
    coordinates: [
      [
        [89, 27],
        [90, 27],
        [90, 28],
        [89, 27],
      ],
    ],
  },
  poolApproval: true,
  assignedAdmins: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  state.events.clear();
  state.theme = "light";
  state.available = true;
  state.sourceAdded = false;
});

describe("assigned region boundary map", () => {
  it("keeps one map for region and theme changes and restores its outline after style reload", () => {
    const { rerender, unmount } = render(<RegionMap region={initial} />);
    expect(screen.getByRole("region", { name: "Map of Bhutan" })).toBeTruthy();
    expect(state.mapConstructed).toHaveBeenCalledWith(
      expect.objectContaining({ style: "https://tiles.openfreemap.org/styles/liberty" }),
    );
    act(() => state.events.get("style.load")?.());
    expect(state.addLayer.mock.calls.map(([layer]) => layer.type)).toEqual(["fill", "line"]);
    expect(state.fitBounds).toHaveBeenCalledWith([89, 27, 90, 28], expect.any(Object));

    const second: Region = {
      ...initial,
      id: "ke",
      name: "Kenya",
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [37, -4],
            [38, -4],
            [38, -3],
            [37, -4],
          ],
        ],
      },
    };
    rerender(<RegionMap region={second} />);
    expect(state.source.setData).toHaveBeenCalledWith(
      expect.objectContaining({ geometry: second.boundary }),
    );
    expect(state.fitBounds).toHaveBeenLastCalledWith([37, -4, 38, -3], expect.any(Object));

    state.theme = "dark";
    rerender(<RegionMap region={second} />);
    expect(state.setStyle).toHaveBeenCalledWith("/map-styles/liberty-dark.json");
    act(() => state.events.get("style.load")?.());
    expect(state.addLayer).toHaveBeenCalledTimes(4);
    expect(state.fitBounds).toHaveBeenCalledTimes(2);
    expect(state.mapConstructed).toHaveBeenCalledTimes(1);

    act(() => state.events.get("error")?.());
    expect(screen.getByRole("region", { name: "Map of Kenya" })).toBeTruthy();
    unmount();
    expect(state.remove).toHaveBeenCalledTimes(1);
    expect(state.events.size).toBe(0);
  });

  it("provides a non-blocking fallback when WebGL is unavailable", () => {
    state.available = false;
    render(<RegionMap region={initial} />);
    expect(screen.getByRole("status").textContent).toBe("The map could not be loaded.");
    expect(screen.queryByRole("region", { name: "Map of Bhutan" })).toBeNull();
  });

  it("reports a style load error before a boundary is drawn", () => {
    render(<RegionMap region={initial} />);
    act(() => state.events.get("error")?.());
    expect(screen.getByRole("status").textContent).toBe("The map could not be loaded.");
    expect(state.remove).toHaveBeenCalledTimes(1);
  });
});
