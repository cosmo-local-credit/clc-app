import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockGeoState =
	| { status: "idle" }
	| { status: "requesting" }
	| { status: "granted"; lat: number; lng: number; accuracy: number }
	| { status: "denied" }
	| { status: "unavailable" }
	| { status: "error"; message: string };

const {
	mockSearchLocations,
	mockReverseLocation,
	mockRequestGeolocation,
	mockGeoState,
	mockMapVisible,
} = vi.hoisted(() => ({
	mockSearchLocations: vi.fn(),
	mockReverseLocation: vi.fn(),
	mockRequestGeolocation: vi.fn(),
	mockGeoState: { current: { status: "idle" } as MockGeoState },
	mockMapVisible: { current: true },
}));

vi.mock("#/features/onboarding/api/geo-client", () => ({
	searchLocations: mockSearchLocations,
	reverseLocation: mockReverseLocation,
}));

vi.mock("./use-browser-geolocation", () => ({
	useBrowserGeolocation: () => ({
		state: mockGeoState.current,
		request: mockRequestGeolocation,
	}),
}));

vi.mock("./location-map", () => ({
	LocationMap: ({
		onLocationChange,
	}: {
		onLocationChange?: (lat: number, lng: number) => void;
	}) =>
		mockMapVisible.current ? (
			<button type="button" onClick={() => onLocationChange?.(-1.29, 36.82)}>
				pick map location
			</button>
		) : null,
}));

import { LocationPicker } from "./location-picker";

beforeEach(() => {
	vi.useRealTimers();
	mockSearchLocations.mockReset();
	mockReverseLocation.mockReset();
	mockRequestGeolocation.mockReset();
	mockGeoState.current = { status: "idle" };
	mockMapVisible.current = true;
});

describe("LocationPicker", () => {
	it("debounces search and selecting a suggestion reverse-geocodes the pin", async () => {
		vi.useFakeTimers();
		mockSearchLocations.mockResolvedValue([
			{
				address: "Nairobi CBD, Kenya",
				lat: -1.2921,
				lng: 36.8219,
				score: 99,
				country: "KE",
			},
		]);
		mockReverseLocation.mockResolvedValue({
			locationName: "Nairobi, Kenya",
			country: "KE",
		});
		const onChange = vi.fn();
		render(<LocationPicker onChange={onChange} value={undefined} />);

		fireEvent.change(screen.getByRole("searchbox", { name: /place/i }), {
			target: { value: "Nai" },
		});
		await act(async () => {
			vi.advanceTimersByTime(400);
			await Promise.resolve();
		});

		const suggestion = screen.getByRole("option", {
			name: /nairobi cbd/i,
		});
		await act(async () => {
			fireEvent.click(suggestion);
			await Promise.resolve();
		});

		expect(mockReverseLocation).toHaveBeenCalledWith(
			-1.2921,
			36.8219,
			expect.any(AbortSignal),
		);
		expect(onChange).toHaveBeenLastCalledWith({
			lat: -1.2921,
			lng: 36.8219,
			locationName: "Nairobi, Kenya",
			country: "KE",
		});
	});

	it("reverse-geocodes map taps and blocks value when no country is identified", async () => {
		mockReverseLocation.mockResolvedValue(null);
		const onChange = vi.fn();
		render(<LocationPicker onChange={onChange} value={undefined} />);

		fireEvent.click(screen.getByRole("button", { name: /pick map location/i }));

		await screen.findByText(/couldn't identify a country/i);
		expect(onChange).toHaveBeenLastCalledWith(undefined);
	});

	it("requests geolocation only when the trailing icon button is tapped", () => {
		render(<LocationPicker onChange={vi.fn()} value={undefined} />);
		expect(mockRequestGeolocation).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: /use my location/i }));

		expect(mockRequestGeolocation).toHaveBeenCalledTimes(1);
	});

	it("disables the geolocation icon when location is unavailable", () => {
		mockGeoState.current = { status: "denied" };
		render(<LocationPicker onChange={vi.fn()} value={undefined} />);

		expect(
			screen.getByRole("button", { name: /location unavailable/i }),
		).toHaveProperty("disabled", true);
	});

	it("falls back to search-only UI when the map is unavailable", () => {
		mockMapVisible.current = false;
		render(<LocationPicker onChange={vi.fn()} value={undefined} />);

		expect(screen.getByRole("searchbox", { name: /place/i })).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: /pick map location/i }),
		).toBeNull();
	});
});
