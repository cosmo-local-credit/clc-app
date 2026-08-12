import { describe, expect, it } from "vite-plus/test";
import { resolveRelyingPartyId } from "./rp-id";

describe("resolveRelyingPartyId", () => {
  it("falls back to the hostname when the env value is blank", () => {
    expect(resolveRelyingPartyId("", "localhost")).toBe("localhost");
    expect(resolveRelyingPartyId("   ", "localhost")).toBe("localhost");
  });

  it("uses the trimmed env value when it matches the current hostname", () => {
    expect(resolveRelyingPartyId(" app.cosmolocal.credit ", "app.cosmolocal.credit")).toBe(
      "app.cosmolocal.credit",
    );
  });

  it("normalizes URL env values to hostnames", () => {
    expect(resolveRelyingPartyId("https://app.cosmolocal.credit", "app.cosmolocal.credit")).toBe(
      "app.cosmolocal.credit",
    );
  });

  it("keeps a configured suffix when the current hostname is beneath it", () => {
    expect(
      resolveRelyingPartyId("https://clc-app.pages.dev", "backend-integration.clc-app.pages.dev"),
    ).toBe("clc-app.pages.dev");
  });

  it("falls back to the current hostname when the configured rp id is incompatible", () => {
    expect(
      resolveRelyingPartyId(
        "https://app.cosmolocal.credit",
        "backend-integration.clc-app.pages.dev",
      ),
    ).toBe("backend-integration.clc-app.pages.dev");
  });

  it("falls back to the production hostname when the configured preview rp id is incompatible", () => {
    expect(resolveRelyingPartyId("https://clc-app.pages.dev", "app.cosmolocal.credit")).toBe(
      "app.cosmolocal.credit",
    );
  });

  it("falls back to localhost when neither env nor hostname is available", () => {
    expect(resolveRelyingPartyId(undefined, undefined)).toBe("localhost");
  });
});
