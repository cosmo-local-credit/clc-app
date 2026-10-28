import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { navigate, trackRelay, useMarketVoucherDetail, useOtxTracking, usePoolSwapSettlement } =
  vi.hoisted(() => ({
    navigate: vi.fn(),
    trackRelay: vi.fn(),
    useMarketVoucherDetail: vi.fn(),
    useOtxTracking: vi.fn(),
    usePoolSwapSettlement: vi.fn(),
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
vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({ useMarketVoucherDetail }));
vi.mock("#/features/pools/hooks/use-pool-swap-settlement", () => ({ usePoolSwapSettlement }));
vi.mock("#/components/reviews/redemption-review-prompt", () => ({
  PoolSwapReviewPrompt: ({ address }: { address: string }) => (
    <div data-testid="pool-swap-review-prompt">{address}</div>
  ),
}));

vi.mock("@clc/api/features/relayer/client", () => ({
  createRelayerClient: () => ({ trackRelay }),
}));

import { SwapReceiptPage } from "./swap-receipt-page";

const TX_HASH = "0x4d8ab3f71c9e052d8a7b1c6e9f0a2d3e4f5a6b7c";
const POOL_ADDRESS = "0x1111111111111111111111111111111111111111";

const TTX_ADDRESS = "0x2222222222222222222222222222222222222222";
const USDC_ADDRESS = "0x4444444444444444444444444444444444444444";
const ISSUER_ADDRESS = "0x3333333333333333333333333333333333333333";

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

beforeEach(() => {
  useMarketVoucherDetail.mockReturnValue({
    data: { ownerAddress: ISSUER_ADDRESS, decimals: 6 },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  usePoolSwapSettlement.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: true,
    refetch: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  navigate.mockReset();
  trackRelay.mockReset();
  useMarketVoucherDetail.mockReset();
  useOtxTracking.mockReset();
  usePoolSwapSettlement.mockReset();
});

describe("SwapReceiptPage", () => {
  it("offers a Pool review only on a confirmed receipt", () => {
    useOtxTracking.mockReturnValue(confirmed);
    const view = render(<SwapReceiptPage poolAddress={POOL_ADDRESS} details={details} />);
    expect(screen.getByTestId("pool-swap-review-prompt").textContent).toBe(POOL_ADDRESS);
    view.unmount();

    useOtxTracking.mockReturnValue({ outcome: { kind: "pending" } });
    render(<SwapReceiptPage poolAddress={POOL_ADDRESS} details={details} />);
    expect(screen.queryByTestId("pool-swap-review-prompt")).toBeNull();
  });

  it("shares the swap summary with the pool name and explorer link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    useOtxTracking.mockReturnValue(confirmed);
    usePoolSwapSettlement.mockReturnValue({
      data: {
        source: "settlement",
        breakdown: {
          grossAmountOutRaw: "50000000",
          poolFeeRaw: "1000000",
          protocolFeeRaw: "100000",
          totalFeeRaw: "1100000",
        },
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <SwapReceiptPage
        poolAddress={POOL_ADDRESS}
        details={{ ...details, receiveToken: TTX_ADDRESS, receiveDecimals: 6 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /share receipt/i }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = share.mock.calls[0]?.[0] as { text: string };
    expect(payload.text).toContain("1.00 USDC");
    expect(payload.text).toContain("2.00 TTX");
    expect(payload.text).toContain("Trade Pool");
    expect(payload.text).toContain("Pool fee: 1.00 TTX (2.00%)");
    expect(payload.text).toContain("Protocol fee: 0.10 TTX (0.20%)");
    expect(payload.text).toContain("Total fees: 1.10 TTX (2.20%)");
    expect(payload.text).toContain(TX_HASH);
    Reflect.deleteProperty(navigator, "share");
  });

  it("shows and shares both submission-time voucher values", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    useOtxTracking.mockReturnValue(confirmed);

    render(
      <SwapReceiptPage
        poolAddress={POOL_ADDRESS}
        details={{
          ...details,
          sendUoaValue: "130",
          sendUoa: "KES",
          receiveUoaValue: "2.5",
          receiveUoa: "USD",
        }}
      />,
    );

    expect(screen.getByText("−1.00 USDC (130.00 KES)")).toBeTruthy();
    expect(screen.getByText("+2.00 TTX (2.50 USD)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /share receipt/i }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = share.mock.calls[0]?.[0] as { text: string };
    expect(payload.text).toContain("1.00 USDC (130.00 KES)");
    expect(payload.text).toContain("2.00 TTX (2.50 USD)");
    Reflect.deleteProperty(navigator, "share");
  });

  it("keeps both values on pending and reverted receipts", () => {
    const valuedDetails = {
      ...details,
      sendUoaValue: "130",
      sendUoa: "KES",
      receiveUoaValue: "2.5",
      receiveUoa: "USD",
    };
    useOtxTracking.mockReturnValue({ outcome: { kind: "pending" } });
    const { unmount } = render(
      <SwapReceiptPage poolAddress={POOL_ADDRESS} details={valuedDetails} />,
    );
    expect(screen.getByRole("heading", { name: /2\.00 ttx \(2\.50 usd\)/i })).toBeTruthy();
    unmount();

    useOtxTracking.mockReturnValue({ outcome: { kind: "error", error: "reverted" } });
    render(<SwapReceiptPage poolAddress={POOL_ADDRESS} details={valuedDetails} />);
    expect(screen.getByRole("heading", { name: /2\.00 ttx \(2\.50 usd\)/i })).toBeTruthy();
  });

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

  it("shows pool, protocol, and total fees with effective percentages", () => {
    useOtxTracking.mockReturnValue(confirmed);
    usePoolSwapSettlement.mockReturnValue({
      data: {
        source: "settlement",
        breakdown: {
          grossAmountOutRaw: "50000000",
          poolFeeRaw: "1000000",
          protocolFeeRaw: "100000",
          totalFeeRaw: "1100000",
        },
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <SwapReceiptPage
        poolAddress={POOL_ADDRESS}
        details={{ ...details, receiveToken: TTX_ADDRESS, receiveDecimals: 6 }}
      />,
    );

    expect(screen.getByText("Pool fee").parentElement?.textContent).toContain("1.00 TTX2.00%");
    expect(screen.getByText("Protocol fee").parentElement?.textContent).toContain("0.10 TTX0.20%");
    expect(screen.getByText("Total fees").parentElement?.textContent).toContain("1.10 TTX2.20%");
  });

  it("reads the settlement by pool and pair, not by the quoted amounts", () => {
    // The executed output can differ from the confirmed quote when the price
    // moves before the relay lands; matching on it would lose the fees for good.
    useOtxTracking.mockReturnValue(confirmed);

    render(
      <SwapReceiptPage
        poolAddress={POOL_ADDRESS}
        details={{ ...details, sendToken: USDC_ADDRESS, receiveToken: TTX_ADDRESS }}
      />,
    );

    expect(usePoolSwapSettlement).toHaveBeenCalledWith({
      txHash: TX_HASH,
      poolAddress: POOL_ADDRESS,
      tokenIn: USDC_ADDRESS,
      tokenOut: TTX_ADDRESS,
    });
  });

  it("does not present fee amounts when the link lacks the voucher's decimals", () => {
    useOtxTracking.mockReturnValue(confirmed);
    usePoolSwapSettlement.mockReturnValue({
      data: {
        source: "settlement",
        breakdown: {
          grossAmountOutRaw: "50000000",
          poolFeeRaw: "1000000",
          protocolFeeRaw: "100000",
          totalFeeRaw: "1100000",
        },
      },
      isFetching: false,
      isError: false,
      canLoad: true,
      refetch: vi.fn(),
    });

    render(
      <SwapReceiptPage
        poolAddress={POOL_ADDRESS}
        details={{ ...details, receiveToken: TTX_ADDRESS }}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("Fee details unavailable");
    expect(screen.getByText("Pool fee").parentElement?.textContent).toContain("—");
    // Reading the event again cannot supply decimals the link never carried.
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("retries a failed settlement read", () => {
    const refetch = vi.fn();
    useOtxTracking.mockReturnValue(confirmed);
    usePoolSwapSettlement.mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: true,
      canLoad: true,
      refetch,
    });

    render(
      <SwapReceiptPage
        poolAddress={POOL_ADDRESS}
        details={{ ...details, receiveToken: TTX_ADDRESS, receiveDecimals: 6 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
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

  it("does not present unknown legacy receipt fees as zero", () => {
    useOtxTracking.mockReturnValue(confirmed);

    render(<SwapReceiptPage poolAddress={POOL_ADDRESS} details={details} />);

    expect(screen.getByText("Pool fee").parentElement?.textContent).toContain("—");
    expect(screen.getByText("Protocol fee").parentElement?.textContent).toContain("—");
    expect(screen.getByText("Total fees").parentElement?.textContent).toContain("—");
    expect(screen.getByRole("alert").textContent).toContain("Fee details unavailable");
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

  it("offers to redeem the exact received amount to the current issuer above Send", () => {
    useOtxTracking.mockReturnValue(confirmed);

    render(
      <SwapReceiptPage
        poolAddress={POOL_ADDRESS}
        details={{ ...details, receiveToken: TTX_ADDRESS }}
      />,
    );

    expect(useMarketVoucherDetail).toHaveBeenCalledWith(TTX_ADDRESS);
    const redeem = screen.getByRole("link", { name: /^redeem$/i });
    const send = screen.getByRole("link", { name: /send ttx/i });
    expect(redeem.nextElementSibling).toBe(send);

    const target = new URL(redeem.getAttribute("href") ?? "", "https://example.test");
    expect(target.pathname).toBe("/wallet/send/amount");
    expect(target.searchParams.get("token")).toBe(TTX_ADDRESS);
    expect(target.searchParams.get("recipient")).toBe(ISSUER_ADDRESS);
    expect(target.searchParams.get("amount")).toBe("2.00");
  });

  it("keeps Redeem disabled when the current issuer is not available", () => {
    useOtxTracking.mockReturnValue(confirmed);
    useMarketVoucherDetail.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    });

    render(
      <SwapReceiptPage
        poolAddress={POOL_ADDRESS}
        details={{ ...details, receiveToken: TTX_ADDRESS }}
      />,
    );

    expect(screen.getByRole("button", { name: /^redeem$/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("link", { name: /send ttx/i })).toBeTruthy();
  });

  it("does not resolve an issuer or offer actions for a malformed received token", () => {
    useOtxTracking.mockReturnValue(confirmed);

    render(
      <SwapReceiptPage
        poolAddress={POOL_ADDRESS}
        details={{ ...details, receiveToken: "not-an-address" }}
      />,
    );

    expect(useMarketVoucherDetail).toHaveBeenCalledWith(undefined);
    expect(screen.queryByRole("button", { name: /^redeem$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /send ttx/i })).toBeNull();
  });

  it("withholds the send shortcut when the received token is unknown", () => {
    // A receipt deep-linked from an older URL carries a symbol but no address,
    // and a prefill missing that half would open the flow on another voucher.
    useOtxTracking.mockReturnValue(confirmed);

    render(<SwapReceiptPage poolAddress={POOL_ADDRESS} details={details} />);

    expect(screen.queryByRole("link", { name: /send ttx/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^redeem$/i })).toBeNull();
  });
});
