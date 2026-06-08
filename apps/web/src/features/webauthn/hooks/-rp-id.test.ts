import { describe, expect, it } from "vite-plus/test";
import { resolveRelyingPartyId } from "./rp-id";

describe("resolveRelyingPartyId", () => {
  it("falls back to the hostname when the env value is blank", () => {
    expect(resolveRelyingPartyId("", "localhost")).toBe("localhost");
    expect(resolveRelyingPartyId("   ", "localhost")).toBe("localhost");
  });

  it("uses the trimmed env value when provided", () => {
    expect(resolveRelyingPartyId(" localhost ", "example.com")).toBe("localhost");
  });

  it("normalizes URL env values to hostnames", () => {
    expect(resolveRelyingPartyId("https://app.cosmolocal.credit", "example.com")).toBe(
      "app.cosmolocal.credit",
    );
  });

  it("falls back to localhost when neither env nor hostname is available", () => {
    expect(resolveRelyingPartyId(undefined, undefined)).toBe("localhost");
  });
});
