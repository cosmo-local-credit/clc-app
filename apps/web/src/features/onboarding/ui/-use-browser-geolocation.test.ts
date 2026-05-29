import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserGeolocation } from "./use-browser-geolocation";

type SuccessCallback = (position: GeolocationPosition) => void;
type ErrorCallback = (error: GeolocationPositionError) => void;

function makePosition(
	lat: number,
	lng: number,
	accuracy = 10,
): GeolocationPosition {
	return {
		coords: {
			latitude: lat,
			longitude: lng,
			accuracy,
			altitude: null,
			altitudeAccuracy: null,
			heading: null,
			speed: null,
			toJSON: () => ({}),
		},
		timestamp: Date.now(),
		toJSON: () => ({}),
	};
}

function makeError(code: number, message = "error"): GeolocationPositionError {
	return {
		code,
		message,
		PERMISSION_DENIED: 1,
		POSITION_UNAVAILABLE: 2,
		TIMEOUT: 3,
	};
}

let capturedSuccess: SuccessCallback = () => {};
let capturedError: ErrorCallback = () => {};
const mockGetCurrentPosition = vi.fn(
	(success: SuccessCallback, error: ErrorCallback) => {
		capturedSuccess = success;
		capturedError = error;
	},
);

let resolvePermission: (result: { state: string }) => void = () => {};
const mockPermissionsQuery = vi.fn().mockImplementation(
	() =>
		new Promise<{ state: string }>((resolve) => {
			resolvePermission = resolve;
		}),
);

beforeEach(() => {
	capturedSuccess = () => {};
	capturedError = () => {};
	resolvePermission = () => {};

	mockGetCurrentPosition.mockReset();
	mockGetCurrentPosition.mockImplementation(
		(success: SuccessCallback, error: ErrorCallback) => {
			capturedSuccess = success;
			capturedError = error;
		},
	);

	mockPermissionsQuery.mockReset();
	mockPermissionsQuery.mockImplementation(
		() =>
			new Promise<{ state: string }>((resolve) => {
				resolvePermission = resolve;
			}),
	);

	Object.defineProperty(navigator, "geolocation", {
		value: { getCurrentPosition: mockGetCurrentPosition },
		configurable: true,
		writable: true,
	});

	Object.defineProperty(navigator, "permissions", {
		value: { query: mockPermissionsQuery },
		configurable: true,
		writable: true,
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("useBrowserGeolocation", () => {
	it("starts in idle state", () => {
		const { result } = renderHook(() => useBrowserGeolocation());
		expect(result.current.state.status).toBe("idle");
	});

	it("sets status to unavailable when navigator.geolocation is absent", () => {
		Object.defineProperty(navigator, "geolocation", {
			value: undefined,
			configurable: true,
			writable: true,
		});

		const { result } = renderHook(() => useBrowserGeolocation());

		act(() => {
			result.current.request();
		});

		expect(result.current.state.status).toBe("unavailable");
	});

	it("transitions to requesting immediately on request()", () => {
		const { result } = renderHook(() => useBrowserGeolocation());

		act(() => {
			result.current.request();
		});

		expect(result.current.state.status).toBe("requesting");
	});

	it("transitions to granted on getCurrentPosition success", async () => {
		const { result } = renderHook(() => useBrowserGeolocation());

		act(() => {
			result.current.request();
		});

		await act(async () => {
			capturedSuccess(makePosition(-1.2921, 36.8219, 15));
		});

		expect(result.current.state).toEqual({
			status: "granted",
			lat: -1.2921,
			lng: 36.8219,
			accuracy: 15,
		});
	});

	it("transitions to denied on PERMISSION_DENIED error code", async () => {
		const { result } = renderHook(() => useBrowserGeolocation());

		act(() => {
			result.current.request();
		});

		await act(async () => {
			capturedError(makeError(1, "User denied Geolocation"));
		});

		expect(result.current.state.status).toBe("denied");
	});

	it("transitions to unavailable on POSITION_UNAVAILABLE error code", async () => {
		const { result } = renderHook(() => useBrowserGeolocation());

		act(() => {
			result.current.request();
		});

		await act(async () => {
			capturedError(makeError(2, "Position unavailable"));
		});

		expect(result.current.state.status).toBe("unavailable");
	});

	it("transitions to error with message on TIMEOUT and other error codes", async () => {
		const { result } = renderHook(() => useBrowserGeolocation());

		act(() => {
			result.current.request();
		});

		await act(async () => {
			capturedError(makeError(3, "Timeout expired"));
		});

		expect(result.current.state).toEqual({
			status: "error",
			message: "Timeout expired",
		});
	});

	it("transitions to denied via permissions API before getCurrentPosition resolves", async () => {
		const { result } = renderHook(() => useBrowserGeolocation());

		act(() => {
			result.current.request();
		});

		await act(async () => {
			resolvePermission({ state: "denied" });
			await Promise.resolve();
		});

		expect(result.current.state.status).toBe("denied");
	});

	it("ignores stale getCurrentPosition result when a newer request supersedes it", async () => {
		let firstCapture: SuccessCallback = () => {};
		let secondCapture: SuccessCallback = () => {};

		mockGetCurrentPosition
			.mockImplementationOnce((s: SuccessCallback) => {
				firstCapture = s;
			})
			.mockImplementationOnce((s: SuccessCallback) => {
				secondCapture = s;
			});

		const { result } = renderHook(() => useBrowserGeolocation());

		act(() => {
			result.current.request();
		});
		act(() => {
			result.current.request();
		});

		await act(async () => {
			firstCapture(makePosition(0, 0, 1));
		});

		expect(result.current.state.status).toBe("requesting");

		await act(async () => {
			secondCapture(makePosition(-1.29, 36.82, 5));
		});

		expect(result.current.state).toEqual({
			status: "granted",
			lat: -1.29,
			lng: 36.82,
			accuracy: 5,
		});
	});

	it("ignores stale permissions denial when a newer request supersedes it", async () => {
		let firstResolve: (r: { state: string }) => void = () => {};
		let secondCapture: SuccessCallback = () => {};

		mockPermissionsQuery
			.mockImplementationOnce(
				() =>
					new Promise<{ state: string }>((resolve) => {
						firstResolve = resolve;
					}),
			)
			.mockImplementationOnce(() => new Promise<{ state: string }>(() => {}));

		mockGetCurrentPosition
			.mockImplementationOnce(() => {})
			.mockImplementationOnce((s: SuccessCallback) => {
				secondCapture = s;
			});

		const { result } = renderHook(() => useBrowserGeolocation());

		act(() => {
			result.current.request();
		});
		act(() => {
			result.current.request();
		});

		await act(async () => {
			firstResolve({ state: "denied" });
			await Promise.resolve();
		});

		expect(result.current.state.status).toBe("requesting");

		await act(async () => {
			secondCapture(makePosition(-1.2921, 36.8219, 10));
		});

		expect(result.current.state.status).toBe("granted");
	});
});
