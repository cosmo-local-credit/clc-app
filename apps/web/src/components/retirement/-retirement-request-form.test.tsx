import type { RetirementPreview, RetirementRequest } from "@clc/api/features/retirement/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RetirementRequestForm } from "./retirement-request-form";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), create: vi.fn() }));
vi.mock("#/lib/api/retirement", () => ({ retirementClient: mocks }));
const ADDRESS = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const checked: RetirementPreview = {
  resourceType: "voucher",
  resourceAddress: ADDRESS,
  chainId: 100,
  ownerAddress: OWNER,
  active: true,
  symbol: "TEST",
  decimals: 18,
  amountOutsideOwnerRaw: "1",
  positiveTokenCount: null,
  hasPositiveBalances: true,
  blockNumber: "1234",
  checkedAt: "2026-10-25T12:00:00Z",
  coverage: "total-supply",
  coverageNote: null,
};

function show(type: "voucher" | "pool" = "voucher") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSubmitted = vi.fn();
  client.setQueryData(["clc", "vouchers", "detail", ADDRESS], { active: true });
  const view = render(
    <QueryClientProvider client={client}>
      <RetirementRequestForm
        type={type}
        address={ADDRESS}
        viewer={OWNER}
        onSubmitted={onSubmitted}
      />
    </QueryClientProvider>,
  );
  return { ...view, client, onSubmitted };
}

beforeEach(() => {
  mocks.preview.mockReset().mockResolvedValue(checked);
  mocks.create.mockReset().mockResolvedValue({ id: 1, status: "pending" } as RetirementRequest);
});

describe("owner retirement warning", () => {
  it("requires a reason, displays dust precisely and keeps the voucher active after requesting", async () => {
    const { client, onSubmitted } = show();
    await screen.findByText("0.000000000000000001 TEST");
    const submit = screen.getByRole("button", { name: "Request retirement" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason for retirement"), {
      target: { value: "  Closing the project  " },
    });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith("voucher", ADDRESS, {
        reason: "Closing the project",
      }),
    );
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(client.getQueryData(["clc", "vouchers", "detail", ADDRESS])).toEqual({ active: true });
  });

  it("shows a failed balance check and prevents submission instead of displaying zero", async () => {
    mocks.preview.mockRejectedValue(new Error("RPC unavailable"));
    show();
    await screen.findByRole("alert");
    expect(
      screen.getByText("Could not check balances. Try again before submitting your request."),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reason for retirement"), {
      target: { value: "Closing" },
    });
    expect(
      (screen.getByRole("button", { name: "Request retirement" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("counts known voucher types and explains pool withdrawal access", async () => {
    mocks.preview.mockResolvedValue({
      ...checked,
      resourceType: "pool",
      amountOutsideOwnerRaw: null,
      positiveTokenCount: 2,
      coverage: "known-tokens",
    });
    show("pool");
    await screen.findByText("Your pool holds 2 known voucher types with positive balances.");
    expect(
      screen.getByText(
        "This check includes known pool holdings. Tokens not yet tracked may be missing.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("You can still withdraw funds after the pool is retired."),
    ).toBeTruthy();
  });
});
