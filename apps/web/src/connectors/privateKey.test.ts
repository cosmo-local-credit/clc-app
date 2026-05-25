import { beforeEach, describe, expect, it } from "vitest";
import {
	clearPrivateKey,
	getStoredAddress,
	getStoredKey,
	hasStoredPrivateKey,
	storePrivateKey,
} from "./privateKey";

const TEST_KEY =
	"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const EXPECTED_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

beforeEach(() => {
	localStorage.clear();
});

describe("storePrivateKey", () => {
	it("stores the key and derives the correct address", () => {
		storePrivateKey(TEST_KEY);

		expect(getStoredKey()).toBe(TEST_KEY);
		expect(getStoredAddress()?.toLowerCase()).toBe(
			EXPECTED_ADDRESS.toLowerCase(),
		);
		expect(hasStoredPrivateKey()).toBe(true);
	});
});

describe("empty store", () => {
	it("getStoredKey returns null", () => {
		expect(getStoredKey()).toBeNull();
	});

	it("getStoredAddress returns null", () => {
		expect(getStoredAddress()).toBeNull();
	});

	it("hasStoredPrivateKey returns false", () => {
		expect(hasStoredPrivateKey()).toBe(false);
	});
});

describe("clearPrivateKey", () => {
	it("removes all stored data", () => {
		storePrivateKey(TEST_KEY);
		expect(hasStoredPrivateKey()).toBe(true);

		clearPrivateKey();

		expect(getStoredKey()).toBeNull();
		expect(getStoredAddress()).toBeNull();
		expect(hasStoredPrivateKey()).toBe(false);
	});
});
