import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { delegationStatus, navigate, sendMutateAsync, sendVoucherState } = vi.hoisted(() => ({
  delegationStatus: { value: "delegated" as "checking" | "delegated" | "not-delegated" },
  navigate: vi.fn(),
  sendMutateAsync: vi.fn(),
  sendVoucherState: { error: null as Error | null, isPending: false },
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

beforeEach(() => {
  delegationStatus.value = "delegated";
  sendVoucherState.error = null;
  sendVoucherState.isPending = false;
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
    expect(document.body.textContent).toContain("0xa316…5fad4");
    expect(document.body.textContent).not.toContain(RECIPIENT);
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
    mockTokens({ usdcBalance: "2134567" });
    renderWithQueryClient(
      <SendAmountPage token={USDC} recipient={RECIPIENT} recipientLabel="Alice" />,
    );

    const maxButton = await screen.findByRole("button", { name: /use max · 2.13/i });
    fireEvent.click(maxButton);
    expect((screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement).value).toBe(
      "2.13",
    );

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
        amount: "2.13",
        symbol: "USDC",
      },
    });
  });
});
