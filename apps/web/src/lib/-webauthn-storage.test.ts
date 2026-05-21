import { beforeEach, describe, expect, it } from "vitest";
import {
	clearWebAuthnCredential,
	getWebAuthnCredential,
	hasWebAuthnCredential,
	markWebAuthnStale,
	storeWebAuthnCredential,
} from "./webauthn-storage";

const SAMPLE = {
	credentialId: "abc123",
	keyHash: ("0x" + "aa".repeat(32)) as `0x${string}`,
	publicKeyX: "12345678901234567890",
	publicKeyY: "98765432109876543210",
	address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
};

beforeEach(() => {
	localStorage.clear();
});

describe("storeWebAuthnCredential", () => {
	it("makes the credential retrievable", () => {
		storeWebAuthnCredential(SAMPLE);
		const stored = getWebAuthnCredential();
		expect(stored).not.toBeNull();
		expect(stored?.credentialId).toBe(SAMPLE.credentialId);
		expect(stored?.address).toBe(SAMPLE.address);
		expect(stored?.keyHash).toBe(SAMPLE.keyHash);
		expect(stored?.stale).toBe(false);
	});

	it("hasWebAuthnCredential returns true after storing", () => {
		storeWebAuthnCredential(SAMPLE);
		expect(hasWebAuthnCredential()).toBe(true);
	});
});

describe("getWebAuthnCredential", () => {
	it("returns null when nothing is stored", () => {
		expect(getWebAuthnCredential()).toBeNull();
	});
});

describe("hasWebAuthnCredential", () => {
	it("returns false when nothing is stored", () => {
		expect(hasWebAuthnCredential()).toBe(false);
	});
});

describe("markWebAuthnStale", () => {
	it("sets the stale flag without removing the credential", () => {
		storeWebAuthnCredential(SAMPLE);
		markWebAuthnStale();
		const stored = getWebAuthnCredential();
		expect(stored?.stale).toBe(true);
		expect(stored?.credentialId).toBe(SAMPLE.credentialId);
	});

	it("is a no-op when no credential is stored", () => {
		expect(() => markWebAuthnStale()).not.toThrow();
	});
});

describe("clearWebAuthnCredential", () => {
	it("removes the credential entirely", () => {
		storeWebAuthnCredential(SAMPLE);
		clearWebAuthnCredential();
		expect(getWebAuthnCredential()).toBeNull();
		expect(hasWebAuthnCredential()).toBe(false);
	});
});
