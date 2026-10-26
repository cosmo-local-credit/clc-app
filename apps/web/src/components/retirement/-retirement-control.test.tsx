import type { RetirementPreview, RetirementRequest } from "@clc/api/features/retirement/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { RetirementControl } from "./retirement-control";

const mocks = vi.hoisted(() => ({
  listResource: vi.fn(),
  preview: vi.fn(),
  create: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("#/lib/api/retirement", () => ({ retirementClient: mocks }));
const ADDRESS = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const preview: RetirementPreview = {
  resourceType: "voucher",
  resourceAddress: ADDRESS,
  chainId: 100,
  ownerAddress: OWNER,
  active: true,
  symbol: "TEST",
  decimals: 2,
  amountOutsideOwnerRaw: "500",
  positiveTokenCount: null,
  hasPositiveBalances: true,
  blockNumber: "1234",
  checkedAt: "2026-10-25T12:00:00Z",
  coverage: "total-supply",
  coverageNote: null,
};
const pending: RetirementRequest = {
  id: 1,
  resourceType: "voucher",
  resourceAddress: ADDRESS,
  resourceName: "Test voucher",
  symbol: "TEST",
  chainId: 100,
  requesterAddress: OWNER,
  ownerAddress: OWNER,
  reason: "Closing",
  status: "pending",
  requestedAt: "2026-10-25T12:00:00Z",
  decisionAt: null,
  decisionBy: null,
  decisionReason: null,
  snapshot: preview,
  decisionSnapshot: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listResource.mockResolvedValue([]);
  mocks.preview.mockResolvedValue(preview);
});

it("shows the pending state and cancels the request without retiring the voucher", async () => {
  mocks.create.mockImplementation(async () => {
    mocks.listResource.mockResolvedValue([pending]);
    return pending;
  });
  mocks.cancel.mockImplementation(async () => {
    const cancelled = { ...pending, status: "cancelled" };
    mocks.listResource.mockResolvedValue([cancelled]);
    return cancelled;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RetirementControl type="voucher" address={ADDRESS} name="Test voucher" viewer={OWNER} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Request retirement" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(await within(dialog).findByLabelText("Reason for retirement"), {
    target: { value: "Closing" },
  });
  await waitFor(() =>
    expect(
      (within(dialog).getByRole("button", { name: "Request retirement" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Request retirement" }));
  const cancel = await within(dialog).findByRole("button", { name: "Cancel request" });
  expect(
    within(dialog).getByText(
      "Retirement requested — awaiting admin review. This resource stays active until approval.",
    ),
  ).toBeTruthy();
  expect(within(dialog).queryByRole("button", { name: "Request retirement" })).toBeNull();
  fireEvent.click(cancel);
  await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith(1));
  await within(dialog).findByText("Request cancelled");
  expect(within(dialog).getByRole("button", { name: "Request retirement" })).toBeTruthy();
});

it("does not offer a new request while its current status cannot be loaded", async () => {
  mocks.listResource.mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValueOnce([]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RetirementControl type="pool" address={ADDRESS} name="Test pool" viewer={OWNER} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Request retirement" }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("Could not load retirement requests.");
  expect(within(dialog).queryByRole("button", { name: "Request retirement" })).toBeNull();
  expect(mocks.preview).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
  expect(await within(dialog).findByLabelText("Reason for retirement")).toBeTruthy();
});

it("shows history without a new request for retired resources and closes explicitly", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RetirementControl
        type="pool"
        address={ADDRESS}
        name="Retired pool"
        viewer={OWNER}
        active={false}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Retirement history" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).queryByLabelText("Reason for retirement")).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
