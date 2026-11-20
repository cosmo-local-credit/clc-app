import type { SafeProposal } from "@clc/api/features/safe/client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { SafePendingProposal } from "../hooks/use-safe-pending";
import { SafeRejectionControl } from "./safe-rejection-control";

const SAFE = "0x1111111111111111111111111111111111111111";
const HASH = `0x${"ab".repeat(32)}`;

function transaction(): SafeProposal {
  return {
    safe: SAFE,
    safeTxHash: HASH,
    to: "0x2222222222222222222222222222222222222222",
    value: "0",
    data: "0x12345678",
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
  };
}

function proposal(overrides: Partial<SafePendingProposal> = {}): SafePendingProposal {
  return {
    transaction: transaction(),
    calls: [],
    action: "confirm",
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

describe("SafeRejectionControl", () => {
  it("executes a threshold-approved rejection and shows execution progress", () => {
    const executeRejection = vi.fn();
    const { rerender } = render(
      <SafeRejectionControl
        proposal={proposal({ rejectionAction: "execute", executeRejection })}
        disabled={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Execute rejection" }));
    expect(executeRejection).toHaveBeenCalledOnce();

    rerender(
      <SafeRejectionControl
        proposal={proposal({ rejectionAction: "executing" })}
        disabled={false}
      />,
    );
    expect((screen.getByRole("button", { name: "Rejecting…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("shows the viewer's existing rejection confirmation", () => {
    render(
      <SafeRejectionControl
        proposal={proposal({
          rejection: {
            ...transaction(),
            confirmations: [
              { owner: SAFE, submittedAt: "2026-11-19T00:00:00Z", signature: "0x12" },
            ],
          },
          rejectionAction: "confirmed",
        })}
        disabled={false}
      />,
    );
    expect(screen.getByText(/You signed the rejection/)).toBeTruthy();
    expect(screen.getByText(/1\/2/)).toBeTruthy();
  });

  it("can cancel signing and closes the confirmation after a pending signature settles", () => {
    const reject = vi.fn();
    const current = proposal({ rejection: transaction(), reject });
    const { rerender } = render(<SafeRejectionControl proposal={current} disabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Sign rejection" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Reject this multisig action?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sign rejection" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Sign rejection" }).at(-1)!);
    expect(reject).toHaveBeenCalledOnce();
    rerender(<SafeRejectionControl proposal={{ ...current, rejecting: true }} disabled={false} />);
    rerender(<SafeRejectionControl proposal={current} disabled={false} />);
    expect(screen.queryByText("Reject this multisig action?")).toBeNull();
  });

  it("does not offer rejection for unsupported passkeys or submitted actions", () => {
    const { rerender } = render(
      <SafeRejectionControl proposal={proposal({ passkeyUnsupported: true })} disabled={false} />,
    );
    expect(screen.queryByRole("button")).toBeNull();

    rerender(
      <SafeRejectionControl
        proposal={proposal({ transaction: { ...transaction(), executionState: "submitted" } })}
        disabled={false}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
