import type { SafeProposal } from "@clc/api/features/safe/client";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { SafePendingProposal } from "#/features/safe/hooks/use-safe-pending";

const SAFE = "0x1111111111111111111111111111111111111111" as const;
const HASH = `0x${"ab".repeat(32)}` as const;

const mocks = vi.hoisted(() => ({
  proposals: [] as SafePendingProposal[],
}));

vi.mock("#/features/safe/hooks/use-safe-pending", () => ({
  useSafePending: () => ({ status: "ready", proposals: mocks.proposals }),
}));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useSafeSigners: () => ({ data: [] }),
}));
vi.mock("#/features/safe/ui/safe-execution-control", () => ({
  SafeExecutionControl: () => <div>Execution control</div>,
}));
vi.mock("#/features/safe/ui/safe-rejection-control", () => ({
  SafeRejectionControl: ({ proposal }: { proposal: SafePendingProposal }) => (
    <div>{proposal.rejectionAction === "execute" ? "Rejection control" : "Reject control"}</div>
  ),
}));

import { useSafeSheet } from "#/features/safe/state/safe-sheet";
import { SafePendingDesk } from "./safe-pending-desk";

function transaction(overrides: Partial<SafeProposal> = {}): SafeProposal {
  return {
    safe: SAFE,
    safeTxHash: `0x${"cd".repeat(32)}`,
    to: "0x2222222222222222222222222222222222222222",
    value: "0",
    data: "0x",
    operation: 0,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: "0x0000000000000000000000000000000000000000",
    refundReceiver: "0x0000000000000000000000000000000000000000",
    nonce: "7",
    confirmations: [],
    confirmationsRequired: 2,
    isExecuted: false,
    isSuccessful: null,
    transactionHash: null,
    ...overrides,
  };
}

function proposal(overrides: Partial<SafePendingProposal> = {}): SafePendingProposal {
  return {
    transaction: transaction(),
    calls: [],
    action: "execute",
    confirming: false,
    confirm: vi.fn(),
    requestingExecution: false,
    execute: vi.fn(),
    rejecting: false,
    reject: vi.fn(),
    rejection: null,
    rejectionAction: null,
    requestingRejectionExecution: false,
    executeRejection: vi.fn(),
    passkeyUnsupported: false,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.proposals = [];
  act(() => useSafeSheet.getState().close());
});

describe("SafePendingDesk", () => {
  it("opens the exact proposal and explains when it is no longer pending", async () => {
    mocks.proposals = [proposal()];
    render(<SafePendingDesk />);
    act(() => useSafeSheet.getState().show(SAFE, HASH));
    expect(await screen.findByText("This proposal is no longer pending.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(useSafeSheet.getState().safe).toBeNull();
  });

  it("selects an action through its rejection hash and gives rejection execution precedence", async () => {
    mocks.proposals = [
      proposal({
        rejection: transaction({ safeTxHash: HASH, transactionKind: "rejection" }),
        rejectionAction: "execute",
      }),
    ];
    render(<SafePendingDesk />);
    act(() => useSafeSheet.getState().show(SAFE, HASH));

    expect(await screen.findByText("Rejection control")).toBeTruthy();
    expect(screen.queryByText("Execution control")).toBeNull();
  });

  it("shows sponsored execution for a ready action", async () => {
    mocks.proposals = [proposal()];
    render(<SafePendingDesk />);
    act(() => useSafeSheet.getState().show(SAFE));

    expect(await screen.findByText("Execution control")).toBeTruthy();
    expect(screen.getByText("Reject control")).toBeTruthy();
  });

  it("lets a signer confirm an action", async () => {
    const confirm = vi.fn();
    mocks.proposals = [proposal({ action: "confirm", confirm })];
    render(<SafePendingDesk />);
    act(() => useSafeSheet.getState().show(SAFE));

    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(confirm).toHaveBeenCalledOnce();
  });
});
