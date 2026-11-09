import { act, render, renderHook, screen } from "@testing-library/react";
import { memo } from "react";
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

  it("re-renders every caller when the viewport crosses the breakpoint", () => {
    let matches = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
        return query === DESKTOP_MEDIA && matches;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }));
    // The leaf subscribes first (effects run child-first), so its listener is
    // the one that finds the attribute stale. The root must still hear about it.
    const Leaf = memo(function Leaf() {
      return <p data-testid="leaf">{useLayout()}</p>;
    });
    function Root() {
      return (
        <div>
          <p data-testid="root">{useLayout()}</p>
          <Leaf />
        </div>
      );
    }
    render(<Root />);
    expect(screen.getByTestId("root").textContent).toBe("desktop");

    matches = false;
    act(() => {
      for (const listener of listeners) listener();
    });
    expect(screen.getByTestId("leaf").textContent).toBe("mobile");
    expect(screen.getByTestId("root").textContent).toBe("mobile");
    expect(document.documentElement.dataset.layout).toBe("mobile");
  });
});
