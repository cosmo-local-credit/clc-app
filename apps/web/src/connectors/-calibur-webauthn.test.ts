import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	markWebAuthnStale,
	storeWebAuthnCredential,
} from "#/lib/webauthn-storage";
import { caliburWebAuthnConnector } from "./calibur-webauthn";

vi.mock("#/features/webauthn/hooks/use-calibur-transaction", () => ({
	sendCaliburTransaction: vi
		.fn()
		.mockResolvedValue({ txHash: "0xdeadbeef", trackingId: "t1" }),
	bytesToBase64Url: vi.fn(),
}));

const TEST_CRED = {
	credentialId: "cred-abc",
	keyHash: `0x${"aa".repeat(32)}` as `0x${string}`,
	publicKeyX: "111",
	publicKeyY: "222",
	address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
};

const mockConfig = {
	chains: [{ id: 42220 }],
	transports: {},
	emitter: { emit: vi.fn() },
};

function buildImpl() {
	const factory = caliburWebAuthnConnector();
	return factory(mockConfig as Parameters<typeof factory>[0]);
}

beforeEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
});

describe("connect()", () => {
	it("throws when no credential is stored", async () => {
		const impl = buildImpl();
		await expect(impl.connect()).rejects.toThrow("No WebAuthn credential");
	});

	it("throws when credential is stale", async () => {
		storeWebAuthnCredential(TEST_CRED);
		markWebAuthnStale();
		const impl = buildImpl();
		await expect(impl.connect()).rejects.toThrow("stale");
	});

	it("returns accounts and chainId for a valid credential", async () => {
		storeWebAuthnCredential(TEST_CRED);
		const impl = buildImpl();
		const result = await impl.connect();
		expect(result.accounts).toEqual([TEST_CRED.address]);
		expect(result.chainId).toBe(42220);
	});
});

describe("getAccounts()", () => {
	it("returns empty array when no credential is stored", async () => {
		const impl = buildImpl();
		expect(await impl.getAccounts()).toEqual([]);
	});

	it("returns address when credential is stored", async () => {
		storeWebAuthnCredential(TEST_CRED);
		const impl = buildImpl();
		expect(await impl.getAccounts()).toEqual([TEST_CRED.address]);
	});
});

describe("isAuthorized()", () => {
	it("returns false when no credential is stored", async () => {
		const impl = buildImpl();
		expect(await impl.isAuthorized()).toBe(false);
	});

	it("returns false when credential is stale", async () => {
		storeWebAuthnCredential(TEST_CRED);
		markWebAuthnStale();
		const impl = buildImpl();
		expect(await impl.isAuthorized()).toBe(false);
	});

	it("returns true when credential is valid", async () => {
		storeWebAuthnCredential(TEST_CRED);
		const impl = buildImpl();
		expect(await impl.isAuthorized()).toBe(true);
	});
});

describe("disconnect()", () => {
	it("clears the stored credential", async () => {
		storeWebAuthnCredential(TEST_CRED);
		const impl = buildImpl();
		await impl.disconnect();
		expect(await impl.isAuthorized()).toBe(false);
		expect(await impl.getAccounts()).toEqual([]);
	});
});

describe("getProvider() — eth_accounts", () => {
	it("returns address when credential is stored", async () => {
		storeWebAuthnCredential(TEST_CRED);
		const impl = buildImpl();
		const provider = await impl.getProvider();
		const result = await provider.request({ method: "eth_accounts" });
		expect(result).toEqual([TEST_CRED.address]);
	});

	it("returns empty array when no credential", async () => {
		const impl = buildImpl();
		const provider = await impl.getProvider();
		const result = await provider.request({ method: "eth_accounts" });
		expect(result).toEqual([]);
	});
});

describe("getProvider() — eth_chainId", () => {
	it("returns hex chain id", async () => {
		const impl = buildImpl();
		const provider = await impl.getProvider();
		const result = await provider.request({ method: "eth_chainId" });
		expect(result).toBe("0xa4ec"); // 42220 in hex
	});
});

describe("getProvider() — eth_sendTransaction", () => {
	it("calls sendCaliburTransaction and returns txHash", async () => {
		storeWebAuthnCredential(TEST_CRED);
		const impl = buildImpl();
		const provider = await impl.getProvider();
		const result = await provider.request({
			method: "eth_sendTransaction",
			params: [{ to: "0x1234", value: "0x0", data: "0x" }],
		});
		expect(result).toBe("0xdeadbeef");
	});

	it("preserves the credential and rethrows on failure", async () => {
		const { sendCaliburTransaction } = await import(
			"#/features/webauthn/hooks/use-calibur-transaction"
		);
		vi.mocked(sendCaliburTransaction).mockRejectedValueOnce(
			new Error("WebAuthn cancelled"),
		);

		storeWebAuthnCredential(TEST_CRED);
		const impl = buildImpl();
		const provider = await impl.getProvider();

		await expect(
			provider.request({
				method: "eth_sendTransaction",
				params: [{ to: "0x1234" }],
			}),
		).rejects.toThrow("WebAuthn cancelled");

		expect(await impl.isAuthorized()).toBe(true);
	});
});

describe("getProvider() — unsupported methods", () => {
	it.each([
		"personal_sign",
		"eth_sign",
		"eth_signTypedData_v4",
	])("%s throws Method not supported", async (method) => {
		const impl = buildImpl();
		const provider = await impl.getProvider();
		await expect(provider.request({ method })).rejects.toThrow(
			"Method not supported",
		);
	});
});
