import type { RetirementPreview, RetirementRequest } from "@clc/api/features/retirement/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RetirementDecisionForm } from "./retirement-decision-form";
import { RestoreResourceSheet } from "./restore-resource-sheet";
import { BalanceSummary } from "./balance-summary";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("#/lib/api", () => ({ clcApi: { retirement: mocks } }));

function preview(overrides: Partial<RetirementPreview> = {}): RetirementPreview {
  return {
    resourceType: "voucher",
    resourceAddress: ADDRESS,
    chainId: 100,
    ownerAddress: OWNER,
    active: true,
    symbol: "CARE",
    decimals: 6,
    amountOutsideOwnerRaw: "1250000",
    positiveTokenCount: null,
    hasPositiveBalances: true,
    blockNumber: "1234",
    checkedAt: "2026-10-25T12:00:00Z",
    coverage: "total-supply",
    coverageNote: null,
    ...overrides,
  };
}

function request(overrides: Partial<RetirementRequest> = {}): RetirementRequest {
  return {
    id: 1,
    resourceType: "voucher",
    resourceAddress: ADDRESS,
    resourceName: "Care",
    symbol: "CARE",
    chainId: 100,
    requesterAddress: OWNER,
    ownerAddress: OWNER,
    reason: "Project closed",
    status: "pending",
    requestedAt: "2026-10-25T12:00:00Z",
    decisionAt: null,
    decisionBy: null,
    decisionReason: null,
    snapshot: preview(),
    decisionSnapshot: null,
    ...overrides,
  };
}

function renderForm(value = request()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RetirementDecisionForm request={value} />
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue(preview());
  mocks.approve.mockResolvedValue(request({ status: "approved" }));
  mocks.reject.mockResolvedValue(request({ status: "rejected" }));
  mocks.restore.mockResolvedValue({ address: ADDRESS, active: true });
});

describe("retirement decisions", () => {
  it("requires acknowledgment of positive balances before approval", async () => {
    renderForm();
    await screen.findByText("Other accounts hold 1.25 CARE.");
    const approve = screen.getByRole("button", { name: "Approve retirement" });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect((approve as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(approve);
    await waitFor(() =>
      expect(mocks.approve).toHaveBeenCalledWith(1, { acknowledgeBalances: true }),
    );
  });

  it("can approve a verified zero balance without claiming acknowledgment", async () => {
    mocks.preview.mockResolvedValue(
      preview({ amountOutsideOwnerRaw: "0", hasPositiveBalances: false }),
    );
    renderForm();
    await screen.findByText("Other accounts hold 0 CARE.");
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve retirement" }));
    await waitFor(() =>
      expect(mocks.approve).toHaveBeenCalledWith(1, { acknowledgeBalances: false }),
    );
  });

  it("does not treat failed balance reads as zero; rejection still needs a reason", async () => {
    mocks.preview.mockRejectedValue(new Error("RPC unavailable"));
    renderForm();
    await screen.findByText(/Could not check balances/);
    expect(screen.queryByText("Other accounts hold 0 CARE.")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Approve retirement" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    const reject = screen.getByRole("button", { name: "Reject request" });
    expect((reject as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Decision explanation/), {
      target: { value: "  Please settle the outstanding agreements.  " },
    });
    fireEvent.click(reject);
    await waitFor(() =>
      expect(mocks.reject).toHaveBeenCalledWith(1, {
        reason: "Please settle the outstanding agreements.",
      }),
    );
  });

  it("cannot approve a request after the owner changes", async () => {
    mocks.preview.mockResolvedValue(
      preview({ ownerAddress: "0x3333333333333333333333333333333333333333" }),
    );
    renderForm();
    await screen.findByText(/Ownership has changed/);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      (screen.getByRole("button", { name: "Approve retirement" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("clears balance acknowledgment when the admin refreshes the preview", async () => {
    renderForm();
    await screen.findByText("Other accounts hold 1.25 CARE.");
    fireEvent.click(screen.getByRole("checkbox"));
    mocks.preview.mockResolvedValue(
      preview({ blockNumber: "1235", amountOutsideOwnerRaw: "2000000" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh balances" }));
    await screen.findByText("Other accounts hold 2 CARE.");
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("false");
    expect(
      (screen.getByRole("button", { name: "Approve retirement" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows pool types and partial-coverage information without summing different tokens", async () => {
    mocks.preview.mockResolvedValue(
      preview({
        resourceType: "pool",
        amountOutsideOwnerRaw: null,
        positiveTokenCount: 2,
        coverage: "known-tokens",
        coverageNote: "Includes known tokens; untracked tokens may not be included.",
      }),
    );
    renderForm(request({ resourceType: "pool" }));
    await screen.findByText("The pool holds 2 known voucher types with positive balances.");
    expect(screen.getByText(/Includes known tokens/)).toBeTruthy();
    expect(screen.getByText(/Owner withdrawals remain available/)).toBeTruthy();
  });

  it("keeps dust visible rather than displaying zero", () => {
    render(<BalanceSummary preview={preview({ amountOutsideOwnerRaw: "1", decimals: 18 })} />);
    expect(screen.getByText("Other accounts hold 0.000000000000000001 CARE.")).toBeTruthy();
  });
});

describe("restoration", () => {
  it.each(["voucher", "pool"] as const)(
    "requires a reason and retains quota errors for a %s",
    async (type) => {
      mocks.restore.mockRejectedValue(new Error("Resource allowance is full"));
      const close = vi.fn();
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <RestoreResourceSheet type={type} address={ADDRESS} name="Care" open onClose={close} />
        </QueryClientProvider>,
      );
      const submit = await screen.findByRole("button", { name: `Restore ${type}` });
      expect((submit as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(screen.getByLabelText("Reason for restoration"), {
        target: { value: "Approved reopening" },
      });
      fireEvent.click(submit);
      await screen.findByText("Resource allowance is full");
      expect(mocks.restore).toHaveBeenCalledWith(type, ADDRESS, { reason: "Approved reopening" });
      expect(close).not.toHaveBeenCalled();
    },
  );
});
