import { describe, expect, it } from "vite-plus/test";
import { normalizeNotificationTargetUrl } from "./target-url";

const APP_ORIGIN = "https://app.cosmolocal.credit";

describe("normalizeNotificationTargetUrl", () => {
  it("accepts root-relative app URLs", () => {
    expect(normalizeNotificationTargetUrl("/wallet", APP_ORIGIN)).toBe("/wallet");
    expect(normalizeNotificationTargetUrl("/wallet?tab=vouchers#latest", APP_ORIGIN)).toBe(
      "/wallet?tab=vouchers#latest",
    );
  });

  it("normalizes path-relative app URLs", () => {
    expect(normalizeNotificationTargetUrl("wallet", APP_ORIGIN)).toBe("/wallet");
  });

  it("normalizes same-origin absolute URLs to app-relative URLs", () => {
    expect(
      normalizeNotificationTargetUrl(
        "https://app.cosmolocal.credit/wallet?tab=activity",
        APP_ORIGIN,
      ),
    ).toBe("/wallet?tab=activity");
  });

  it("rejects external URLs", () => {
    expect(normalizeNotificationTargetUrl("https://evil.example/wallet", APP_ORIGIN)).toBeNull();
    expect(normalizeNotificationTargetUrl("//evil.example/wallet", APP_ORIGIN)).toBeNull();
  });

  it("rejects protocol-smuggling and non-web URLs", () => {
    expect(normalizeNotificationTargetUrl("javascript:alert(1)", APP_ORIGIN)).toBeNull();
    expect(normalizeNotificationTargetUrl("data:text/html,hello", APP_ORIGIN)).toBeNull();
    expect(
      normalizeNotificationTargetUrl(
        "https://app.cosmolocal.credit\\@evil.example/wallet",
        APP_ORIGIN,
      ),
    ).toBeNull();
  });

  it("rejects malformed or blank target URLs", () => {
    expect(normalizeNotificationTargetUrl("", APP_ORIGIN)).toBeNull();
    expect(normalizeNotificationTargetUrl("   ", APP_ORIGIN)).toBeNull();
    expect(normalizeNotificationTargetUrl("\u0000/wallet", APP_ORIGIN)).toBeNull();
  });

  it("rejects targets when no app origin is available", () => {
    expect(normalizeNotificationTargetUrl("/wallet", null)).toBeNull();
  });
});
