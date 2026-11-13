import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const WALLET = "0xA1a1A1a1A1A1A1a1A1a1a1a1a1a1A1A1A1a1A1a1";
const POOL_1 = "0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1";
const POOL_2 = "0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";
const A = "0xc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1";
const B = "0xc2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2";
const C = "0xc3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3";
const TX = `0x${"ab".repeat(32)}`;
const TRACKING = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

const mocks = vi.hoisted(() => ({
  routedSwap: vi.fn(),
  trackRelay: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, isLoading: false, address: WALLET }),
}));
vi.mock("#/lib/api/credit-router", () => ({
  creditRouterClient: { routedSwap: mocks.routedSwap },
}));
vi.mock("@clc/api/features/relayer/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@clc/api/features/relayer/client")>()),
  createRelayerClient: () => ({ trackRelay: mocks.trackRelay }),
}));
vi.mock("#/lib/api/market", () => ({
  marketClient: {
    getMarketVoucher: async (address: string) => ({
      address,
      symbol: { [A]: "AAA", [B]: "BBB", [C]: "CCC" }[address.toLowerCase()] ?? "???",
      decimals: 6,
    }),
  },
}));
vi.mock("#/lib/api/pools", () => ({
  poolsClient: {
    getPoolByAddress: async (address: string) => ({
      address,
      name: address.toLowerCase() === POOL_1 ? "Kilifi Pool" : "Mombasa Pool",
    }),
  },
}));

import { RoutedSwapReceiptPage } from "./routed-swap-receipt-page";

function hop(index: number, settled: boolean) {
  const [pool, tokenIn, tokenOut, amountIn, out] =
    index === 0 ? [POOL_1, A, B, "5002000", "5001400"] : [POOL_2, B, C, "5001000", "5000300"];
  return {
    index,
    pool,
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut: index === 0 ? "5001000" : "5000000",
    recipient: WALLET,
    txHash: settled ? TX : null,
    block: settled ? 49254470 : null,
    logIndex: settled ? index : null,
    settledAmountIn: settled ? amountIn : null,
    quotedAmountOut: settled ? out : null,
    nominalAmountOut: settled ? out : null,
    amountOut: settled ? out : null,
    poolFee: settled ? "0" : null,
    protocolFee: settled ? "1000" : null,
    settledAt: settled ? "2026-11-13T10:00:05Z" : null,
  };
}

function receipt(settled: boolean) {
  return {
    swap: {
      trackingId: TRACKING,
      chainId: 100,
      wallet: WALLET,
      recipient: WALLET,
      tokenIn: A,
      tokenOut: C,
      amountIn: "5002000",
      minAmountOut: "5000000",
      hopCount: 2,
      bounded: true,
      deadline: 1794567890,
      createdAt: "2026-11-13T10:00:00Z",
      txHash: settled ? TX : null,
      status: settled ? "SUCCESS" : null,
      hops: [hop(0, settled), hop(1, settled)],
    },
    settled,
    bridgeRemainder: settled ? [{ voucher: B, amount: "400" }] : [],
  };
}

function renderReceipt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RoutedSwapReceiptPage trackingId={TRACKING} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.routedSwap.mockReset();
  mocks.trackRelay.mockReset();
});

describe("RoutedSwapReceiptPage", () => {
  it("shows a settled two-hop exchange as one receipt with each hop's fees", async () => {
    mocks.routedSwap.mockResolvedValue(receipt(true));
    mocks.trackRelay.mockResolvedValue({
      ok: true,
      result: { otx: [{ trackingId: TRACKING, txHash: TX, status: "SUCCESS", replaced: false }] },
    });
    renderReceipt();

    expect(await screen.findByRole("heading", { name: "Exchanged" })).toBeTruthy();
    await waitFor(() => expect(document.body.textContent).toContain("You spent5.00 AAA"));
    expect(mocks.routedSwap).toHaveBeenCalledWith(TRACKING, expect.anything());
    const text = document.body.textContent ?? "";
    expect(text).toContain("You received5.00 CCC");
    expect(text).toContain("Minimum received5.00 CCC");
    expect(text).toContain("Left in your wallet0.00 BBB");
    await waitFor(() => expect(document.body.textContent).toContain("Hop 1 · Kilifi Pool"));
    expect(document.body.textContent).toContain("Hop 2 · Mombasa Pool");
    expect(screen.getAllByText("0.00 BBB").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("keeps a relayed exchange pending until its hops settle, without a Done to leave by", async () => {
    mocks.routedSwap.mockResolvedValue(receipt(false));
    mocks.trackRelay.mockResolvedValue({ ok: true, result: { otx: [] } });
    renderReceipt();
    expect(await screen.findByRole("heading", { name: "Exchanging" })).toBeTruthy();
    expect((await screen.findAllByText("Settling…")).length).toBe(2);
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });
});
