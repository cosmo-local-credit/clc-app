import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { exitVoucherCreateHistoryMock, state } = vi.hoisted(() => ({
  exitVoucherCreateHistoryMock: vi.fn(),
  state: {
    contract: null as null | {
      address: `0x${string}` | null;
      name: string;
      symbol: string;
      status: string;
    },
    contractError: null as Error | null,
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
  useOtxTracking: () => ({ outcome: state.trackingOutcome }),
}));

vi.mock("#/features/vouchers/hooks/use-voucher-deployment", () => ({
  useVoucherDeploymentContract: () => ({
    data: state.contract,
    error: state.contractError,
    isError: state.contractError !== null,
  }),
}));

vi.mock("#/lib/navigation/voucher-create-history", () => ({
  exitVoucherCreateHistory: exitVoucherCreateHistoryMock,
}));

import { VoucherDeploymentReceiptPage } from "./voucher-deployment-receipt-page";

function renderReceipt() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VoucherDeploymentReceiptPage trackingId="tracking-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.contract = null;
  state.contractError = null;
  state.trackingOutcome = { kind: "pending" };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("VoucherDeploymentReceiptPage", () => {
  it("shows the publishing state while OTX confirmation is pending", () => {
    renderReceipt();

    expect(screen.getByRole("heading", { name: "Publishing your voucher..." })).toBeTruthy();
    expect(screen.getByText("Voucher contract")).toBeTruthy();
    expect(screen.getByText("In network")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(exitVoucherCreateHistoryMock).toHaveBeenCalledWith({
      history: {},
      destination: "/wallet/vouchers",
    });
  });

  it("waits for the confirmed contract row after the OTX succeeds", () => {
    state.trackingOutcome = { kind: "success", otx: { txHash: "0xabc" } };
    state.contract = {
      address: null,
      name: "Kilifi Harvest",
      symbol: "KHV",
      status: "PENDING",
    };

    renderReceipt();
    expect(screen.getByRole("heading", { name: "Publishing your voucher..." })).toBeTruthy();
  });

  it("shows the live voucher address and exits forward to its detail page", async () => {
    state.trackingOutcome = { kind: "success", otx: { txHash: "0xabc" } };
    state.contract = {
      address: "0x7C41ba09E8d5A62f3b0D14eC7a9F26B8d3510Ee4",
      name: "Kilifi Harvest",
      symbol: "KHV",
      status: "CONFIRMED",
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    const navigatorMock = Object.create(navigator) as Navigator;
    Object.defineProperty(navigatorMock, "clipboard", { value: { writeText } });
    vi.stubGlobal("navigator", navigatorMock);

    renderReceipt();

    expect(screen.getByRole("heading", { name: "KHV is live" })).toBeTruthy();
    expect(screen.getByText("Kilifi Harvest can be held, sent and redeemed.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy contract address" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("0x7C41ba09E8d5A62f3b0D14eC7a9F26B8d3510Ee4"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add to a pool" }));
    expect(exitVoucherCreateHistoryMock).toHaveBeenCalledWith({
      history: {},
      destination: "/pools/",
    });

    fireEvent.click(screen.getByRole("button", { name: "View voucher" }));
    expect(exitVoucherCreateHistoryMock).toHaveBeenCalledWith({
      history: {},
      destination: "/vouchers/0x7C41ba09E8d5A62f3b0D14eC7a9F26B8d3510Ee4?from=vouchers",
    });
  });
});
