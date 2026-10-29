import { act, render, screen } from "@testing-library/react";
import { lazy, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const layout = vi.hoisted(() => ({ value: "desktop" as "desktop" | "mobile" }));

vi.mock("#/desktop/layout", () => ({ useLayout: () => layout.value }));

const { LayoutSwitch } = await import("./switch");

beforeEach(() => {
  layout.value = "desktop";
});

describe("LayoutSwitch", () => {
  it("shows a busy page-shaped placeholder, not a blank canvas, while the desktop view loads", async () => {
    let load!: (module: { default: () => ReactNode }) => void;
    const Desk = lazy(
      () =>
        new Promise<{ default: () => ReactNode }>((resolve) => {
          load = resolve;
        }),
    );
    const { container } = render(<LayoutSwitch mobile={<p>phone</p>} desktop={<Desk />} />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    // It must not suggest that data has arrived: no rows, cells or list items.
    expect(screen.queryAllByRole("row")).toHaveLength(0);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(container.textContent).not.toContain("phone");

    await act(async () => {
      load({ default: () => <h1>Wallet</h1> });
    });
    expect(screen.getByRole("heading", { name: "Wallet" })).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders the phone view without the placeholder", () => {
    layout.value = "mobile";
    const { container } = render(<LayoutSwitch mobile={<p>phone</p>} desktop={<p>desk</p>} />);
    expect(screen.getByText("phone")).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
