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
    expect(clock?.querySelector("svg")).toBeNull();
    expect(indicator?.getAttribute("data-slot")).toBe("pending-clock-indicator");
    expect(indicator?.classList.contains("pending-clock-indicator")).toBe(true);
    expect(indicator?.classList.contains("rounded-full")).toBe(true);
  });
});

describe("NetworkBadge", () => {
  it("uses the configured Gnosis name instead of a Celo fallback", () => {
    render(<NetworkBadge />);

    expect(screen.getByText("Gnosis network")).toBeTruthy();
    expect(screen.queryByText("Celo network")).toBeNull();
  });
});
