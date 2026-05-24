import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockConnect, mockStorePrivateKey, mockClearPrivateKey } = vi.hoisted(
	() => ({
		mockConnect: vi.fn().mockResolvedValue(undefined),
		mockStorePrivateKey: vi.fn(),
		mockClearPrivateKey: vi.fn(),
	}),
);

vi.mock("wagmi/actions", () => ({
	connect: mockConnect,
	getAccount: vi.fn(() => ({ isConnected: false })),
}));

vi.mock("#/connectors/privateKey", () => ({
	storePrivateKey: mockStorePrivateKey,
	clearPrivateKey: mockClearPrivateKey,
	privateKeyConnector: () => ({ id: "private-key" }),
}));

vi.mock("#/providers/web3", () => ({
	wagmiConfig: {},
	pkConnector: { id: "private-key" },
}));

// ── Import under test ──────────────────────────────────────────────────────────

import { getAccount } from "wagmi/actions";
import { useScanUrlImport } from "./scan-url-import";

// ── Helpers ────────────────────────────────────────────────────────────────────

const VALID_KEY =
	"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

function setSearch(search: string) {
	Object.defineProperty(window, "location", {
		value: { ...window.location, search, pathname: "/signup" },
		writable: true,
	});
	vi.spyOn(history, "replaceState").mockImplementation(() => {});
}

function clearSearch() {
	Object.defineProperty(window, "location", {
		value: { ...window.location, search: "", pathname: "/" },
		writable: true,
	});
}

beforeEach(() => {
	mockConnect.mockClear();
	mockStorePrivateKey.mockClear();
	mockClearPrivateKey.mockClear();
	vi.mocked(getAccount).mockReturnValue({ isConnected: false } as ReturnType<
		typeof getAccount
	>);
	clearSearch();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("useScanUrlImport", () => {
	it("returns null pendingKey when no ?w= is present", () => {
		const { result } = renderHook(() => useScanUrlImport());
		expect(result.current.pendingKey).toBeNull();
		expect(mockConnect).not.toHaveBeenCalled();
	});

	it("returns null pendingKey for an invalid key in ?w=", () => {
		setSearch("?w=not-a-key");
		const { result } = renderHook(() => useScanUrlImport());
		expect(result.current.pendingKey).toBeNull();
		expect(mockConnect).not.toHaveBeenCalled();
		expect(mockStorePrivateKey).not.toHaveBeenCalled();
	});

	it("cleans the URL even when the key is invalid", () => {
		setSearch("?w=not-a-key");
		const spy = vi.spyOn(history, "replaceState").mockImplementation(() => {});
		renderHook(() => useScanUrlImport());
		expect(spy).toHaveBeenCalledWith(null, "", expect.any(String));
	});

	it("auto-connects when disconnected and ?w= contains a valid key", () => {
		vi.mocked(getAccount).mockReturnValue({
			isConnected: false,
		} as ReturnType<typeof getAccount>);
		setSearch(`?w=${VALID_KEY}`);

		renderHook(() => useScanUrlImport());

		expect(mockStorePrivateKey).toHaveBeenCalledWith(VALID_KEY);
		expect(mockConnect).toHaveBeenCalledTimes(1);
	});

	it("sets pendingKey when already connected and ?w= has a valid key", () => {
		vi.mocked(getAccount).mockReturnValue({
			isConnected: true,
		} as ReturnType<typeof getAccount>);
		setSearch(`?w=${VALID_KEY}`);

		const { result } = renderHook(() => useScanUrlImport());

		expect(result.current.pendingKey).toBe(VALID_KEY);
		expect(mockStorePrivateKey).not.toHaveBeenCalled();
		expect(mockConnect).not.toHaveBeenCalled();
	});

	it("clearPendingKey resets pendingKey to null", () => {
		vi.mocked(getAccount).mockReturnValue({
			isConnected: true,
		} as ReturnType<typeof getAccount>);
		setSearch(`?w=${VALID_KEY}`);

		const { result } = renderHook(() => useScanUrlImport());
		expect(result.current.pendingKey).toBe(VALID_KEY);

		act(() => {
			result.current.clearPendingKey();
		});
		expect(result.current.pendingKey).toBeNull();
	});

	it("cleans the URL when a valid key is found", () => {
		setSearch(`?w=${VALID_KEY}`);
		const spy = vi.spyOn(history, "replaceState").mockImplementation(() => {});

		renderHook(() => useScanUrlImport());

		expect(spy).toHaveBeenCalledWith(null, "", "/signup");
	});

	it("normalises a bare-hex key in ?w=", () => {
		const bareKey =
			"ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
		setSearch(`?w=${bareKey}`);

		renderHook(() => useScanUrlImport());

		// normalizePrivateKey prepends 0x
		expect(mockStorePrivateKey).toHaveBeenCalledWith(`0x${bareKey}`);
	});
});
