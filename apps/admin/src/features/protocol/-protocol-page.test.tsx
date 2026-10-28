import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { decodeFunctionData } from "viem";
import { protocolFeeControllerAbi } from "@clc/core/features/protocol-admin/logic";

const state = vi.hoisted(() => ({
  operator: "0x0000000000000000000000000000000000000001",
  send: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  read: vi.fn(),
  desk: undefined as
    | undefined
    | {
        relayerAddress: string;
        chainId: number;
        idempotentRelay: boolean;
        systemSigner: string;
      },
}));
const OWNER = "0x0000000000000000000000000000000000000001";
const CONTROLLER = "0x0000000000000000000000000000000000000002";
vi.mock("#/features/operator/operator-address", () => ({
  useOperatorAddress: () => state.operator,
  sameAddress: (a: string, b: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase()),
}));
vi.mock("#/features/operator/use-operator-calls", () => ({
  useOperatorCalls: () => ({ mutateAsync: state.send, isPending: false }),
}));
vi.mock("#/features/dashboard/use-dashboard-metrics", () => ({
  useRelayDesk: () => ({ data: state.desk }),
}));
vi.mock("#/lib/chain-client", () => ({ getChainClient: () => ({}) }));
vi.mock("viem/actions", () => ({ readContract: (...args: unknown[]) => state.read(...args) }));
vi.mock("sonner", () => ({ toast: { error: state.error, success: state.success } }));

import { ProtocolPage } from "./protocol-page";

beforeEach(() => {
  vi.resetAllMocks();
  state.operator = OWNER;
  state.desk = undefined;
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

async function loadFaucet() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ProtocolPage />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Faucet"), { target: { value: CONTROLLER } });
  fireEvent.click(screen.getAllByRole("button", { name: "Load" })[1]!);
  await screen.findByRole("button", { name: "Seal" });
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

  it("updates the fee recipient and pauses an active controller", async () => {
    await loadController();
    fireEvent.change(screen.getByLabelText("Recipient"), { target: { value: CONTROLLER } });
    fireEvent.click(screen.getByRole("button", { name: "Save recipient" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(state.send).toHaveBeenCalledTimes(2));
    expect(state.success).toHaveBeenCalledWith("Recipient updated");
    expect(state.success).toHaveBeenCalledWith("Protocol fee paused");
  });

  it("shows relay details and reports a failed protocol transaction", async () => {
    state.desk = {
      relayerAddress: CONTROLLER,
      chainId: 100,
      idempotentRelay: true,
      systemSigner: OWNER,
    };
    state.send.mockRejectedValueOnce(new Error("wallet rejected"));
    await loadController();
    expect(screen.getAllByText("Yes").length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("wallet rejected"));
  });

  it("loads and seals faucet controls owned by the operator", async () => {
    await loadFaucet();
    expect(screen.getByText("Open")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Seal" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Faucet sealed"));
  });

  it("renders existing faucet seal badges", async () => {
    state.read.mockImplementation((_client: unknown, { functionName }: { functionName: string }) =>
      Promise.resolve(({ sealState: 3, owner: OWNER } as Record<string, unknown>)[functionName]),
    );
    await loadFaucet();
    expect(screen.getAllByText("Registry")).toHaveLength(2);
    expect(screen.getAllByText("Period")).toHaveLength(2);
  });
});
