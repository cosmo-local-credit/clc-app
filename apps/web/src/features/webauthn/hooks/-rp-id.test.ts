import { describe, expect, it } from "vitest";
import { resolveRelyingPartyId } from "./rp-id";

describe("resolveRelyingPartyId", () => {
	it("falls back to the hostname when the env value is blank", () => {
		expect(resolveRelyingPartyId("", "localhost")).toBe("localhost");
		expect(resolveRelyingPartyId("   ", "localhost")).toBe("localhost");
	});

	it("uses the trimmed env value when provided", () => {
		expect(resolveRelyingPartyId(" localhost ", "example.com")).toBe(
			"localhost",
		);
	});

	it("falls back to localhost when neither env nor hostname is available", () => {
		expect(resolveRelyingPartyId(undefined, undefined)).toBe("localhost");
	});
});