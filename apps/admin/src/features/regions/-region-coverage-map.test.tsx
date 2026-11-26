import type { RegionBoundary } from "@clc/core/features/regions/logic";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { RegionCoverageMap } from "./region-coverage-map";

const mock = vi.hoisted(() => ({
  unsupported: false,
  events: new Map<string, (event?: unknown) => void>(),
  addLayer: vi.fn(),
  addSource: vi.fn(),
  fitBounds: vi.fn(),
  setData: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("maplibre-gl", () => ({
  default: {
    Map: class FakeMap {
      constructor() {
        if (mock.unsupported) throw new Error("WebGL unavailable");
      }
      addControl() {}
      addLayer = mock.addLayer;
      addSource = mock.addSource;
      fitBounds = mock.fitBounds;
      remove = mock.remove;
      getSource() {
        return { setData: mock.setData };
      }
      on(
        event: string,
        listener: string | ((event?: unknown) => void),
        handler?: (event?: unknown) => void,
      ) {
        if (typeof listener === "function") mock.events.set(event, listener);
        else if (handler) mock.events.set(event, handler);
      }
    },
    NavigationControl: class FakeNavigationControl {},
    AttributionControl: class FakeAttributionControl {},
  },
}));

const boundary: RegionBoundary = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [177, -19],
        [179, -19],
        [179, -17],
        [177, -19],
      ],
    ],
    [
      [
        [-179, -19],
        [-178, -18],
        [-179, -17],
        [-179, -19],
      ],
    ],
  ],
};
const areas = [{ id: "fiji", boundary }];

beforeEach(() => {
  vi.clearAllMocks();
  mock.unsupported = false;
  mock.events.clear();
});

it("frames the highlighted region across the antimeridian and opens it on selection", () => {
  const onSelect = vi.fn();
  const { unmount } = render(
    <RegionCoverageMap areas={areas} highlighted={["fiji"]} onSelect={onSelect} />,
  );
  act(() => mock.events.get("style.load")?.());

  expect(mock.addLayer.mock.calls.map(([layer]) => layer.type)).toEqual(["fill", "line"]);
  expect(mock.setData).toHaveBeenCalledWith({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { id: "fiji", highlighted: true }, geometry: boundary },
    ],
  });
  expect(mock.fitBounds).toHaveBeenCalledWith(
    [
      [177, -19],
      [182, -17],
    ],
    expect.any(Object),
  );
  act(() => mock.events.get("click")?.({ features: [{ properties: { id: "fiji" } }] }));
  expect(onSelect).toHaveBeenCalledWith("fiji");
  unmount();
  expect(mock.remove).toHaveBeenCalledOnce();
});

it("has a non-blocking fallback if WebGL cannot initialize", () => {
  mock.unsupported = true;
  render(<RegionCoverageMap areas={areas} highlighted={[]} />);
  expect(screen.getByRole("status").textContent).toContain("Map unavailable.");
  expect(mock.setData).not.toHaveBeenCalled();
});
