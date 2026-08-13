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

  describe("the deployed relying party", () => {
    // Both Pages projects set VITE_RELYING_PARTY_ID to the registrable domain so a
    // single passkey works on the app and the console. These cases pin that: if the
    // shared value stops resolving the same way on both hosts, one of the two apps
    // silently gets its own relying party and its passkeys stop interoperating.
    const CONFIGURED = "cosmolocal.credit";

    it.each(["app.cosmolocal.credit", "admin.cosmolocal.credit"])(
      "resolves to the parent domain on %s",
      (hostname) => {
        expect(resolveRelyingPartyId(CONFIGURED, hostname)).toBe(CONFIGURED);
      },
    );

    it("resolves to the parent domain on the apex itself", () => {
      expect(resolveRelyingPartyId(CONFIGURED, CONFIGURED)).toBe(CONFIGURED);
    });

    it("does not leak the parent domain onto an unrelated preview host", () => {
      // A *.pages.dev preview is not beneath cosmolocal.credit, so it must use its
      // own hostname — claiming the parent there would be rejected by the browser.
      expect(resolveRelyingPartyId(CONFIGURED, "clc-admin.pages.dev")).toBe("clc-admin.pages.dev");
    });

    it("is not fooled by a host that merely ends with the same letters", () => {
      // "appcosmolocal.credit" is a different registrable domain; the suffix check
      // requires a dot boundary, so it must not be treated as beneath the parent.
      expect(resolveRelyingPartyId(CONFIGURED, "admin.appcosmolocal.credit")).toBe(
        "admin.appcosmolocal.credit",
      );
    });
  });
});
