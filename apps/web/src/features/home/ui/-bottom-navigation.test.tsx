import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("#/components/ui/clc-logo", () => ({
  CLCLogo: () => <svg data-testid="clc-logo" />,
}));

import { BottomNavigation } from "./bottom-navigation";
import type { HomeTab } from "./tabs";

const LABELS: Record<HomeTab, string> = {
  wallet: "Wallet",
  activity: "Activity",
  market: "Market",
  pool: "Pool",
  settings: "Settings",
};

describe("BottomNavigation", () => {
  it("renders all five navigation buttons", () => {
    render(<BottomNavigation activeTab="wallet" onTabChange={vi.fn()} />);
    for (const label of Object.values(LABELS)) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("marks the active tab with aria-current='page'", () => {
    render(<BottomNavigation activeTab="market" onTabChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Market" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("only marks the active tab; all others have no aria-current", () => {
    render(<BottomNavigation activeTab="pool" onTabChange={vi.fn()} />);
    for (const [tab, label] of Object.entries(LABELS) as [HomeTab, string][]) {
      const button = screen.getByRole("button", { name: label });
      if (tab === "pool") {
        expect(button.getAttribute("aria-current")).toBe("page");
      } else {
        expect(button.getAttribute("aria-current")).toBeNull();
      }
    }
  });

  it("calls onTabChange with the clicked tab", () => {
    const onTabChange = vi.fn();
    render(<BottomNavigation activeTab="wallet" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(onTabChange).toHaveBeenCalledWith("activity");

    fireEvent.click(screen.getByRole("button", { name: "Market" }));
    expect(onTabChange).toHaveBeenCalledWith("market");

    fireEvent.click(screen.getByRole("button", { name: "Pool" }));
    expect(onTabChange).toHaveBeenCalledWith("pool");

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onTabChange).toHaveBeenCalledWith("settings");
  });
});
