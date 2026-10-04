import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

type TrackingOutcome =
  | { kind: "pending" }
  | { kind: "success"; otx: { txHash: string } }
  | { kind: "error"; error: string };

const {
  exitVoucherCreateHistoryMock,
  mintMock,
  navigateMock,
  refetchSupplyMock,
  refetchTrackingMock,
  toastErrorMock,
  state,
} = vi.hoisted(() => ({
  exitVoucherCreateHistoryMock: vi.fn(),
  mintMock: vi.fn(),
  navigateMock: vi.fn(),
  refetchSupplyMock: vi.fn(),
  refetchTrackingMock: vi.fn(),
  toastErrorMock: vi.fn(),
  state: {
    contract: null as null | {
      address: `0x${string}` | null;
      name: string;
      symbol: string;
      status: string;
      decimals: number | null;
      admin: `0x${string}` | null;
    },
    contractError: null as Error | null,
    trackingOutcome: { kind: "pending" } as TrackingOutcome,
    mintTrackingOutcome: { kind: "pending" } as TrackingOutcome,
    mintTrackingQueryError: null as Error | null,
    supplyRaw: "0" as string | undefined,
    supplyError: null as Error | null,
    voucherValue: null as string | null,
    voucherUoa: null as string | null,
    walletAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as `0x${string}` | undefined,
    delegationStatus: "delegated" as "checking" | "delegated" | "not-delegated",
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ history: {} }),
  useNavigate: () => navigateMock,
}));

vi.mock("sonner", () => ({ toast: { error: toastErrorMock, success: vi.fn() } }));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: state.walletAddress }),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => state.delegationStatus,
}));

vi.mock("#/features/vouchers/hooks/use-voucher-supply", () => ({
  useVoucherSupply: () => ({
    data: state.supplyRaw,
    error: state.supplyError,
    isError: state.supplyError !== null,
    isPending: state.supplyRaw === undefined && state.supplyError === null,
    refetch: refetchSupplyMock,
  }),
}));

vi.mock("#/features/vouchers/hooks/use-voucher-mint", () => ({
  useVoucherMint: () => ({ mutateAsync: mintMock, isPending: false }),
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({
    data:
      state.voucherValue && state.voucherUoa
        ? { voucherValue: state.voucherValue, voucherUoa: state.voucherUoa }
        : undefined,
  }),
}));

vi.mock("#/features/auth/hooks/use-otx-tracking", () => ({
  useOtxTracking: (_trackingId: string | null, options?: { queryKey?: string }) =>
    options?.queryKey === "voucher-mint-track"
      ? {
          outcome: state.mintTrackingQueryError
            ? { kind: "error", error: state.mintTrackingQueryError.message }
            : state.mintTrackingOutcome,
          error: state.mintTrackingQueryError,
          isError: state.mintTrackingQueryError !== null,
          refetch: refetchTrackingMock,
        }
      : { outcome: state.trackingOutcome, isError: false },
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

function renderReceipt({
  mintTrackingId,
  mintAmount,
}: { mintTrackingId?: string; mintAmount?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VoucherDeploymentReceiptPage
        trackingId="tracking-1"
        mintTrackingId={mintTrackingId}
        mintAmount={mintAmount}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useVoucherCreateDraft.getState().clearDraft();
  state.contract = null;
  state.contractError = null;
  state.trackingOutcome = { kind: "pending" };
  state.mintTrackingOutcome = { kind: "pending" };
  state.mintTrackingQueryError = null;
  state.supplyRaw = "0";
  state.supplyError = null;
  state.voucherValue = null;
  state.voucherUoa = null;
  state.walletAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  state.delegationStatus = "delegated";
  mintMock.mockResolvedValue({ trackingId: "mint-1", signatureType: "webauthn" });
  navigateMock.mockResolvedValue(undefined);
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
      decimals: 6,
      admin: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
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
      supply: "1000",
      location: { locationName: "Kilifi, Kenya", country: "KE", lat: -3.5, lng: 39.9 },
      tags: ["Agriculture"],
      email: "issuer@example.org",
      website: "https://kilifi.example",
      phone: "+254712345678",
      terms: "https://kilifi.example/terms",
      markerIcon: null,
      markerColor: null,
      acceptedTerms: true,
    });
    state.trackingOutcome = { kind: "success", otx: { txHash: "0xabc" } };
    state.contract = {
      address: "0x7C41ba09E8d5A62f3b0D14eC7a9F26B8d3510Ee4",
      name: "Kilifi Harvest",
      symbol: "KHV",
      status: "CONFIRMED",
      decimals: 6,
      admin: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    };
    state.mintTrackingOutcome = { kind: "success", otx: { txHash: "0xmint" } };
    const writeText = vi.fn().mockResolvedValue(undefined);
    const navigatorMock = Object.create(navigator) as Navigator;
    Object.defineProperty(navigatorMock, "clipboard", { value: { writeText } });
    vi.stubGlobal("navigator", navigatorMock);

    renderReceipt({ mintTrackingId: "mint-1", mintAmount: "100" });

    expect(screen.getByRole("heading", { name: "Kilifi Harvest is live" })).toBeTruthy();
    expect(screen.getByText("Kilifi Harvest can be held, sent and redeemed.")).toBeTruthy();
    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText("100 KES")).toBeTruthy();
    expect(screen.getByText("Standard")).toBeTruthy();
    expect(screen.getByText("Decimals")).toBeTruthy();
    expect(screen.getByText("Contract address")).toBeTruthy();
    expect(screen.queryByText("Fresh food from Kilifi producers.")).toBeNull();
    expect(screen.queryByText("https://kilifi.example")).toBeNull();
    expect(screen.queryByText("Kilifi, Kenya")).toBeNull();
    expect(screen.getByText("Deployment transaction")).toBeTruthy();
    expect(screen.getByText("Supply creation transaction")).toBeTruthy();
    const advancedDetails = screen.getByText("Advanced details").closest("details");
    expect(advancedDetails?.open).toBe(false);
    expect(advancedDetails?.textContent).toContain("Deployment transaction");
    expect(advancedDetails?.textContent).toContain("Supply creation transaction");
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

describe("VoucherDeploymentReceiptPage mint gate", () => {
  const confirmedContract = {
    address: "0x7C41ba09E8d5A62f3b0D14eC7a9F26B8d3510Ee4" as `0x${string}`,
    name: "Kilifi Harvest",
    symbol: "KHV",
    status: "CONFIRMED",
    decimals: 6,
    admin: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as `0x${string}`,
  };

  beforeEach(() => {
    state.trackingOutcome = { kind: "success", otx: { txHash: "0xabc" } };
    state.contract = { ...confirmedContract };
  });

  it("holds the flow on the mint step until the issuer mints", () => {
    renderReceipt();

    expect(screen.getByRole("heading", { name: "Kilifi Harvest is deployed" })).toBeTruthy();
    expect(screen.getByLabelText("Create vouchers")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create supply" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View voucher" })).toBeNull();

    const advancedDetails = screen.getByText("Advanced details").closest("details");
    expect(advancedDetails?.open).toBe(false);
    expect(advancedDetails?.textContent).toContain("Contract address");
  });

  it("shows the value of the vouchers to create in the draft's unit of account", () => {
    useVoucherCreateDraft.getState().setDraft({
      name: "Kilifi Harvest",
      symbol: "KHV",
      price: "2.5",
      unitOfAccount: "KES",
      description: "Fresh food from Kilifi producers.",
      voucherType: "standard",
      expiryDate: "",
      decimals: "6",
      supply: "1000",
      location: { locationName: "Kilifi, Kenya", country: "KE", lat: -3.5, lng: 39.9 },
      tags: ["Agriculture"],
      email: "issuer@example.org",
      website: "",
      phone: "",
      terms: "",
      markerIcon: null,
      markerColor: null,
      acceptedTerms: true,
    });
    renderReceipt();

    fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "12" } });

    expect(screen.getByText("Value: 30 KES")).toBeTruthy();
  });

  it("waits for an on-chain supply check before enabling mint", () => {
    state.supplyRaw = undefined;
    renderReceipt();

    expect(
      (screen.getByRole("button", { name: "Checking supply…" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("recovers a completed mint from on-chain supply after refresh", () => {
    state.supplyRaw = "10000000000";
    state.voucherValue = "1";
    state.voucherUoa = "KES";

    renderReceipt();

    expect(screen.getByRole("heading", { name: "Kilifi Harvest is live" })).toBeTruthy();
    expect(screen.getByText("10000 KES")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create supply" })).toBeNull();
  });

  it("rejects a supply of zero without relaying anything", () => {
    renderReceipt();

    fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Create supply" }));

    expect(screen.getByText("Supply must be greater than zero")).toBeTruthy();
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("rejects a supply finer than the voucher's decimals", () => {
    state.contract = { ...confirmedContract, decimals: 2 };
    renderReceipt();

    fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "1.234" } });
    fireEvent.click(screen.getByRole("button", { name: "Create supply" }));

    expect(
      screen.getByText("Supply has more decimal places than this voucher supports"),
    ).toBeTruthy();
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("mints the scaled supply to the issuer's own wallet", async () => {
    renderReceipt();

    fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create supply" }));

    await waitFor(() =>
      expect(mintMock).toHaveBeenCalledWith({
        tokenAddress: confirmedContract.address,
        ownerAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        amountRaw: "10000000000",
        includeAuthorization: false,
      }),
    );
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/vouchers/create/receipt",
      search: {
        trackingId: "tracking-1",
        mintTrackingId: "mint-1",
        mintAmount: "10000",
      },
      replace: true,
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Creating…" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "View voucher" })).toBeNull();
  });

  it("mints the supply chosen during creation as soon as the contract confirms", async () => {
    renderReceipt({ mintAmount: "2500" });

    await waitFor(() =>
      expect(mintMock).toHaveBeenCalledWith({
        tokenAddress: confirmedContract.address,
        ownerAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        amountRaw: "2500000000",
        includeAuthorization: false,
      }),
    );
    expect(mintMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/vouchers/create/receipt",
      search: { trackingId: "tracking-1", mintTrackingId: "mint-1", mintAmount: "2500" },
      replace: true,
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Creating…" })).toBeTruthy());
  });

  it("does not auto-mint while the on-chain supply is still being read", () => {
    state.supplyRaw = undefined;
    renderReceipt({ mintAmount: "2500" });

    expect(mintMock).not.toHaveBeenCalled();
  });

  it("does not auto-mint again when a mint is already being tracked", () => {
    renderReceipt({ mintTrackingId: "mint-1", mintAmount: "2500" });

    expect(mintMock).not.toHaveBeenCalled();
  });

  it("shows the chosen supply as a row, not a second input, and waits for the owner", () => {
    state.walletAddress = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
    renderReceipt({ mintAmount: "2500" });

    expect(mintMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Create vouchers")).toBeNull();
    expect(screen.getByText("Supply").nextElementSibling?.textContent).toBe("2500 KHV");
    expect(screen.getByRole("button", { name: "Create supply" })).toBeTruthy();
  });

  it("submits at most one mint while the relay request is unresolved", () => {
    mintMock.mockReturnValue(new Promise(() => undefined));
    renderReceipt();

    fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "10000" } });
    const button = screen.getByRole("button", { name: "Create supply" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mintMock).toHaveBeenCalledOnce();
  });

  it("offers a retry when the relayed mint reverts, still without an exit", () => {
    state.mintTrackingOutcome = {
      kind: "error",
      error: "Transaction failed on-chain (REVERTED).",
    };

    renderReceipt();

    expect(screen.getByRole("heading", { name: "Creation failed" })).toBeTruthy();
    expect(screen.getByText("Transaction failed on-chain (REVERTED).")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View voucher" })).toBeNull();
  });

  it("rechecks tracking instead of resubmitting after a transport error", () => {
    state.mintTrackingQueryError = new Error("Relay status is temporarily unavailable");

    renderReceipt({ mintTrackingId: "mint-1", mintAmount: "500" });

    fireEvent.click(screen.getByRole("button", { name: "Check creation status" }));
    expect(refetchTrackingMock).toHaveBeenCalledOnce();
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("blocks minting when the connected wallet is not the deployed voucher owner", () => {
    state.walletAddress = "0x1111111111111111111111111111111111111111";

    renderReceipt();

    expect(
      screen.getByText("Reconnect the wallet that published this voucher to create its supply."),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Create supply" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("blocks minting until wallet delegation has been checked", () => {
    state.delegationStatus = "checking";

    renderReceipt();

    expect(
      (screen.getByRole("button", { name: "Preparing wallet…" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("surfaces a relay rejection as a toast and keeps the mint step open", async () => {
    mintMock.mockRejectedValueOnce(new Error("Credential is stale; re-authenticate"));
    renderReceipt();

    fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Create supply" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("Credential is stale; re-authenticate"),
    );
    expect(screen.getByRole("button", { name: "Create supply" })).toBeTruthy();
  });

  it("releases the flow once the mint confirms, showing what was minted", () => {
    state.mintTrackingOutcome = { kind: "success", otx: { txHash: "0xmint" } };
    state.voucherValue = "1";
    state.voucherUoa = "KES";

    renderReceipt({ mintTrackingId: "mint-1", mintAmount: "500" });

    expect(screen.getByRole("heading", { name: "Kilifi Harvest is live" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View voucher" })).toBeTruthy();
    expect(screen.queryByLabelText("Create vouchers")).toBeNull();
    expect(screen.getByText("500 KES")).toBeTruthy();
  });
});
