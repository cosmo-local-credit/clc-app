import type { RetirementRequest } from "@clc/api/features/retirement/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { MyRetirementRequests } from "./my-retirement-requests";

const mocks = vi.hoisted(() => ({ listMine: vi.fn(), cancel: vi.fn() }));
vi.mock("#/lib/api/retirement", () => ({ retirementClient: mocks }));

const ADDRESS = "0x1111111111111111111111111111111111111111";

function request(id: number, status: RetirementRequest["status"]): RetirementRequest {
  return {
    id,
    resourceType: "voucher",
    resourceAddress: ADDRESS,
    resourceName: `Voucher ${id}`,
    symbol: `V${id}`,
    chainId: 100,
    requesterAddress: ADDRESS,
    ownerAddress: ADDRESS,
    reason: `Reason ${id}`,
    status,
    requestedAt: "2026-10-25T12:00:00Z",
    decisionAt: null,
    decisionBy: null,
    decisionReason: null,
    snapshot: {
      resourceType: "voucher",
      resourceAddress: ADDRESS,
      chainId: 100,
      ownerAddress: ADDRESS,
      active: status !== "approved",
      symbol: `V${id}`,
      decimals: 6,
      amountOutsideOwnerRaw: "0",
      positiveTokenCount: null,
      hasPositiveBalances: false,
      blockNumber: "1000",
      checkedAt: "2026-10-25T12:00:00Z",
      coverage: "total-supply",
      coverageNote: null,
    },
    decisionSnapshot: null,
  };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MyRetirementRequests viewer={ADDRESS} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cancel.mockResolvedValue(undefined);
});

describe("wallet retirement history", () => {
  it("recovers from an unavailable history and renders every terminal status", async () => {
    mocks.listMine
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([
        request(1, "approved"),
        request(2, "rejected"),
        request(3, "cancelled"),
        request(4, "invalidated"),
      ]);
    mount();

    expect(await screen.findByText("Could not load retirement requests.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Retirement approved")).toBeTruthy();
    expect(screen.getByText("Request rejected")).toBeTruthy();
    expect(screen.getByText("Request cancelled")).toBeTruthy();
    expect(screen.getByText("Request closed because ownership changed")).toBeTruthy();
    expect(mocks.listMine).toHaveBeenCalledTimes(2);
  });
});
