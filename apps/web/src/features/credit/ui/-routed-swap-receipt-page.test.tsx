import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const WALLET = "0xA1a1A1a1A1A1A1a1A1a1a1a1a1a1A1A1A1a1A1a1";
const POOL_1 = "0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1";
const POOL_2 = "0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";
const POOL_3 = "0xb3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3";
const A = "0xc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1";
const B = "0xc2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2";
const C = "0xc3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3";
const D = "0xc4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4";
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
      symbol: { [A]: "AAA", [B]: "BBB", [C]: "CCC", [D]: "DDD" }[address.toLowerCase()] ?? "???",
      decimals: 6,
    }),
  },
}));
vi.mock("#/lib/api/pools", () => ({
  poolsClient: {
    getPoolByAddress: async (address: string) => ({
      address,
      name:
        { [POOL_1]: "Kilifi Pool", [POOL_2]: "Mombasa Pool", [POOL_3]: "Malindi Pool" }[
          address.toLowerCase()
        ] ?? "???",
    }),
  },
}));

import { RoutedSwapReceiptPage } from "./routed-swap-receipt-page";

const LEGS = [
  [POOL_1, A, B, "5002000", "5001400", "5001000"],
  [POOL_2, B, C, "5001000", "5000300", "5000000"],
  [POOL_3, C, D, "5000000", "4999500", "4999000"],
] as const;

function hop(index: number, settled: boolean) {
  const [pool, tokenIn, tokenOut, amountIn, out, minAmountOut] = LEGS[index]!;
  return {
    index,
    pool,
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut,
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

/** The receipt's collapsed Details: checked closed, then opened. */
function openDetails(): HTMLDetailsElement {
  const details = screen.getByText("Details", { selector: "summary" })
    .parentElement as HTMLDetailsElement;
  expect(details.open).toBe(false);
  fireEvent.click(details.querySelector("summary")!);
  expect(details.open).toBe(true);
  return details;
}

describe("RoutedSwapReceiptPage", () => {
  it("leads a settled exchange with its state and amounts, and folds the swaps into Details", async () => {
    mocks.routedSwap.mockResolvedValue(receipt(true));
    mocks.trackRelay.mockResolvedValue({
      ok: true,
      result: { otx: [{ trackingId: TRACKING, txHash: TX, status: "SUCCESS", replaced: false }] },
    });
    renderReceipt();

    expect(await screen.findByRole("heading", { name: "Exchanged" })).toBeTruthy();
    await waitFor(() => expect(document.body.textContent).toContain("You spent5.00 AAA"));
    expect(mocks.routedSwap).toHaveBeenCalledWith(TRACKING, expect.anything());
    expect(document.body.textContent).toContain("You received5.00 CCC");
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();

    const details = openDetails();
    await waitFor(() => expect(details.textContent).toContain("Swap 1: AAA → BBB · Kilifi Pool"));
    const text = details.textContent ?? "";
    expect(text).toContain("Swap 2: BBB → CCC · Mombasa Pool");
    expect(text).toContain("Protocol fee<0.01 BBB");
    expect(text).toContain("Minimum received5.00 CCC");
    expect(text).toContain("Left in your wallet0.00 BBB");
    expect(text).toContain("Block number49254470");
    expect(within(details).getByRole("button", { name: "Copy transaction hash" })).toBeTruthy();
    expect(within(details).getByRole("button", { name: "Copy tracking ID" })).toBeTruthy();
    // The headline carries the state; nothing technical sits outside Details.
    const outside = document.body.textContent!.replace(text, "");
    expect(outside).not.toContain("Swap 1");
    expect(outside).not.toContain("Left in your wallet");
  });

  it("shows every swap of a three-swap exchange, in order, as each settles", async () => {
    const two = receipt(false);
    mocks.routedSwap.mockResolvedValue({
      ...two,
      swap: {
        ...two.swap,
        tokenOut: D,
        minAmountOut: "4999000",
        hopCount: 3,
        hops: [hop(0, true), hop(1, true), hop(2, false)],
      },
    });
    mocks.trackRelay.mockResolvedValue({ ok: true, result: { otx: [] } });
    renderReceipt();

    expect(await screen.findByRole("heading", { name: "Exchanging…" })).toBeTruthy();
    // The last swap has not settled: what is received is the quoted amount.
    await waitFor(() => expect(document.body.textContent).toContain("You received4.99 DDD"));
    const details = openDetails();
    await waitFor(() => expect(details.textContent).toContain("Swap 3: CCC → DDD · Malindi Pool"));
    const text = details.textContent ?? "";
    expect(text.indexOf("Swap 1: AAA → BBB · Kilifi Pool")).toBeLessThan(
      text.indexOf("Swap 2: BBB → CCC · Mombasa Pool"),
    );
    expect(text.indexOf("Swap 2: BBB → CCC · Mombasa Pool")).toBeLessThan(
      text.indexOf("Swap 3: CCC → DDD · Malindi Pool"),
    );
    // Swaps one and two have settled; the third is still on its way.
    expect(within(details).getAllByText("Settling…")).toHaveLength(1);
  });

  it("keeps a relayed exchange pending until its swaps settle, without a Done to leave by", async () => {
    mocks.routedSwap.mockResolvedValue(receipt(false));
    mocks.trackRelay.mockResolvedValue({ ok: true, result: { otx: [] } });
    renderReceipt();
    expect(await screen.findByRole("heading", { name: "Exchanging…" })).toBeTruthy();
    await waitFor(() => expect(document.body.textContent).toContain("You spent5.00 AAA"));
    expect(document.body.textContent).toContain("You received5.00 CCC");
    expect(within(openDetails()).getAllByText("Settling…")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it("says an exchange failed when its transaction reverted", async () => {
    const failed = receipt(false);
    mocks.routedSwap.mockResolvedValue({
      ...failed,
      swap: { ...failed.swap, txHash: TX, status: "REVERTED" },
    });
    mocks.trackRelay.mockResolvedValue({ ok: true, result: { otx: [] } });
    renderReceipt();
    expect(await screen.findByRole("heading", { name: "Exchange failed" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(within(openDetails()).getByText("Reverted")).toBeTruthy();
  });
});
