import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { decodeFunctionData } from "viem";
import { protocolFeeControllerAbi } from "@clc/core/features/protocol-admin/logic";

const state = vi.hoisted(() => ({ send: vi.fn(), error: vi.fn(), read: vi.fn() }));
const OWNER = "0x0000000000000000000000000000000000000001";
const CONTROLLER = "0x0000000000000000000000000000000000000002";
vi.mock("#/features/operator/operator-address", () => ({
  useOperatorAddress: () => "0x0000000000000000000000000000000000000001",
  sameAddress: (a: string, b: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase()),
}));
vi.mock("#/features/operator/use-operator-calls", () => ({
  useOperatorCalls: () => ({ mutateAsync: state.send, isPending: false }),
}));
vi.mock("#/features/dashboard/use-dashboard-metrics", () => ({
  useRelayDesk: () => ({ data: undefined }),
}));
vi.mock("#/lib/chain-client", () => ({ getChainClient: () => ({}) }));
vi.mock("viem/actions", () => ({ readContract: (...args: unknown[]) => state.read(...args) }));
vi.mock("sonner", () => ({ toast: { error: state.error, success: vi.fn() } }));

import { ProtocolPage } from "./protocol-page";

beforeEach(() => {
  vi.resetAllMocks();
  state.send.mockResolvedValue({ trackingId: "track-1" });
  state.read.mockImplementation((_client: unknown, { functionName }: { functionName: string }) =>
    Promise.resolve(
      (
        {
          getProtocolFee: 1000n,
          getProtocolFeeRecipient: OWNER,
          isActive: true,
          owner: OWNER,
        } as Record<string, unknown>
      )[functionName],
    ),
  );
});

async function loadController() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ProtocolPage />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Controller"), { target: { value: CONTROLLER } });
  fireEvent.click(screen.getAllByRole("button", { name: "Load" })[0]!);
  await screen.findByRole("button", { name: "Save fee" });
}

describe("ProtocolPage", () => {
  it.each(["", "abc", "-1", "101"])(
    "rejects an invalid fee (%s) with visible feedback and no transaction",
    async (value) => {
      await loadController();
      fireEvent.change(screen.getByLabelText("Percent"), { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Save fee" }));
      expect(await screen.findByText("Enter a fee from 0 to 100")).toBeTruthy();
      expect(state.send).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["0", 0n],
    ["1.25", 12500n],
    ["100", 1_000_000n],
  ] as const)("submits a validated fee of %s percent in PPM", async (percent, ppm) => {
    await loadController();
    fireEvent.change(screen.getByLabelText("Percent"), { target: { value: percent } });
    fireEvent.click(screen.getByRole("button", { name: "Save fee" }));
    await waitFor(() => expect(state.send).toHaveBeenCalledTimes(1));
    const [call] = state.send.mock.calls[0]![0];
    expect(call.to).toBe(CONTROLLER);
    expect(decodeFunctionData({ abi: protocolFeeControllerAbi, data: call.data })).toEqual({
      functionName: "setProtocolFee",
      args: [ppm],
    });
  });

  it("rejects the zero fee recipient without submitting a transaction", async () => {
    await loadController();
    fireEvent.change(screen.getByLabelText("Recipient"), {
      target: { value: `0x${"0".repeat(40)}` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save recipient" }));
    expect(await screen.findByText("Enter a non-zero wallet address")).toBeTruthy();
    expect(state.send).not.toHaveBeenCalled();
  });
});
