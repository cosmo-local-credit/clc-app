import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";

const { mapInstances, MockMap, MockAttributionControl, MockNavigationControl } = vi.hoisted(() => {
  class HoistedMockMap {
    controls: Array<{ control: unknown; position?: string }> = [];
    options: { style: string };

    constructor(options: { style: string }) {
      this.options = options;
      mapInstances.push(this);
    }

    addControl(control: unknown, position?: string) {
      this.controls.push({ control, position });
    }

    getCanvas() {
      return { style: {} };
    }

    on() {}
    off() {}
    loaded() {
      return false;
    }
    remove() {}
  }

  const mapInstances: HoistedMockMap[] = [];
  return {
    mapInstances,
    MockMap: HoistedMockMap,
    MockAttributionControl: class HoistedMockAttributionControl {},
    MockNavigationControl: class HoistedMockNavigationControl {},
  };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: MockMap,
    Marker: class MockMarker {},
    NavigationControl: MockNavigationControl,
    AttributionControl: MockAttributionControl,
  },
}));

import { LocationMap } from "./location-map";

beforeEach(() => {
  mapInstances.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as RenderingContext);
});

it("renders the keyless map with navigation and compact attribution", () => {
  render(<LocationMap />);

  expect(screen.getByLabelText("Location map")).toBeTruthy();
  expect(mapInstances[0]?.options.style).toBe("https://tiles.openfreemap.org/styles/liberty");
  expect(mapInstances[0]?.controls.map(({ position }) => position)).toEqual([
    "bottom-right",
    "bottom-left",
  ]);
  expect(mapInstances[0]?.controls[1]?.control).toBeInstanceOf(MockAttributionControl);
});
