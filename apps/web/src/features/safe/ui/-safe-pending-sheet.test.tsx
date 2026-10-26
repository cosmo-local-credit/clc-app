import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { encodeFunctionData, parseAbi } from "viem";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const SAFE = "0x1111111111111111111111111111111111111111";
const ME = "0x00000000000000000000000000000000000000a1";
const OTHER = "0x00000000000000000000000000000000000000b2";

const mocks = vi.hoisted(() => ({
  pending: vi.fn(),
  confirm: vi.fn(),
  connectorId: "private-key",
}));
vi.mock("#/lib/api/safe", () => ({ safeClient: { pending: mocks.pending } }));
vi.mock("#/lib/safe-config", () => ({ SAFE_APP_PREFIX: "gno", SAFE_MULTISEND_CALL_ONLY: [] }));
vi.mock("#/connectors/calibur-webauthn", () => ({
  CALIBUR_WEBAUTHN_CONNECTOR_ID: "calibur-webauthn",
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ address: ME, connector: { id: mocks.connectorId } }),
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, session: { address: ME } }),
}));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useSafeOwnersSignedBy: () => new Set([SAFE]),
}));
vi.mock("../hooks/use-safe-confirm", () => ({
  useSafeConfirm: () => ({ mutate: mocks.confirm, isPending: false, variables: undefined }),
}));

import { useSafeSheet } from "../state/safe-sheet";
import { SafePendingSheet } from "./safe-pending-sheet";

const mint = encodeFunctionData({
  abi: parseAbi(["function mintTo(address,uint256)"]),
  functionName: "mintTo",
  args: [SAFE, 1_000_000n],
});

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    safe: SAFE,
    safeTxHash: `0x${"ab".repeat(32)}`,
    to: "0x2222222222222222222222222222222222222222",
    value: "0",
    data: mint,
    operation: 0,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: "0x0000000000000000000000000000000000000000",
    refundReceiver: "0x0000000000000000000000000000000000000000",
    nonce: "1",
    confirmations: [{ owner: OTHER, signature: "0x", submittedAt: "2026-10-26" }],
    confirmationsRequired: 2,
    isExecuted: false,
    isSuccessful: null,
    transactionHash: null,
    ...overrides,
  };
}

async function openWith(transactions: unknown[]) {
  mocks.pending.mockResolvedValue(transactions);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SafePendingSheet />
    </QueryClientProvider>,
  );
  act(() => useSafeSheet.getState().show(SAFE));
  await screen.findByText("Nonce 1");
  return screen.getByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connectorId = "private-key";
  act(() => useSafeSheet.getState().close());
});

describe("SafePendingSheet", () => {
  it("names the action and lets a signer confirm it", async () => {
    const tx = proposal();
    const sheet = await openWith([tx]);
    expect(within(sheet).getByText("Create vouchers")).toBeTruthy();
    expect(within(sheet).getByText("1/2")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm" }));
    expect(mocks.confirm).toHaveBeenCalledWith(tx, expect.anything());
  });

  it("shows the viewer's own confirmation instead of the button", async () => {
    const sheet = await openWith([
      proposal({ confirmations: [{ owner: ME, signature: "0x", submittedAt: "2026-10-26" }] }),
    ]);
    expect(within(sheet).getByText("You confirmed")).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("sends a fully confirmed proposal to Safe for execution", async () => {
    const sheet = await openWith([
      proposal({
        confirmations: [
          { owner: OTHER, signature: "0x", submittedAt: "2026-10-26" },
          { owner: ME, signature: "0x", submittedAt: "2026-10-26" },
        ],
      }),
    ]);
    expect(within(sheet).getByText("2/2")).toBeTruthy();
    expect(within(sheet).getByText("Execute it in Safe.")).toBeTruthy();
  });

  it("shows clc-core executing a fully confirmed proposal", async () => {
    const sheet = await openWith([
      proposal({
        executing: true,
        confirmations: [
          { owner: OTHER, signature: "0x", submittedAt: "2026-10-26" },
          { owner: ME, signature: "0x", submittedAt: "2026-10-26" },
        ],
      }),
    ]);
    expect(within(sheet).getByRole("status").textContent).toContain("Executing…");
    expect(within(sheet).queryByText("Execute it in Safe.")).toBeNull();
  });

  it("leaves a passkey session and undecodable calls to Safe", async () => {
    mocks.connectorId = "calibur-webauthn";
    const sheet = await openWith([proposal()]);
    expect(within(sheet).queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(
      within(sheet).getByText("Review this transaction in your multisig wallet."),
    ).toBeTruthy();
  });

  it("does not offer to confirm a call it cannot decode", async () => {
    const sheet = await openWith([proposal({ data: "0x12345678" })]);
    expect(within(sheet).getByText("Unknown call")).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: "Confirm" })).toBeNull();
  });
});
