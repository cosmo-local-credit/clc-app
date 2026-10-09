import type { AdminPoolTransaction } from "@clc/api/features/admin/client";
import { swapPoolSwapSettlementEventAbi } from "@clc/core/features/pool-swaps/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PoolProtocolFee } from "./pool-protocol-fee";

const receipt = vi.hoisted(() => vi.fn());
vi.mock("viem/actions", () => ({
  getTransactionReceipt: (...args: unknown[]) => receipt(...args),
}));
vi.mock("#/lib/chain-client", () => ({ getChainClient: () => ({}) }));

const pool = "0x1111111111111111111111111111111111111111";
const tokenIn = "0x2222222222222222222222222222222222222222";
const tokenOut = "0x3333333333333333333333333333333333333333";
const transaction: AdminPoolTransaction = {
  id: 1,
  txId: 1,
  logIndex: 1,
  txHash: `0x${"ab".repeat(32)}`,
  t: "2026-10-09T10:00:00Z",
  success: true,
  type: "swap",
  pool,
  initiator: pool,
  tokenIn,
  tokenInSymbol: "IN",
  tokenInDecimals: 6,
  amountIn: "1000000",
  tokenOut,
  tokenOutSymbol: "OUT",
  tokenOutDecimals: 6,
  amountOut: "997000",
  fee: "1000",
  protocolFee: null,
};

function settlementLog() {
  return {
    address: pool,
    topics: encodeEventTopics({
      abi: swapPoolSwapSettlementEventAbi,
      eventName: "SwapSettlement",
      args: { initiator: pool, tokenIn, tokenOut },
    }),
    data: encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [1000000n, 1000000n, 997000n, 997000n, 1000n, 2000n],
    ),
  };
}

function renderFee(row = transaction) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PoolProtocolFee transaction={row} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  receipt.mockReset();
});

describe("PoolProtocolFee", () => {
  it("reads the settled protocol fee in output-token units", async () => {
    receipt.mockResolvedValue({ logs: [settlementLog()] });
    renderFee();
    expect(await screen.findByText("0.002")).toBeTruthy();
    expect(screen.getByText("OUT")).toBeTruthy();
  });

  it("uses the indexed fee, including a confirmed zero, without an RPC read", () => {
    renderFee({ ...transaction, protocolFee: "0" });
    expect(screen.getByText("0")).toBeTruthy();
    expect(receipt).not.toHaveBeenCalled();
  });

  it("does not turn legacy or ambiguous settlements into zero", async () => {
    receipt.mockResolvedValue({ logs: [settlementLog(), settlementLog()] });
    renderFee();
    expect(await screen.findByText("Not recorded")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("does not fetch receipts for deposits or failed swaps", () => {
    renderFee({ ...transaction, type: "deposit" });
    renderFee({ ...transaction, success: false });
    expect(receipt).not.toHaveBeenCalled();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shares one receipt across rows in the same transaction", async () => {
    receipt.mockResolvedValue({ logs: [settlementLog()] });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PoolProtocolFee transaction={transaction} />
        <PoolProtocolFee transaction={transaction} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("0.002")).toHaveLength(2));
    expect(receipt).toHaveBeenCalledOnce();
  });

  it("contains RPC failures in the fee cell", async () => {
    receipt.mockRejectedValue(new Error("RPC unavailable"));
    renderFee();
    expect(await screen.findByText("Not recorded")).toBeTruthy();
  });
});
