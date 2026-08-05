import { describe, expect, it } from "vite-plus/test";

import { sanitizeInternalRedirect } from "./redirect";

describe("sanitizeInternalRedirect", () => {
  it("accepts internal app paths", () => {
    expect(sanitizeInternalRedirect("/wallet/send")).toBe("/wallet/send");
    expect(sanitizeInternalRedirect("/?tab=wallet")).toBe("/?tab=wallet");
  });

  it("rejects onboarding destinations so sign-in cannot self-loop", () => {
    expect(sanitizeInternalRedirect("/onboarding")).toBeUndefined();
    expect(sanitizeInternalRedirect("/onboarding?step=signin")).toBeUndefined();
    expect(sanitizeInternalRedirect("/onboarding?step=profile&redirect=%2F")).toBeUndefined();
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(sanitizeInternalRedirect("https://evil.example/")).toBeUndefined();
    expect(sanitizeInternalRedirect("//evil.example/")).toBeUndefined();
  });
});
