import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mapInstances,
	markerInstances,
	MockMap,
	MockMarker,
	MockNavigationControl,
	MockAttributionControl,
} = vi.hoisted(() => {
	type MapHandler = (event?: {
		lngLat?: { lat: number; lng: number };
		error?: Error;
	}) => void;
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

		triggerError(error = new Error("tile failed")) {
			this.handlers.get("error")?.({ error });
		}
	}

	class HoistedMockMarker {
		coordinates: [number, number] | null = null;
		handlers = new Map<string, () => void>();
		remove = vi.fn();
		options: { color?: string; draggable?: boolean };

		constructor(options: { color?: string; draggable?: boolean }) {
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

beforeEach(() => {
	vi.stubEnv("VITE_MAPTILER_KEY", "test key");
	mapInstances.length = 0;
	markerInstances.length = 0;
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
		{} as RenderingContext,
	);
});

describe("LocationMap", () => {
	it("creates a MapLibre map with the MapTiler style and required controls", () => {
		render(<LocationMap />);

		expect(mapInstances).toHaveLength(1);
		expect(mapInstances[0]?.options.style).toBe(
			"https://api.maptiler.com/maps/base-v4/style.json?key=test%20key",
		);
		expect(mapInstances[0]?.options.center).toEqual([36.8219, -1.2921]);
		expect(mapInstances[0]?.options.zoom).toBe(5);
		expect(
			mapInstances[0]?.controls.map((control) => control.position),
		).toEqual(["bottom-right", "bottom-left"]);
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
		const { unmount } = render(
			<LocationMap interactive lat={-1.2921} lng={36.8219} />,
		);
		mapInstances[0]?.triggerLoad();

		unmount();

		expect(markerInstances[0]?.remove).toHaveBeenCalled();
		expect(mapInstances[0]?.remove).toHaveBeenCalled();
	});

	it("renders nothing when VITE_MAPTILER_KEY is absent", () => {
		vi.stubEnv("VITE_MAPTILER_KEY", "");
		const { container } = render(<LocationMap />);
		expect(container.firstChild).toBeNull();
		expect(mapInstances).toHaveLength(0);
	});

	it("renders nothing when WebGL is not supported", () => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
		const { container } = render(<LocationMap />);
		expect(container.firstChild).toBeNull();
		expect(mapInstances).toHaveLength(0);
	});

	it("updates the marker and flies to new coordinates when lat/lng props change after load", () => {
		const { rerender } = render(<LocationMap interactive />);
		mapInstances[0]?.triggerLoad();

		rerender(<LocationMap interactive lat={-1.2921} lng={36.8219} />);

		expect(markerInstances[0]?.coordinates).toEqual([36.8219, -1.2921]);
		expect(mapInstances[0]?.flyTo).toHaveBeenCalledWith({
			center: [36.8219, -1.2921],
			zoom: 13,
		});
	});
});
