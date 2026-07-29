import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { navigate, trackRelay, useOtxTracking } = vi.hoisted(() => ({
  navigate: vi.fn(),
  trackRelay: vi.fn(),
  useOtxTracking: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("#/features/auth/hooks/use-otx-tracking", () => ({ useOtxTracking }));

vi.mock("#/features/webauthn/api/relayer-client", () => ({
  createRelayerClient: () => ({ trackRelay }),
}));

import { SwapReceiptPage } from "./swap-receipt-page";

const TX_HASH = "0x4d8ab3f71c9e052d8a7b1c6e9f0a2d3e4f5a6b7c";
const POOL_ADDRESS = "0x1111111111111111111111111111111111111111";

const details = {
  trackingId: "swap-tracking-1",
  sendAmount: "1.00",
  sendSymbol: "USDC",
  receiveAmount: "2.00",
  receiveSymbol: "TTX",
  poolName: "Trade Pool",
};

afterEach(() => {
  vi.restoreAllMocks();
  navigate.mockReset();
  trackRelay.mockReset();
  useOtxTracking.mockReset();
});

describe("SwapReceiptPage", () => {
  it("shows a swapping state while polling the relayer transaction", async () => {
    useOtxTracking.mockReturnValue({ outcome: { kind: "pending" } });
    trackRelay.mockResolvedValue({ result: { otx: [] } });

    render(<SwapReceiptPage poolAddress={POOL_ADDRESS} details={details} />);

    expect(screen.getByRole("heading", { name: /swapping 2\.00 ttx/i })).toBeTruthy();
    expect(screen.getByText(/waiting for on-chain confirmation/i)).toBeTruthy();
    expect(useOtxTracking).toHaveBeenCalledWith(
      "swap-tracking-1",
      expect.objectContaining({
        queryKey: "pool-swap-relay-track",
        queryFn: expect.any(Function),
      }),
    );

    const options = useOtxTracking.mock.calls[0]?.[1] as {
      queryFn: (trackingId: string) => Promise<unknown>;
    };
    await expect(options.queryFn("swap-tracking-1")).resolves.toEqual({ otx: [] });
    expect(trackRelay).toHaveBeenCalledWith("swap-tracking-1");
  });

  it("reacts to confirmation with a Swapped receipt and copyable transaction hash", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "swap-tracking-1",
          otxType: "RELAY_EXEC",
          txHash: TX_HASH,
          nonce: 1,
          replaced: false,
          createdAt: "2026-07-02T10:00:00Z",
          status: "SUCCESS",
        },
      },
    });

    render(<SwapReceiptPage poolAddress={POOL_ADDRESS} details={details} />);

    expect(screen.getByRole("heading", { name: /^swapped$/i })).toBeTruthy();
    expect(screen.getByText("Trade Pool")).toBeTruthy();
    expect(screen.getByText(/submitted/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /copy transaction hash/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TX_HASH));
  });

  it("spells out the chain result as a debited From and a credited To", () => {
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "swap-tracking-1",
          otxType: "RELAY_EXEC",
          txHash: TX_HASH,
          nonce: 1,
          replaced: false,
          createdAt: "2026-07-02T10:00:00Z",
          status: "SUCCESS",
        },
      },
    });

    render(<SwapReceiptPage poolAddress={POOL_ADDRESS} details={details} />);

    expect(screen.getByText("−1.00 USDC").parentElement?.className).toContain("text-destructive");
    expect(screen.getByText("+2.00 TTX").parentElement?.className).toContain("text-primary");
  });

  it("shows the backend on-chain failure instead of a successful receipt", () => {
    useOtxTracking.mockReturnValue({
      outcome: { kind: "error", error: "Transaction failed on-chain (REVERTED)." },
    });

    render(<SwapReceiptPage poolAddress={POOL_ADDRESS} details={details} />);

    expect(screen.getByRole("heading", { name: /swap reverted 2\.00 ttx/i })).toBeTruthy();
    expect(screen.getByText(/failed on-chain/i)).toBeTruthy();
  });

  it("Done replaces the receipt with its originating pool", () => {
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "swap-tracking-1",
          otxType: "RELAY_EXEC",
          txHash: TX_HASH,
          nonce: 1,
          replaced: false,
          createdAt: "2026-07-02T10:00:00Z",
          status: "SUCCESS",
        },
      },
    });

    render(<SwapReceiptPage poolAddress={POOL_ADDRESS} details={details} />);
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/pools/$poolAddress",
      params: { poolAddress: POOL_ADDRESS },
      replace: true,
    });
  });
});
