import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("#/lib/chain", () => ({
  CHAIN_INFO: {
    name: "Gnosis",
    nativeSymbol: "xDAI",
    blockTimeMs: 5_000,
    explorerUrl: "https://gnosisscan.io",
    explorerName: "Gnosisscan",
  },
}));

import { NetworkBadge, PendingClock } from "./wallet-status";

describe("PendingClock", () => {
  it("paces a clockwise countdown ring to two Gnosis block times", () => {
    const { container } = render(<PendingClock />);
    const clock = container.querySelector<HTMLElement>('[data-slot="pending-clock"]');
    const indicator = container.querySelector<HTMLElement>('[data-slot="pending-clock-indicator"]');

    expect(clock?.style.getPropertyValue("--pending-clock-duration")).toBe("10000ms");
    expect(clock?.getAttribute("data-slot")).toBe("pending-clock");
    expect(indicator?.getAttribute("data-slot")).toBe("pending-clock-indicator");
    expect(indicator?.classList.contains("pending-clock-indicator")).toBe(true);
    expect(indicator?.classList.contains("rounded-full")).toBe(true);
  });

  it("fills the ring with a clock so the pending badge is never empty", () => {
    const { container } = render(<PendingClock />);
    const icon = container.querySelector<SVGElement>('[data-slot="pending-clock-icon"]');

    expect(icon?.tagName.toLowerCase()).toBe("svg");
    expect(icon?.classList.contains("text-warning-foreground")).toBe(true);
    // Only the icon draws an SVG: the ring itself is CSS, not a stroked circle.
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });
});

describe("NetworkBadge", () => {
  it("uses the configured Gnosis name instead of a Celo fallback", () => {
    render(<NetworkBadge />);

    expect(screen.getByText("Gnosis network")).toBeTruthy();
    expect(screen.queryByText("Celo network")).toBeNull();
  });
});
