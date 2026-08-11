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

vi.mock("#/hooks/use-deployment", () => ({
  useDeploymentContract: () => ({
    data: state.contract,
    error: state.contractError,
    isError: state.contractError !== null,
  }),
}));

vi.mock("#/lib/navigation/voucher-create-history", () => ({
  exitVoucherCreateHistory: exitVoucherCreateHistoryMock,
}));

import { VoucherDeploymentReceiptPage } from "./voucher-deployment-receipt-page";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";

function renderReceipt() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VoucherDeploymentReceiptPage trackingId="tracking-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useVoucherCreateDraft.getState().clearDraft();
  state.contract = null;
  state.contractError = null;
  state.trackingOutcome = { kind: "pending" };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  useVoucherCreateDraft.getState().clearDraft();
});

describe("VoucherDeploymentReceiptPage", () => {
  it("shows the publishing state while OTX confirmation is pending", () => {
    renderReceipt();

    expect(screen.getByRole("heading", { name: "Publishing your voucher..." })).toBeTruthy();
    expect(screen.getByText("Voucher contract")).toBeTruthy();
    expect(screen.getByText("In network")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
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
    useVoucherCreateDraft.getState().setDraft({
      name: "Kilifi Harvest",
      symbol: "KHV",
      price: "1",
      unitOfAccount: "KES",
      description: "Fresh food from Kilifi producers.",
      voucherType: "standard",
      expiryDate: "",
      decimals: "6",
      location: { locationName: "Kilifi, Kenya", country: "KE", lat: -3.5, lng: 39.9 },
      tags: ["Agriculture"],
      email: "issuer@example.org",
      website: "https://kilifi.example",
      phone: "+254712345678",
      acceptedTerms: true,
      acceptedPathLicense: true,
    });
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
    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText("Fresh food from Kilifi producers.")).toBeTruthy();
    expect(screen.getByText("https://kilifi.example")).toBeTruthy();
    expect(screen.getByText("Contract address")).toBeTruthy();
    expect(screen.getByText("Transaction hash")).toBeTruthy();
    const copyAddress = screen.getByRole("button", { name: "Copy contract address" });
    const copyIcon = copyAddress.querySelector("svg");
    expect(copyIcon?.parentElement?.classList).toContain("size-6");
    expect(copyIcon?.classList).toContain("size-3");
    fireEvent.click(copyAddress);
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("0x7C41ba09E8d5A62f3b0D14eC7a9F26B8d3510Ee4"),
    );

    expect(screen.queryByRole("button", { name: "Add to a pool" })).toBeNull();
    const viewVoucher = screen.getByRole("button", { name: "View voucher" });
    expect(viewVoucher.className).toContain("bg-primary");
    fireEvent.click(viewVoucher);
    expect(exitVoucherCreateHistoryMock).toHaveBeenCalledWith({
      history: {},
      destination: "/vouchers/0x7C41ba09E8d5A62f3b0D14eC7a9F26B8d3510Ee4?from=vouchers",
    });
    expect(useVoucherCreateDraft.getState().draft).toBeNull();
  });
});
