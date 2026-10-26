import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DESKTOP_MEDIA, layoutBootstrapScript, readLayout, useLayout } from "./layout";

describe("layout", () => {
  afterEach(() => {
    delete document.documentElement.dataset.layout;
    vi.unstubAllGlobals();
  });

  it("names the fine-pointer query in the pre-paint script", () => {
    expect(layoutBootstrapScript).toContain(DESKTOP_MEDIA);
    expect(layoutBootstrapScript).toContain("data-layout");
  });

  it("reads the attribute and stays mobile when it is absent", () => {
    expect(readLayout()).toBe("mobile");
    document.documentElement.dataset.layout = "desktop";
    expect(readLayout()).toBe("desktop");
  });

  it("stays mobile when matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useLayout());
    expect(result.current).toBe("mobile");
  });

  it("follows a fine pointer at desktop width", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === DESKTOP_MEDIA,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { result } = renderHook(() => useLayout());
    expect(result.current).toBe("desktop");
    expect(document.documentElement.dataset.layout).toBe("desktop");
  });
});
