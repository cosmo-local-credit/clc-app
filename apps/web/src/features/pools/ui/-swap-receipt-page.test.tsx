import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { navigate, trackRelay, useOtxTracking } = vi.hoisted(() => ({
  navigate: vi.fn(),
  trackRelay: vi.fn(),
  useOtxTracking: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string;
    search?: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a href={`${to}?${new URLSearchParams(search ?? {}).toString()}`} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("#/features/auth/hooks/use-otx-tracking", () => ({ useOtxTracking }));

vi.mock("@clc/api/features/relayer/client", () => ({
  createRelayerClient: () => ({ trackRelay }),
}));

import { SwapReceiptPage } from "./swap-receipt-page";

const TX_HASH = "0x4d8ab3f71c9e052d8a7b1c6e9f0a2d3e4f5a6b7c";
const POOL_ADDRESS = "0x1111111111111111111111111111111111111111";

const TTX_ADDRESS = "0x2222222222222222222222222222222222222222";

const details = {
  trackingId: "swap-tracking-1",
  sendAmount: "1.00",
  sendSymbol: "USDC",
  receiveAmount: "2.00",
  receiveSymbol: "TTX",
  poolName: "Trade Pool",
};

const confirmed = {
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

  it("offers no way out while the swap is still settling", () => {
    // The screen replaces itself with the outcome the moment the chain answers.
    // A Done button meanwhile is a way to leave before ever seeing whether the
    // swap landed — and an easy one to hit by accident.
    useOtxTracking.mockReturnValue({ outcome: { kind: "pending" } });

    render(<SwapReceiptPage poolAddress={POOL_ADDRESS} details={details} />);

    expect(screen.queryByRole("button", { name: /done/i })).toBeNull();
  });

  it("offers Done once the swap reverted, which is an outcome", () => {
    useOtxTracking.mockReturnValue({
      outcome: { kind: "error", error: "execution reverted" },
    });

    render(<SwapReceiptPage poolAddress={POOL_ADDRESS} details={details} />);

    expect(screen.getByRole("button", { name: /done/i })).toBeTruthy();
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

  it("shows the received amount before the sent amount with matching labels", () => {
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

    const receiveRow = screen.getByText("You receive").parentElement;
    const sendRow = screen.getByText("You send").parentElement;
    expect(receiveRow?.nextElementSibling).toBe(sendRow);
    expect(screen.getByText("−1.00 USDC").parentElement?.className).toContain("text-destructive");
    expect(screen.getByText("+2.00 TTX").parentElement?.className).toContain("text-primary");
  });

  it("groups receipt displays while keeping the send prefill canonical", () => {
    useOtxTracking.mockReturnValue(confirmed);

    render(
      <SwapReceiptPage
        poolAddress={POOL_ADDRESS}
        details={{
          ...details,
          sendAmount: "1000.00",
          receiveAmount: "10000.00",
          receiveToken: TTX_ADDRESS,
        }}
      />,
    );

    expect(screen.getByText("+10,000.00 TTX")).toBeTruthy();
    expect(screen.getByText("−1,000.00 USDC")).toBeTruthy();
    const send = screen.getByRole("link", { name: /send ttx/i });
    const target = new URL(send.getAttribute("href") ?? "", "https://example.test");
    expect(target.searchParams.get("amount")).toBe("10000.00");
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

  it("offers to send what was swapped out, with the token and amount already chosen", () => {
    // Sending after a swap is the common next step, so the receipt hands the
    // send flow both halves and the user only picks a recipient.
    useOtxTracking.mockReturnValue(confirmed);

    render(
      <SwapReceiptPage
        poolAddress={POOL_ADDRESS}
        details={{ ...details, receiveToken: TTX_ADDRESS }}
      />,
    );

    const send = screen.getByRole("link", { name: /send ttx/i });
    const target = new URL(send.getAttribute("href") ?? "", "https://example.test");
    expect(target.pathname).toBe("/wallet/send");
    expect(target.searchParams.get("token")).toBe(TTX_ADDRESS);
    expect(target.searchParams.get("amount")).toBe("2.00");
  });

  it("withholds the send shortcut when the received token is unknown", () => {
    // A receipt deep-linked from an older URL carries a symbol but no address,
    // and a prefill missing that half would open the flow on another voucher.
    useOtxTracking.mockReturnValue(confirmed);

    render(<SwapReceiptPage poolAddress={POOL_ADDRESS} details={details} />);

    expect(screen.queryByRole("link", { name: /send ttx/i })).toBeNull();
  });
});
