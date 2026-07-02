import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
  useNavigate: () => vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
}));

import { SendAmountPage } from "./send-amount-page";

const USDC = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const BABAS = "0xBaba5Eed3c1D7f3A0b6C2e8F4d1a9F57c3b2C0de";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockTokens() {
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
                  balance: "245000000",
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SendAmountPage", () => {
  // The "Use max" button reflects the selected token's balance uniquely — the
  // symbol itself appears in the picker list too, so it isn't a clean signal.
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
    renderWithQueryClient(<SendAmountPage token={USDC} />);

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
    renderWithQueryClient(<SendAmountPage token={USDC} />);

    await screen.findByRole("button", { name: /use max · 245/i });
    const amountInput = screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement;

    fireEvent.change(amountInput, { target: { value: "6.6666" } });
    expect(amountInput.value).toBe("6.66");

    // Extra decimal points are dropped, not treated as new separators.
    fireEvent.change(amountInput, { target: { value: "1.2.3" } });
    expect(amountInput.value).toBe("1.23");
  });
});
