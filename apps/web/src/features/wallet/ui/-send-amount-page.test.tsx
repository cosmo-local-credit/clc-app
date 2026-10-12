import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { delegationStatus, navigate, sendMutateAsync, sendVoucherState, voucherDetails } =
  vi.hoisted(() => ({
    delegationStatus: { value: "delegated" as "checking" | "delegated" | "not-delegated" },
    navigate: vi.fn(),
    sendMutateAsync: vi.fn(),
    sendVoucherState: { error: null as Error | null, isPending: false },
    voucherDetails: {
      data: new Map<string, { voucherValue: string | null; voucherUoa: string | null }>(),
      errors: new Set<string>(),
      pending: new Set<string>(),
    },
  }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
  useNavigate: () => navigate,
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => delegationStatus.value,
}));

vi.mock("#/features/wallet/hooks/use-send-voucher-transfer", () => ({
  useSendVoucherTransfer: () => ({
    mutateAsync: sendMutateAsync,
    isPending: sendVoucherState.isPending,
    error: sendVoucherState.error,
  }),
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: (address: string | undefined) => {
    const key = address?.toLowerCase() ?? "";
    return {
      data: voucherDetails.data.get(key),
      isError: voucherDetails.errors.has(key),
      isFetching: voucherDetails.pending.has(key),
      isPending: voucherDetails.pending.has(key),
    };
  },
}));

import { SendAmountPage } from "./send-amount-page";

const USDC = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const BABAS = "0xBaba5Eed3c1D7f3A0b6C2e8F4d1a9F57c3b2C0de";
const RECIPIENT = "0xa316408425cF17F1827483dee621c6C3A9B5fad4";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockTokens({ usdcBalance = "245000000" }: { usdcBalance?: string } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "",
      text: () =>
        Promise.resolve(
          JSON.stringify({
            ok: true,
            result: {
              tokens: [
                {
                  id: 1,
                  tokenAddress: USDC,
                  tokenSymbol: "USDC",
                  tokenName: "USD Coin",
                  tokenDecimals: 6,
                  balance: usdcBalance,
                  iconUrl: null,
                  lastDateBlock: "2026-07-01T12:20:29Z",
                },
                {
                  id: 2,
                  tokenAddress: BABAS,
                  tokenSymbol: "BABAS",
                  tokenName: "Baba's Vouchers",
                  tokenDecimals: 6,
                  balance: "1850000000",
                  iconUrl: null,
                  lastDateBlock: "2026-07-01T12:20:29Z",
                },
              ],
            },
          }),
        ),
    }),
  );
}

function setVoucherDetail(
  address: string,
  detail: { voucherValue: string | null; voucherUoa: string | null },
) {
  voucherDetails.data.set(address.toLowerCase(), detail);
}

function getTokenSelector(): HTMLButtonElement {
  const selector = screen
    .getAllByRole("button")
    .find((button) => button.textContent?.includes("Balance"));
  if (!selector) throw new Error("Token selector was not rendered");
  return selector as HTMLButtonElement;
}

beforeEach(() => {
  delegationStatus.value = "delegated";
  sendVoucherState.error = null;
  sendVoucherState.isPending = false;
  voucherDetails.data.clear();
  voucherDetails.errors.clear();
  voucherDetails.pending.clear();
  sendMutateAsync.mockResolvedValue({ trackingId: "tracking-1", signatureType: "secp256k1" });
});

afterEach(() => {
  vi.restoreAllMocks();
  navigate.mockReset();
  sendMutateAsync.mockReset();
});

describe("SendAmountPage", () => {
  // The "Use max" button reflects the selected token's balance uniquely — the
  // symbol itself appears in the picker list too, so it isn't a clean signal.
  it("starts with an empty amount", async () => {
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" />,
    );

    await screen.findByRole("button", { name: /use max · 245/i });

    expect((screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: /^send$/i }).hasAttribute("disabled")).toBe(true);
  });

  it("seeds the amount from a shortcut that already chose one", async () => {
    // What the post-swap "Send" button hands this screen: token and amount both
    // decided, leaving only the recipient.
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" amount="12.50" />,
    );

    await screen.findByRole("button", { name: /use max · 245/i });
    const input = screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement;
    expect(input.value).toBe("12.50");
    expect(screen.getByRole("button", { name: /^send$/i }).hasAttribute("disabled")).toBe(false);

    // Seeded, not controlled: typing over it must stick.
    fireEvent.change(input, { target: { value: "3" } });
    expect(input.value).toBe("3");
  });

  it("shows the exact live value in the voucher's unit of account", async () => {
    setVoucherDetail(USDC, { voucherValue: "2.5", voucherUoa: " KES " });
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" />,
    );

    await screen.findByRole("button", { name: /use max · 245/i });
    const input = screen.getByRole("textbox", { name: /amount/i });
    fireEvent.change(input, { target: { value: "4.20" } });

    expect(screen.getByText("(10.50 KES)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(screen.getByText("4.20 USDC (10.50 KES)")).toBeTruthy();
  });

  it("preserves the amount and focuses it after selecting a voucher", async () => {
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" amount="12.50" />,
    );

    await screen.findByRole("button", { name: /use max · 245/i });
    const amountInput = screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement;
    fireEvent.click(getTokenSelector());
    fireEvent.click(await screen.findByRole("button", { name: /BABAS/i }));

    await waitFor(() => expect(document.activeElement).toBe(amountInput));
    expect(amountInput.value).toBe("12.50");
    expect(screen.getByRole("button", { name: /use max · 1850/i })).toBeTruthy();
  });

  it("focuses the amount even when the current voucher is selected again", async () => {
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" amount="7" />,
    );

    await screen.findByRole("button", { name: /use max · 245/i });
    const amountInput = screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement;
    fireEvent.click(getTokenSelector());
    fireEvent.click(await screen.findByRole("button", { name: /USDC USD Coin/i }));

    await waitFor(() => expect(document.activeElement).toBe(amountInput));
    expect(amountInput.value).toBe("7");
  });

  it("restores focus to the voucher selector when selection is cancelled", async () => {
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" />,
    );

    await screen.findByRole("button", { name: /use max · 245/i });
    const selector = getTokenSelector();
    fireEvent.click(selector);
    fireEvent.click(await screen.findByRole("button", { name: /^cancel$/i }));

    await waitFor(() => expect(document.activeElement).toBe(selector));
    expect(document.activeElement).not.toBe(screen.getByRole("textbox", { name: /amount/i }));
  });

  it("does not retain the old voucher valuation while a new one loads", async () => {
    setVoucherDetail(USDC, { voucherValue: "2", voucherUoa: "KES" });
    voucherDetails.pending.add(BABAS.toLowerCase());
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" amount="3" />,
    );

    await screen.findByText("(6.00 KES)");
    fireEvent.click(getTokenSelector());
    fireEvent.click(await screen.findByRole("button", { name: /BABAS/i }));

    expect(await screen.findByText("(Loading…)")).toBeTruthy();
    expect(screen.queryByText("(6.00 KES)")).toBeNull();
    expect(screen.getByRole("button", { name: /^send$/i }).hasAttribute("disabled")).toBe(false);
  });

  it("shows unavailable valuation without blocking a valid send", async () => {
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" amount="3" />,
    );

    expect(await screen.findByText("(Unavailable)")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^send$/i }).hasAttribute("disabled")).toBe(false);
  });

  it("makes the whole tile a label for the amount field", async () => {
    // `field-sizing:content` leaves an empty input a few pixels wide, so the
    // card has to be the hit target or the field is unfindable. It is a real
    // label rather than a pointer handler: a handler has to preventDefault to
    // stop the press blurring the field, and iOS Safari in an installed PWA
    // then raises the keypad for the programmatic focus and dismisses it again
    // on touch end.
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" />,
    );

    const maxButton = await screen.findByRole("button", { name: /use max · 245/i });
    const input = screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement;
    const tile = maxButton.parentElement as HTMLElement;
    const label = tile.querySelector("label");

    expect(input.id).toBeTruthy();
    expect(label?.getAttribute("for")).toBe(input.id);

    // An overlay under the tile's own controls, not a wrapper around them: a
    // label may hold only its own labelled control, and one wrapping Max would
    // be invalid and would swallow its presses. The input stays outside it too,
    // so a tap on a digit still puts the caret there.
    expect(label?.contains(maxButton)).toBe(false);
    expect(label?.contains(input)).toBe(false);
  });

  it("carries the originating pool through to the receipt", async () => {
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage
        token={USDC}
        recipient={RECIPIENT}
        recipientLabel="Trade Pool"
        returnPool={RECIPIENT}
      />,
    );

    await screen.findByRole("button", { name: /use max · 245/i });
    fireEvent.change(screen.getByRole("textbox", { name: /amount/i }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm and send/i }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/wallet/send/receipt",
        search: {
          trackingId: "tracking-1",
          token: USDC,
          recipient: RECIPIENT,
          amount: "5",
          symbol: "USDC",
          uoaUnavailable: true,
          recipientLabel: "Trade Pool",
          returnPool: RECIPIENT,
        },
      });
    });
  });

  it("preselects the token passed via the search param", async () => {
    mockTokens();
    renderWithQueryClient(<SendAmountPage token={BABAS} />);

    expect(await screen.findByRole("button", { name: /use max · 1850/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /use max · 245/i })).toBeNull();
  });

  it("falls back to the first token when no param is given", async () => {
    mockTokens();
    renderWithQueryClient(<SendAmountPage />);

    expect(await screen.findByRole("button", { name: /use max · 245/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /use max · 1850/i })).toBeNull();
  });

  it("flags an over-balance amount and disables Send", async () => {
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" />,
    );

    // Wait for balances so the amount input is validated against a real max.
    await screen.findByRole("button", { name: /use max · 245/i });
    const amountInput = screen.getByRole("textbox", { name: /amount/i });

    fireEvent.change(amountInput, { target: { value: "300" } });
    expect(amountInput.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/exceeds your balance/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^send$/i }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(amountInput, { target: { value: "100" } });
    expect(amountInput.getAttribute("aria-invalid")).toBe("false");
    expect(screen.getByRole("button", { name: /^send$/i }).hasAttribute("disabled")).toBe(false);
  });

  it("caps the entered amount at two decimal places", async () => {
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" />,
    );

    await screen.findByRole("button", { name: /use max · 245/i });
    const amountInput = screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement;

    fireEvent.change(amountInput, { target: { value: "6.6666" } });
    expect(amountInput.value).toBe("6.66");

    // Extra decimal points are dropped, not treated as new separators.
    fireEvent.change(amountInput, { target: { value: "1.2.3" } });
    expect(amountInput.value).toBe("1.23");
  });

  it("keeps Send disabled while delegation status is still checking", async () => {
    delegationStatus.value = "checking";
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" />,
    );

    await screen.findByRole("button", { name: /use max · 245/i });
    fireEvent.change(screen.getByRole("textbox", { name: /amount/i }), {
      target: { value: "1" },
    });

    expect(screen.getByRole("button", { name: /^send$/i }).hasAttribute("disabled")).toBe(true);
  });

  it("ellipsizes the recipient in the confirmation sheet so it stays on one line", async () => {
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" />,
    );

    await screen.findByRole("button", { name: /use max · 245/i });
    fireEvent.change(screen.getByRole("textbox", { name: /amount/i }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(screen.getByText(/confirm send/i)).toBeTruthy();
    expect(screen.getAllByText("Alice")).toHaveLength(2);
    expect(document.body.textContent).toContain(RECIPIENT);
  });

  it("surfaces relay errors inside the open confirmation sheet", async () => {
    sendVoucherState.error = new Error("Relay failed");
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" />,
    );

    await screen.findByRole("button", { name: /use max · 245/i });
    fireEvent.change(screen.getByRole("textbox", { name: /amount/i }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(screen.getByText(/confirm send/i)).toBeTruthy();
    expect(screen.getByText(/relay failed/i)).toBeTruthy();
  });

  it("sends the full raw balance when Use max was clicked", async () => {
    setVoucherDetail(USDC, { voucherValue: "1", voucherUoa: "KES" });
    sendMutateAsync.mockResolvedValue({
      trackingId: "tracking-1",
      signatureType: "secp256k1",
      valuationSnapshots: [{ tokenAddress: USDC, voucherValue: "1", voucherUoa: "KES" }],
    });
    mockTokens({ usdcBalance: "2134567" });
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" />,
    );

    const maxButton = await screen.findByRole("button", { name: /use max · 2.13/i });
    fireEvent.click(maxButton);
    expect((screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement).value).toBe(
      "2.13",
    );
    expect(screen.getByText("(2.13 KES)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(screen.getByText(/confirm send/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /confirm and send/i }));

    await waitFor(() => {
      expect(sendMutateAsync).toHaveBeenCalledWith({
        senderAddress: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
        tokenAddress: USDC,
        recipientAddress: RECIPIENT,
        amountRaw: "2134567",
        includeAuthorization: false,
      });
    });
    expect(navigate).toHaveBeenCalledWith({
      to: "/wallet/send/receipt",
      search: {
        trackingId: "tracking-1",
        token: USDC,
        recipient: RECIPIENT,
        recipientLabel: "Alice",
        amount: "2.134567",
        symbol: "USDC",
        uoaValue: "2.134567",
        uoa: "KES",
        returnPool: undefined,
      },
    });
  });

  it("uses the relayer claim snapshot instead of a cached claim on the receipt", async () => {
    setVoucherDetail(USDC, { voucherValue: "1", voucherUoa: "KES" });
    sendMutateAsync.mockResolvedValue({
      trackingId: "tracking-1",
      signatureType: "secp256k1",
      valuationSnapshots: [{ tokenAddress: USDC, voucherValue: "2", voucherUoa: "USD" }],
    });
    mockTokens();
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" />,
    );

    await screen.findByRole("button", { name: /use max · 245/i });
    fireEvent.change(screen.getByRole("textbox", { name: /amount/i }), {
      target: { value: "3" },
    });
    expect(screen.getByText("(3.00 KES)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm and send/i }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: expect.objectContaining({ uoaValue: "6", uoa: "USD" }),
        }),
      ),
    );
  });
});
