import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mapInstances, markerInstances, MockMap, MockMarker } = vi.hoisted(
	() => {
		type MapHandler = (event?: {
			features?: Array<{
				properties?: Record<string, unknown>;
				geometry: { type: "Point"; coordinates: [number, number] };
			}>;
		}) => void;

		type MockMapOptions = {
			container: HTMLElement;
			style: string;
			center: [number, number];
			zoom: number;
			attributionControl: boolean;
		};

		class HoistedMockMap {
			options: MockMapOptions;
			handlers = new Map<string, MapHandler>();
			sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
			flyTo = vi.fn();
			easeTo = vi.fn();
			addImage = vi.fn();
			hasImage = vi.fn(() => false);
			addLayer = vi.fn();
			remove = vi.fn();

			constructor(options: MockMapOptions) {
				this.options = options;
				mapInstances.push(this);
			}

			on(event: string, handler: MapHandler) {
				this.handlers.set(event, handler);
			}

			off(event: string) {
				this.handlers.delete(event);
			}

			addSource(id: string) {
				this.sources.set(id, { setData: vi.fn() });
			}

			getSource(id: string) {
				return this.sources.get(id);
			}

			triggerLoad() {
				this.handlers.get("load")?.();
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
	},
);

vi.mock("maplibre-gl", () => ({
	default: {
		Map: MockMap,
		Marker: MockMarker,
	},
}));

import { placeholderMarketLocations } from "./market-data";
import { MarketMap } from "./market-map";

beforeEach(() => {
	vi.stubEnv("VITE_MAPTILER_KEY", "test key");
	mapInstances.length = 0;
	markerInstances.length = 0;
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
		{} as RenderingContext,
	);
	vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
		const element = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			tagName,
		);
		if (tagName !== "canvas")
			return element as HTMLElementTagNameMap[keyof HTMLElementTagNameMap];
		const canvas = element as HTMLCanvasElement;
		const context = {
			scale: vi.fn(),
			clearRect: vi.fn(),
			beginPath: vi.fn(),
			arc: vi.fn(),
			fill: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			stroke: vi.fn(),
			quadraticCurveTo: vi.fn(),
			strokeRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(20 * 20 * 4) })),
			fillStyle: "",
			strokeStyle: "",
			lineWidth: 0,
			lineCap: "round",
			lineJoin: "round",
		};
		vi.spyOn(canvas, "getContext").mockReturnValue(
			context as unknown as RenderingContext,
		);
		return canvas;
	});
});

describe("MarketMap", () => {
	it("keeps the viewport centered on the user when user location is present", () => {
		render(
			<MarketMap
				locations={placeholderMarketLocations}
				selectedLocationId={placeholderMarketLocations[0]?.id}
				userLocation={{ lat: -1.2921, lng: 36.8219 }}
				onSelectLocation={vi.fn()}
			/>,
		);

		act(() => {
			mapInstances[0]?.triggerLoad();
		});

		expect(markerInstances[0]?.coordinates).toEqual([36.8219, -1.2921]);
		expect(mapInstances[0]?.flyTo).toHaveBeenCalledTimes(1);
		expect(mapInstances[0]?.flyTo).toHaveBeenCalledWith({
			center: [36.8219, -1.2921],
			zoom: 14,
		});
	});
});
