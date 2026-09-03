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
  it("paces its subtle counterclockwise indicator to the Gnosis block time", () => {
    const { container } = render(<PendingClock />);
    const clock = container.querySelector<HTMLElement>('[data-slot="pending-clock"]');
    const indicator = container.querySelector<SVGCircleElement>(
      '[data-slot="pending-clock-indicator"]',
    );

    expect(clock?.style.getPropertyValue("--pending-clock-duration")).toBe("5000ms");
    expect(indicator?.classList.contains("pending-clock-indicator")).toBe(true);
    expect(indicator?.getAttribute("stroke-dasharray")).toBe("12 88");
  });
});

describe("NetworkBadge", () => {
  it("uses the configured Gnosis name instead of a Celo fallback", () => {
    render(<NetworkBadge />);

    expect(screen.getByText("Gnosis network")).toBeTruthy();
    expect(screen.queryByText("Celo network")).toBeNull();
  });
});
