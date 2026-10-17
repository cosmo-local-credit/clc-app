import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { exitPoolCreateHistoryMock, state } = vi.hoisted(() => ({
  exitPoolCreateHistoryMock: vi.fn(),
  state: {
    contract: null as null | {
      address: `0x${string}` | null;
      name: string;
      symbol: string;
      status: string;
    },
    contractError: null as Error | null,
    trackingData: undefined as
      | undefined
      | {
          otx: Array<{
            id: number;
            trackingId: string;
            otxType: string;
            txHash: string;
            nonce: number;
            replaced: boolean;
            createdAt: string;
            status: string;
          }>;
        },
    trackingOutcome: { kind: "pending" } as
      | { kind: "pending" }
      | { kind: "success"; otx: { txHash: string } }
      | { kind: "error"; error: string },
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ history: {} }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("#/features/auth/hooks/use-otx-tracking", () => ({
  useOtxTracking: () => ({ outcome: state.trackingOutcome, data: state.trackingData }),
}));

vi.mock("#/hooks/use-deployment", () => ({
  useDeploymentContract: () => ({
    data: state.contract,
    error: state.contractError,
    isError: state.contractError !== null,
  }),
}));

vi.mock("#/lib/navigation/pool-create-history", () => ({
  exitPoolCreateHistory: exitPoolCreateHistoryMock,
}));

import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { PoolDeploymentReceiptPage } from "./pool-deployment-receipt-page";

function renderReceipt() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PoolDeploymentReceiptPage trackingId="tracking-1" />
    </QueryClientProvider>,
  );
}

function record(id: number, otxType: string, status: string) {
  return {
    id,
    trackingId: "tracking-1",
    otxType,
    txHash: `0x${id}`,
    nonce: id,
    replaced: false,
    createdAt: "2026-08-10T00:00:00Z",
    status,
  };
}

beforeEach(() => {
  state.contract = null;
  state.contractError = null;
  state.trackingData = undefined;
  state.trackingOutcome = { kind: "pending" };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  usePoolCreateDraft.getState().clearDraft();
});

describe("PoolDeploymentReceiptPage", () => {
  it("shows all pool stages and does not complete after the first OTX succeeds", () => {
    state.trackingData = {
      otx: [
        record(1, "POOL_TOKEN_INDEX_DEPLOY", "SUCCESS"),
        record(2, "POOL_LIMITER_DEPLOY", "IN_NETWORK"),
        record(3, "POOL_FEE_POLICY_DEPLOY", "PENDING"),
        record(4, "POOL_ORACLE_QUOTER_DEPLOY", "PENDING"),
        record(5, "POOL_PROXY_DEPLOY", "PENDING"),
      ],
    };
    renderReceipt();

    expect(screen.getByRole("heading", { name: "Publishing your pool…" })).toBeTruthy();
    expect(screen.getByText("Voucher registry")).toBeTruthy();
    expect(screen.getByText("Limits")).toBeTruthy();
    expect(screen.getByText("Fee policy")).toBeTruthy();
    expect(screen.getByText("Pricing")).toBeTruthy();
    expect(screen.getByText("The pool")).toBeTruthy();
    expect(screen.getByText("1 of 5")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it("shows the failed stage and keeps the submitted draft when trying again", () => {
    usePoolCreateDraft.getState().setDraft({
      name: "Kilifi Growers",
      symbol: "KGP1",
      unitOfAccount: "KES",
      description: "A growers pool.",
      pricing: "oracle",
      feePolicyDefault: "1",
      feesDecoupled: false,
      feeAddress: "",
      location: { locationName: "Kilifi, Kenya", country: "KE", lat: -3.5, lng: 39.9 },
      tags: [],
      email: "",
      website: "",
      phone: "",
      terms: "",
      acceptedTerms: true,
    });
    state.trackingOutcome = { kind: "error", error: "Transaction failed on-chain (REVERTED)." };
    state.trackingData = {
      otx: [
        record(1, "POOL_TOKEN_INDEX_DEPLOY", "SUCCESS"),
        record(2, "POOL_LIMITER_DEPLOY", "SUCCESS"),
        record(3, "POOL_FEE_POLICY_DEPLOY", "REVERTED"),
        record(4, "POOL_ORACLE_QUOTER_DEPLOY", "PENDING"),
        record(5, "POOL_PROXY_DEPLOY", "PENDING"),
      ],
    };
    renderReceipt();

    expect(screen.getByRole("heading", { name: "Publishing failed" })).toBeTruthy();
    expect(screen.getByText(/Fee policy failed on-chain/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(exitPoolCreateHistoryMock).toHaveBeenCalledWith({
      history: {},
      destination: "/pools/create/review",
    });
    expect(usePoolCreateDraft.getState().draft?.name).toBe("Kilifi Growers");
  });

  it("shows the live pool address and exits forward to pool detail", async () => {
    usePoolCreateDraft.getState().setDraft({
      name: "Kilifi Growers",
      symbol: "KGP1",
      unitOfAccount: "KES",
      description: "A growers pool.",
      pricing: "oracle",
      feePolicyDefault: "1",
      feesDecoupled: false,
      feeAddress: "",
      location: { locationName: "Kilifi, Kenya", country: "KE", lat: -3.5, lng: 39.9 },
      tags: ["Agriculture"],
      email: "steward@example.org",
      website: "https://kilifi.example",
      phone: "+254712345678",
      terms: "https://kilifi.example/terms",
      acceptedTerms: true,
    });
    state.trackingOutcome = { kind: "success", otx: { txHash: "0xabc" } };
    state.contract = {
      address: "0x1111111111111111111111111111111111111111",
      name: "Kilifi Growers",
      symbol: "KGP1",
      status: "CONFIRMED",
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    const navigatorMock = Object.create(navigator) as Navigator;
    Object.defineProperty(navigatorMock, "clipboard", { value: { writeText } });
    vi.stubGlobal("navigator", navigatorMock);

    renderReceipt();

    expect(screen.getByRole("heading", { name: "KGP1 is live" })).toBeTruthy();
    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText("A growers pool.")).toBeTruthy();
    expect(screen.getByText("https://kilifi.example")).toBeTruthy();
    expect(screen.getByText("Contract address")).toBeTruthy();
    expect(screen.getByText("Transaction hash")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy contract address" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("0x1111111111111111111111111111111111111111"),
    );

    expect(screen.queryByRole("button", { name: "Back to pools" })).toBeNull();
    const viewPool = screen.getByRole("button", { name: "View pool" });
    expect(viewPool.className).toContain("bg-primary");
    fireEvent.click(viewPool);
    expect(exitPoolCreateHistoryMock).toHaveBeenCalledWith({
      history: {},
      destination: "/pools/0x1111111111111111111111111111111111111111",
    });
    expect(usePoolCreateDraft.getState().draft).toBeNull();
  });
});
