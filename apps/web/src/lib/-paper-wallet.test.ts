import { describe, expect, it } from "vitest";
import { buildPaperWalletUrl, PAPER_WALLET_ORIGIN } from "./paper-wallet";

describe("buildPaperWalletUrl", () => {
	it("encodes the private key as the ?w= search param", () => {
		const key =
			"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
		const url = buildPaperWalletUrl(key);
		expect(url).toContain("?w=");
		expect(url).toContain(key);
	});

	it("uses PAPER_WALLET_ORIGIN as the base", () => {
		const key =
			"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
		const url = buildPaperWalletUrl(key);
		expect(url.startsWith(PAPER_WALLET_ORIGIN)).toBe(true);
	});

	it("produces a URL parseable by normalizePrivateKey via the URL path", () => {
		const key =
			"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
		const url = buildPaperWalletUrl(key);
		const parsed = new URL(url);
		expect(parsed.searchParams.get("w")).toBe(key);
	});

	it("PAPER_WALLET_ORIGIN has no trailing slash", () => {
		expect(PAPER_WALLET_ORIGIN.endsWith("/")).toBe(false);
	});
});
