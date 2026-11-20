import type { SafeProposal } from "@clc/api/features/safe/client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { SafePendingProposal } from "../hooks/use-safe-pending";
import { SafeExecutionControl } from "./safe-execution-control";

const SAFE = "0x1111111111111111111111111111111111111111";

function transaction(overrides: Partial<SafeProposal> = {}): SafeProposal {
  return {
    safe: SAFE,
    safeTxHash: `0x${"ab".repeat(32)}`,
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

describe("SafeExecutionControl", () => {
  it("distinguishes queued, submitted, and legacy executing work", () => {
    const { rerender } = render(
      <SafeExecutionControl
        proposal={proposal({ transaction: transaction({ executionState: "queued" }) })}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("Queued for execution…");

    rerender(
      <SafeExecutionControl
        proposal={proposal({ transaction: transaction({ executionState: "submitted" }) })}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("Executing…");

    rerender(<SafeExecutionControl proposal={proposal({ action: "executing" })} />);
    expect(screen.getByRole("status").textContent).toContain("Executing…");
  });

  it("explains nonce ordering", () => {
    render(
      <SafeExecutionControl
        proposal={proposal({ transaction: transaction({ executionState: "waiting" }) })}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Waiting for earlier multisig transactions to execute.",
    );
  });

  it("executes ready work and exposes a retry after failure", () => {
    const execute = vi.fn();
    const { rerender } = render(
      <SafeExecutionControl
        proposal={proposal({
          transaction: transaction({ executionState: "ready" }),
          execute,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    expect(execute).toHaveBeenCalledOnce();

    rerender(
      <SafeExecutionControl
        proposal={proposal({
          transaction: transaction({ executionState: "failed" }),
          requestingExecution: true,
        })}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Automatic execution did not complete");
    expect((screen.getByRole("button", { name: "Executing…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("keeps the external Safe fallback for older backends", () => {
    render(<SafeExecutionControl proposal={proposal()} />);
    expect(screen.getByText("Execute it in Safe.")).toBeTruthy();
  });
});
