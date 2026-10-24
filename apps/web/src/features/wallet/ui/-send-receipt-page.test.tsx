import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  createShare,
  identity,
  navigate,
  offeringsState,
  refetchOfferings,
  refetchVoucher,
  shareState,
  trackRelay,
  useOtxTracking,
  voucherState,
} = vi.hoisted(() => ({
  createShare: vi.fn(),
  identity: {
    data: null as null | {
      name: string;
      alias: string;
      address: string;
      chainId: number;
      kind: "user" | "pool";
    },
  },
  navigate: vi.fn(),
  offeringsState: {
    offerings: [] as Array<Record<string, unknown>>,
    pages: null as null | Array<{ offerings: Array<Record<string, unknown>> }>,
    hasNextPage: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isPending: false,
  },
  refetchOfferings: vi.fn(),
  refetchVoucher: vi.fn(),
  shareState: {
    eligible: true,
    error: null as Error | null,
    isPending: false,
    isSuccess: false,
  },
  trackRelay: vi.fn(),
  useOtxTracking: vi.fn(),
  voucherState: {
    data: undefined as
      | undefined
      | {
          ownerAddress: string | null;
          voucherValue: string | null;
          voucherUoa: string | null;
          symbol: string;
        },
    isError: false,
    isFetching: false,
    isPending: false,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
  useNavigate: () => navigate,
}));

vi.mock("#/features/auth/hooks/use-otx-tracking", () => ({ useOtxTracking }));

vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({
    data: {
      email: "alice@example.com",
      phone: "+254712345678",
      locationName: "Nairobi",
      geoLat: -1.2921,
      geoLng: 36.8219,
    },
    isSuccess: true,
  }),
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useCurrentMarketVoucherDetail: () => ({
    data: voucherState.data,
    isError: voucherState.isError,
    isFetching: voucherState.isFetching,
    isPending: voucherState.isPending,
    refetch: refetchVoucher,
  }),
}));

vi.mock("#/features/home/hooks/use-voucher-offerings", () => ({
  useCurrentVoucherOfferingsInfinite: () => ({
    data: { pages: offeringsState.pages ?? [{ offerings: offeringsState.offerings }] },
    fetchNextPage: vi.fn(),
    hasNextPage: offeringsState.hasNextPage,
    isError: offeringsState.isError,
    isFetching: offeringsState.isFetching,
    isFetchingNextPage: offeringsState.isFetchingNextPage,
    isPending: offeringsState.isPending,
    refetch: refetchOfferings,
  }),
}));

vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => "0xowner",
}));

vi.mock("#/features/wallet/hooks/use-address-book", () => ({
  useAddressBookRecipients: () => ({
    data: [{ label: "Alice", address: RECIPIENT, source: "manual" }],
  }),
}));

vi.mock("#/features/wallet/hooks/use-send-share", () => ({
  useCreateSendShare: () => ({
    error: shareState.error,
    isPending: shareState.isPending,
    isSuccess: shareState.isSuccess,
    mutateAsync: createShare,
  }),
  useSendShareEligibility: () => ({
    data: shareState.eligible,
    isError: false,
    isPending: false,
  }),
}));

vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useReverseRecipientResolution: () => identity,
}));

vi.mock("@clc/api/features/relayer/client", () => ({
  createRelayerClient: () => ({ trackRelay }),
}));

vi.mock("#/components/reviews/redemption-review-prompt", () => ({
  RedemptionReviewPrompt: ({ address }: { address: string }) => (
    <div data-testid="review-prompt">{address}</div>
  ),
}));

import { SendReceiptPage } from "./send-receipt-page";

const RECIPIENT = "0xa316408425cF17F1827483dee621c6C3A9B5fad4";
const TX_HASH = "0x4d8ab3f71c9e052d8a7b1c6e9f0a2d3e4f5a6b7c";
const POOL_ADDRESS = "0x1111111111111111111111111111111111111111";
const TOKEN_ADDRESS = "0x2222222222222222222222222222222222222222";

beforeEach(() => {
  identity.data = null;
  createShare.mockResolvedValue({ id: 1, txHash: TX_HASH });
  shareState.eligible = true;
  shareState.error = null;
  shareState.isPending = false;
  shareState.isSuccess = false;
  voucherState.data = undefined;
  voucherState.isError = false;
  voucherState.isFetching = false;
  voucherState.isPending = false;
  offeringsState.offerings = [];
  offeringsState.pages = null;
  offeringsState.hasNextPage = false;
  offeringsState.isError = false;
  offeringsState.isFetching = false;
  offeringsState.isFetchingNextPage = false;
  offeringsState.isPending = false;
  refetchOfferings.mockResolvedValue(undefined);
  refetchVoucher.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  navigate.mockReset();
  useOtxTracking.mockReset();
  trackRelay.mockReset();
  createShare.mockReset();
  refetchOfferings.mockReset();
  refetchVoucher.mockReset();
});

describe("SendReceiptPage", () => {
  it("shows and shares the pool name passed from a deposit without an address-book entry", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage
        trackingId="tracking-1"
        recipient={POOL_ADDRESS}
        recipientLabel="Trade Pool"
        amount="5"
        symbol="USDC"
        returnPool={POOL_ADDRESS}
      />,
    );

    expect(screen.getByText("Trade Pool")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Share receipt" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0]?.[0].text).toContain("I sent 5 USDC to Trade Pool.");
    Reflect.deleteProperty(navigator, "share");
  });

  it("shares the receipt text with the recipient alias and explorer link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage
        trackingId="tracking-1"
        recipient={RECIPIENT}
        amount="2.13"
        symbol="USDC"
        uoaValue="5.325"
        uoa="KES"
      />,
    );

    expect(screen.getByText("Alice")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /share receipt/i }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = share.mock.calls[0]?.[0] as { text: string };
    expect(payload.text).toContain("2.13 USDC (5.33 KES)");
    expect(payload.text).toContain("Alice");
    expect(payload.text).toContain(`Address: ${RECIPIENT}`);
    expect(payload.text).toContain(TX_HASH);
    Reflect.deleteProperty(navigator, "share");
  });

  it("shows the current backend identity and exact destination in one recipient row", async () => {
    identity.data = {
      kind: "user",
      name: "Alice Updated",
      alias: "alice-new",
      address: RECIPIENT,
      chainId: 100,
    };
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} amount="2.13" symbol="USDC" />,
    );

    expect(screen.getAllByText("Recipient")).toHaveLength(1);
    expect(screen.getByText("alice-new")).toBeTruthy();
    expect(screen.queryByText("Alice Updated")).toBeNull();
    expect(screen.queryByText("Alice")).toBeNull();
    expect(screen.getByText("Recipient").parentElement?.textContent).toContain(RECIPIENT);
  });

  it("offers no share button until the transfer is confirmed", () => {
    useOtxTracking.mockReturnValue({ outcome: { kind: "pending" } });
    render(<SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} />);
    expect(screen.queryByRole("button", { name: /share receipt/i })).toBeNull();
  });

  it("shows the review prompt only after a successful transfer", () => {
    const props = {
      token: "0x1111111111111111111111111111111111111111",
      recipient: RECIPIENT,
      trackingId: "tracking-1",
    };
    useOtxTracking.mockReturnValue({ outcome: { kind: "pending" } });
    const view = render(<SendReceiptPage {...props} />);
    expect(screen.queryByTestId("review-prompt")).toBeNull();
    useOtxTracking.mockReturnValue({ outcome: { kind: "error", error: "Reverted" } });
    view.rerender(<SendReceiptPage {...props} />);
    expect(screen.queryByTestId("review-prompt")).toBeNull();
    useOtxTracking.mockReturnValue({ outcome: { kind: "success", otx: { txHash: TX_HASH } } });
    view.rerender(<SendReceiptPage {...props} />);
    expect(screen.getByTestId("review-prompt").textContent).toBe(props.token);
  });

  it("keeps the submitted valuation snapshot across every receipt outcome", () => {
    const props = {
      trackingId: "tracking-1",
      recipient: RECIPIENT,
      amount: "2.13",
      symbol: "USDC",
      uoaValue: "5.325",
      uoa: "KES",
    };
    useOtxTracking.mockReturnValue({ outcome: { kind: "pending" } });
    const view = render(<SendReceiptPage {...props} />);
    expect(screen.getByText("2.13 USDC (5.33 KES)")).toBeTruthy();

    useOtxTracking.mockReturnValue({ outcome: { kind: "error", error: "Reverted" } });
    view.rerender(<SendReceiptPage {...props} />);
    expect(screen.getByText("2.13 USDC (5.33 KES)")).toBeTruthy();

    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });
    view.rerender(<SendReceiptPage {...props} />);
    expect(screen.getByText("−2.13 USDC (5.33 KES)")).toBeTruthy();
  });

  it("shows a snapshotted unavailable valuation without recalculating it", () => {
    voucherState.data = {
      ownerAddress: RECIPIENT,
      voucherValue: "999",
      voucherUoa: "USD",
      symbol: "USDC",
    };
    useOtxTracking.mockReturnValue({ outcome: { kind: "pending" } });

    render(
      <SendReceiptPage
        trackingId="tracking-1"
        recipient={RECIPIENT}
        amount="2.13"
        symbol="USDC"
        uoaUnavailable
      />,
    );

    expect(screen.getByText("2.13 USDC (Unavailable)")).toBeTruthy();
    expect(document.body.textContent).not.toContain("USD)");
  });

  it("shows a pending on-chain confirmation state while polling the relayer endpoint", async () => {
    useOtxTracking.mockReturnValue({ outcome: { kind: "pending" } });
    trackRelay.mockResolvedValue({ result: { otx: [] } });

    render(
      <SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} amount="2.13" symbol="USDC" />,
    );

    expect(screen.getByText(/waiting for on-chain confirmation/i)).toBeTruthy();
    expect(screen.getByText("2.13 USDC")).toBeTruthy();
    expect(screen.queryByText("Add a private message")).toBeNull();
    expect(useOtxTracking).toHaveBeenCalledWith(
      "tracking-1",
      expect.objectContaining({
        queryKey: "send-relay-track",
        queryFn: expect.any(Function),
      }),
    );

    const options = useOtxTracking.mock.calls[0]?.[1] as {
      queryFn: (trackingId: string) => Promise<unknown>;
    };
    await expect(options.queryFn("tracking-1")).resolves.toEqual({ otx: [] });
    expect(trackRelay).toHaveBeenCalledWith("tracking-1");
  });

  it("offers no way out while the transfer is still settling", () => {
    // The screen replaces itself with the outcome the moment the chain answers.
    // A Done button meanwhile is a way to leave before ever seeing whether the
    // transfer landed — and an easy one to hit by accident.
    useOtxTracking.mockReturnValue({ outcome: { kind: "pending" } });

    render(
      <SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} amount="2.13" symbol="USDC" />,
    );

    expect(screen.queryByRole("button", { name: /done/i })).toBeNull();
  });

  it("shows the sent receipt with a copyable transaction hash once confirmed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "tracking-1",
          otxType: "RELAY_EXEC",
          txHash: TX_HASH,
          nonce: 1,
          replaced: false,
          createdAt: "2026-07-02T10:00:00Z",
          status: "SUCCESS",
        },
      },
    });

    render(
      <SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} amount="2.13" symbol="USDC" />,
    );

    expect(screen.getByRole("heading", { name: /^sent$/i })).toBeTruthy();
    expect(screen.getByText("−2.13 USDC").parentElement?.className).toContain("text-destructive");
    expect(screen.getByText(/submitted/i)).toBeTruthy();
    expect(screen.queryByText("2026-07-02T10:00:00Z")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /copy transaction hash/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TX_HASH));
  });

  it("adds a private message only after the send is confirmed", async () => {
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "tracking-1",
          otxType: "RELAY_EXEC",
          txHash: TX_HASH,
          nonce: 1,
          replaced: false,
          createdAt: "2026-07-02T10:00:00Z",
          status: "SUCCESS",
        },
      },
    });

    render(
      <SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} amount="2.13" symbol="USDC" />,
    );

    fireEvent.click(screen.getByText("Add a private message"));
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Thanks for the delivery" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /email/i }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(createShare).toHaveBeenCalledWith({
        permission: 1,
        note: "Thanks for the delivery",
      }),
    );
  });

  it("offers an optional three-item order after a confirmed send to the voucher owner", async () => {
    voucherState.data = {
      ownerAddress: RECIPIENT,
      voucherValue: "2",
      voucherUoa: "KES",
      symbol: "MZ",
    };
    offeringsState.offerings = [
      {
        id: "offering-1",
        voucherAddress: TOKEN_ADDRESS,
        voucherSymbol: "MZ",
        name: "Maize flour",
        unitLabel: "bag",
        pricePerUnit: "10",
      },
    ];
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage
        token={TOKEN_ADDRESS}
        trackingId="tracking-1"
        recipient={RECIPIENT}
        amount="2.13"
        symbol="MZ"
      />,
    );

    fireEvent.click(screen.getByText("Add a message or place an order"));
    fireEvent.click(screen.getByRole("checkbox", { name: /Add Maize flour to order/ }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Maize flour quantity" }));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Friday please" } });

    expect(screen.getAllByText("40 KES")).toHaveLength(2);
    expect(screen.getByText("−2.13 MZ")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(createShare).toHaveBeenCalledWith({
        permission: 0,
        note: "Order\n- 2 × Maize flour @ 20 KES / bag = 40 KES\nOrder total: 40 KES\n\nMessage: Friday please",
      }),
    );
  });

  it("includes current offerings discovered on later pages", () => {
    voucherState.data = {
      ownerAddress: RECIPIENT,
      voucherValue: "1",
      voucherUoa: "KES",
      symbol: "MZ",
    };
    offeringsState.pages = [
      {
        offerings: [
          {
            id: "offering-1",
            voucherAddress: TOKEN_ADDRESS,
            voucherSymbol: "MZ",
            name: "First page",
            unitLabel: "item",
            pricePerUnit: "10",
          },
        ],
      },
      {
        offerings: [
          {
            id: "offering-2",
            voucherAddress: TOKEN_ADDRESS,
            voucherSymbol: "MZ",
            name: "Second page",
            unitLabel: "item",
            pricePerUnit: "20",
          },
        ],
      },
    ];
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage
        token={TOKEN_ADDRESS}
        trackingId="tracking-1"
        recipient={RECIPIENT}
        symbol="MZ"
      />,
    );

    fireEvent.click(screen.getByText("Add a message or place an order"));
    expect(screen.getByRole("checkbox", { name: /Add Second page to order/ })).toBeTruthy();
  });

  it("allows an owner offering with no fixed price to be ordered", async () => {
    voucherState.data = {
      ownerAddress: RECIPIENT,
      voucherValue: "2",
      voucherUoa: "KES",
      symbol: "MZ",
    };
    offeringsState.offerings = [
      {
        id: "offering-1",
        voucherAddress: TOKEN_ADDRESS,
        voucherSymbol: "MZ",
        name: "Price by arrangement",
        unitLabel: "item",
        pricePerUnit: null,
      },
    ];
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage
        token={TOKEN_ADDRESS}
        trackingId="tracking-1"
        recipient={RECIPIENT}
        symbol="MZ"
      />,
    );

    fireEvent.click(screen.getByText("Add a message or place an order"));
    fireEvent.click(screen.getByRole("checkbox", { name: /Add Price by arrangement to order/ }));

    expect(screen.getByText("Order total").parentElement?.textContent).toContain(
      "Price on request",
    );
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(createShare).toHaveBeenCalledWith({
        permission: 0,
        note: "Order\n- 1 × Price by arrangement @ Price on request / item = Price on request\nOrder total: Price on request",
      }),
    );
  });

  it("keeps the ordinary private-message action when the owner has no public offerings", () => {
    voucherState.data = {
      ownerAddress: RECIPIENT,
      voucherValue: "2",
      voucherUoa: "KES",
      symbol: "MZ",
    };
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage
        token={TOKEN_ADDRESS}
        trackingId="tracking-1"
        recipient={RECIPIENT}
        symbol="MZ"
      />,
    );

    expect(screen.getByText("Add a private message")).toBeTruthy();
    expect(screen.queryByText("Order (optional)")).toBeNull();
  });

  it("excludes unavailable offerings from the order", () => {
    voucherState.data = {
      ownerAddress: RECIPIENT,
      voucherValue: "2",
      voucherUoa: "KES",
      symbol: "MZ",
    };
    offeringsState.offerings = [
      {
        id: "offering-1",
        voucherAddress: TOKEN_ADDRESS,
        voucherSymbol: "MZ",
        name: "Unavailable service",
        unitLabel: "item",
        pricePerUnit: "10",
        available: false,
      },
    ];
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage
        token={TOKEN_ADDRESS}
        trackingId="tracking-1"
        recipient={RECIPIENT}
        symbol="MZ"
      />,
    );

    expect(screen.getByText("Add a private message")).toBeTruthy();
    expect(screen.queryByText("Order (optional)")).toBeNull();
    expect(screen.queryByText("Unavailable service")).toBeNull();
  });

  it("keeps the ordinary private-message action when the recipient is not the current owner", () => {
    voucherState.data = {
      ownerAddress: "0x9999999999999999999999999999999999999999",
      voucherValue: "2",
      voucherUoa: "KES",
      symbol: "MZ",
    };
    offeringsState.offerings = [
      {
        id: "offering-1",
        voucherAddress: TOKEN_ADDRESS,
        voucherSymbol: "MZ",
        name: "Not for this recipient",
        unitLabel: "item",
        pricePerUnit: "10",
      },
    ];
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage
        token={TOKEN_ADDRESS}
        trackingId="tracking-1"
        recipient={RECIPIENT}
        symbol="MZ"
      />,
    );

    expect(screen.getByText("Add a private message")).toBeTruthy();
    expect(screen.queryByText("Order (optional)")).toBeNull();
  });

  it("shows order verification while current offerings load", () => {
    voucherState.data = {
      ownerAddress: RECIPIENT,
      voucherValue: "2",
      voucherUoa: "KES",
      symbol: "MZ",
    };
    offeringsState.isFetching = true;
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage
        token={TOKEN_ADDRESS}
        trackingId="tracking-1"
        recipient={RECIPIENT}
        symbol="MZ"
      />,
    );

    expect(screen.getByText("Checking order availability…")).toBeTruthy();
  });

  it("shows order verification instead of silently falling back while current data loads", () => {
    voucherState.data = {
      ownerAddress: RECIPIENT,
      voucherValue: "2",
      voucherUoa: "KES",
      symbol: "MZ",
    };
    voucherState.isFetching = true;
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage
        token={TOKEN_ADDRESS}
        trackingId="tracking-1"
        recipient={RECIPIENT}
        symbol="MZ"
      />,
    );

    expect(screen.getByText("Checking order availability…")).toBeTruthy();
    expect(screen.queryByText("Add a private message")).toBeNull();
  });

  it("keeps messaging available and retries a failed voucher-owner check", () => {
    voucherState.isError = true;
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage
        token={TOKEN_ADDRESS}
        trackingId="tracking-1"
        recipient={RECIPIENT}
        symbol="MZ"
      />,
    );

    expect(screen.getByText("Add a private message")).toBeTruthy();
    expect(screen.getByText("Couldn't check order availability.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchVoucher).toHaveBeenCalledTimes(1);
  });

  it("keeps messaging available and retries a failed offerings check", () => {
    voucherState.data = {
      ownerAddress: RECIPIENT,
      voucherValue: "2",
      voucherUoa: "KES",
      symbol: "MZ",
    };
    offeringsState.isError = true;
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage
        token={TOKEN_ADDRESS}
        trackingId="tracking-1"
        recipient={RECIPIENT}
        symbol="MZ"
      />,
    );

    expect(screen.getByText("Add a private message")).toBeTruthy();
    expect(screen.getByText("Couldn't check order availability.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchOfferings).toHaveBeenCalledTimes(1);
  });

  it("shows the retry state when loading a later offerings page fails", () => {
    voucherState.data = {
      ownerAddress: RECIPIENT,
      voucherValue: "2",
      voucherUoa: "KES",
      symbol: "MZ",
    };
    offeringsState.hasNextPage = true;
    offeringsState.isError = true;
    useOtxTracking.mockReturnValue({
      outcome: { kind: "success", otx: { txHash: TX_HASH, createdAt: "" } },
    });

    render(
      <SendReceiptPage
        token={TOKEN_ADDRESS}
        trackingId="tracking-1"
        recipient={RECIPIENT}
        symbol="MZ"
      />,
    );

    expect(screen.queryByText("Checking order availability…")).toBeNull();
    expect(screen.getByText("Couldn't check order availability.")).toBeTruthy();
    expect(screen.getByText("Add a private message")).toBeTruthy();
  });

  it("explains when the confirmed recipient cannot receive a private message", () => {
    shareState.eligible = false;
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "tracking-1",
          otxType: "RELAY_EXEC",
          txHash: TX_HASH,
          nonce: 1,
          replaced: false,
          createdAt: "2026-07-02T10:00:00Z",
          status: "SUCCESS",
        },
      },
    });

    render(<SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} />);

    expect(screen.getByText(/only for registered Cosmo users/i)).toBeTruthy();
    expect(screen.queryByText("Add a private message")).toBeNull();
  });

  it("Done replaces the receipt with the Wallet destination", () => {
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "tracking-1",
          otxType: "RELAY_EXEC",
          txHash: TX_HASH,
          nonce: 1,
          replaced: false,
          createdAt: "2026-07-02T10:00:00Z",
          status: "SUCCESS",
        },
      },
    });

    render(
      <SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} amount="2.13" symbol="USDC" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/",
      search: { tab: "wallet" },
      replace: true,
    });
  });

  it("returns a pool deposit to that pool instead of the wallet", () => {
    // The flow pushed the amount form and this receipt between the pool and
    // here, so Back is the wrong instrument — the param names the destination.
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "tracking-1",
          otxType: "RELAY_EXEC",
          txHash: TX_HASH,
          nonce: 1,
          replaced: false,
          createdAt: "2026-07-02T10:00:00Z",
          status: "SUCCESS",
        },
      },
    });

    render(
      <SendReceiptPage
        trackingId="tracking-1"
        recipient={POOL_ADDRESS}
        amount="2.13"
        symbol="USDC"
        returnPool={POOL_ADDRESS}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /back to pool/i }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/pools/$poolAddress",
      params: { poolAddress: POOL_ADDRESS },
      replace: true,
    });
  });

  it("does not render fabricated receipt data when fields are absent", () => {
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "tracking-1",
          otxType: "RELAY_EXEC",
          txHash: "",
          nonce: 1,
          replaced: false,
          createdAt: "",
          status: "SUCCESS",
        },
      },
    });

    render(<SendReceiptPage trackingId="tracking-1" />);

    expect(screen.queryByText("25.00 USDC")).toBeNull();
    expect(screen.queryByRole("button", { name: /copy transaction hash/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /celoscan/i })).toBeNull();
    expect(screen.queryByText(/^To$/)).toBeNull();
  });

  it("shows a reverted state when tracking returns an error", () => {
    useOtxTracking.mockReturnValue({ outcome: { kind: "error", error: "Transaction reverted" } });

    render(
      <SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} amount="2.13" symbol="USDC" />,
    );

    expect(screen.getAllByText(/reverted/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/transaction reverted/i)).toBeTruthy();
  });
});
