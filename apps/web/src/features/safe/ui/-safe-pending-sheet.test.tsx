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
  voucher: vi.fn(),
  version: vi.fn(),
  connectorId: "private-key",
}));
vi.mock("#/lib/api/market", () => ({ marketClient: { getMarketVoucher: mocks.voucher } }));
vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useReverseRecipientResolution: () => ({ data: null, isPending: false }),
}));
vi.mock("#/lib/api/safe", () => ({ safeClient: { pending: mocks.pending } }));
vi.mock("#/lib/safe-config", () => ({ SAFE_APP_PREFIX: "gno", SAFE_MULTISEND_CALL_ONLY: [] }));
vi.mock("#/connectors/calibur-webauthn", () => ({
  CALIBUR_WEBAUTHN_CONNECTOR_ID: "calibur-webauthn",
}));
vi.mock("wagmi", () => ({
  useClient: () => ({ chain: { id: 100 } }),
  useConnection: () => ({ address: ME, connector: { id: mocks.connectorId } }),
}));
vi.mock("viem/actions", () => ({ readContract: mocks.version }));
vi.mock("#/lib/chain", () => ({ CHAIN_ID: 100 }));
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
  mocks.voucher.mockResolvedValue({ decimals: 6, symbol: "MLTT" });
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

  it("shows who receives a mint and how much before anyone confirms", async () => {
    const sheet = await openWith([proposal()]);
    const amount = await within(sheet).findByText(
      (_text, node) => node?.tagName === "SPAN" && node.textContent === "1.00 MLTT",
    );
    expect(amount).toBeTruthy();
    expect(within(sheet).getByText("Recipient")).toBeTruthy();
    expect(within(sheet).getByText("Amount")).toBeTruthy();
    expect(mocks.voucher).toHaveBeenCalledWith(
      "0x2222222222222222222222222222222222222222",
      expect.anything(),
    );
  });

  it("shows the new owner of a handover", async () => {
    const handover = encodeFunctionData({
      abi: parseAbi(["function transferOwnership(address)"]),
      functionName: "transferOwnership",
      args: [OTHER],
    });
    const sheet = await openWith([proposal({ data: handover })]);
    expect(within(sheet).getByText("Transfer ownership")).toBeTruthy();
    expect(within(sheet).getByText("New owner")).toBeTruthy();
    expect(within(sheet).queryByText("Amount")).toBeNull();
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

  it("lets a passkey confirm on a Safe 1.5.0", async () => {
    mocks.connectorId = "calibur-webauthn";
    mocks.version.mockResolvedValue("1.5.0");
    const tx = proposal();
    const sheet = await openWith([tx]);
    fireEvent.click(await within(sheet).findByRole("button", { name: "Confirm" }));
    expect(mocks.confirm).toHaveBeenCalledWith(tx, expect.anything());
    expect(mocks.version).toHaveBeenCalledWith(expect.anything(), {
      address: SAFE,
      abi: expect.anything(),
      functionName: "VERSION",
    });
  });

  it("points a passkey on an older Safe to the paper wallet", async () => {
    mocks.connectorId = "calibur-webauthn";
    mocks.version.mockResolvedValue("1.4.1");
    const sheet = await openWith([proposal()]);
    expect(
      await within(sheet).findByText(
        "Passkeys can sign for multisigs on Safe 1.5 or later. Use your paper wallet.",
      ),
    ).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("does not read the Safe version for a paper wallet", async () => {
    await openWith([proposal()]);
    expect(mocks.version).not.toHaveBeenCalled();
  });

  it("does not offer to confirm a call it cannot decode", async () => {
    const sheet = await openWith([proposal({ data: "0x12345678" })]);
    expect(within(sheet).getByText("Unknown call")).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: "Confirm" })).toBeNull();
  });
});
