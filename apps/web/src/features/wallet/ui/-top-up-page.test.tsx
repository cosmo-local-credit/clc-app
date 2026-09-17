import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { account, clipboardWrite, toastSuccess } = vi.hoisted(() => ({
  account: { address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as string | undefined },
  clipboardWrite: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: account.address }),
  // WithdrawSheet reads delegation via useBytecode; undefined code → not-delegated.
  useBytecode: () => ({ data: undefined, isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: toastSuccess,
  },
}));

// Pretium wires its MPESA ramps on Celo mainnet alone, so every flow below is
// exercised against that chain explicitly. Left to the build's own
// VITE_CHAIN_ID these tests assert one thing on Celo and another on Gnosis,
// where `chainHasPretiumRamp` is false and the whole section renders as
// unavailable.
vi.mock("#/lib/chain", () => ({
  CHAIN_ID: 42220,
  CHAIN_INFO: {
    name: "Celo",
    nativeSymbol: "CELO",
    blockTimeMs: 1_000,
    explorerUrl: "https://celoscan.io",
    explorerName: "Celoscan",
  },
}));

import { TopUpPage } from "./top-up-page";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockPretiumBackend({
  phone,
  history = false,
  historyStatus = "COMPLETE",
  pretiumId = "PTM-1",
  txHash = "0x1111111111111111111111111111111111111111111111111111111111111111",
  tokens = [],
  onramps,
  offramps = [],
  link = null,
}: {
  phone: string;
  history?: boolean;
  historyStatus?: string;
  pretiumId?: string;
  txHash?: string;
  tokens?: unknown[];
  onramps?: unknown[];
  offramps?: unknown[];
  link?: { linked: boolean; phoneNumber: string } | null;
}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.includes("/auth/profile")) {
      return Promise.resolve(jsonResponse(profilePayload(phone)));
    }
    if (url.includes("/api/v2/accounts/") && url.includes("/tokens")) {
      return Promise.resolve(jsonResponse({ tokens, first: 0, last: 0 }));
    }
    if (url.includes("/api/v2/pretium/link-by-address/")) {
      return Promise.resolve(jsonResponse(link ?? { linked: false }));
    }
    if (url.includes("/api/v2/pretium/link")) {
      return Promise.resolve(jsonResponse({ publicKey: account.address, phoneNumber: phone }));
    }
    if (url.includes("/api/v2/pretium/rates")) {
      return Promise.resolve(jsonResponse({ buy: 128.5, sell: 127.75 }));
    }
    if (url.includes("/api/v2/pretium/transactions-by-address/")) {
      const historyOnramps =
        onramps ??
        (history
          ? [
              {
                ID: 1,
                PretiumID: pretiumId,
                PretiumStatus: historyStatus,
                AmountKES: "20.00",
                TxHash: txHash,
                CreatedAt: "2026-07-06T10:00:00Z",
              },
            ]
          : []);
      return Promise.resolve(
        jsonResponse({
          address: account.address,
          onramps: historyOnramps,
          offramps,
          totalCount: historyOnramps.length + offramps.length,
        }),
      );
    }
    if (url.includes("/api/v2/pretium/trigger-onramp")) {
      return Promise.resolve(
        jsonResponse({ transactionCode: "PTM-2", status: "PENDING", message: "STK sent" }),
      );
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function jsonResponse(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

function profilePayload(phone: string) {
  return {
    address: account.address,
    name: "Alice",
    email: "alice@example.com",
    phone,
    country: "KE",
    createdAt: "2026-07-01T12:20:29Z",
  };
}

afterEach(() => {
  account.address = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
  clipboardWrite.mockReset();
  toastSuccess.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TopUpPage", () => {
  it("shows the Cash page shell with add, withdraw, and Pretium history sections", async () => {
    mockPretiumBackend({ phone: "+254712345678" });

    renderWithQueryClient(<TopUpPage />);

    expect(await screen.findByRole("heading", { name: "Cash" })).toBeTruthy();
    expect(screen.getByText("Buy or sell stables with local money.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Add stables" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Withdraw" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pretium history" })).toBeTruthy();
    expect(await screen.findByText("No cash activity yet.")).toBeTruthy();
  });

  it("opens the add stables sheet with the user's Kenyan MPESA number and a 100 KES placeholder", async () => {
    mockPretiumBackend({ phone: "+254712345678" });

    renderWithQueryClient(<TopUpPage />);

    expect(screen.queryByRole("textbox", { name: /amount/i })).toBeNull();
    fireEvent.click((await screen.findAllByRole("button", { name: /mpesa via pretium/i }))[0]);

    expect(await screen.findByText("+254712345678")).toBeTruthy();
    expect(screen.getByText("KES")).toBeTruthy();
    const amountInput = screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement;
    // No autofocus / prefilled value here — the field shows a 100 placeholder.
    expect(amountInput.value).toBe("");
    expect(amountInput.getAttribute("placeholder")).toBe("100");
    expect(screen.getByRole("button", { name: /continue/i }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(amountInput, { target: { value: "100" } });
    // 100 KES ÷ 127.75 sell ≈ 0.78 USD₮ (shown instead of the raw buy/sell rate).
    expect(screen.getByText("You'll receive")).toBeTruthy();
    expect(await screen.findByText(/≈ 0.78 USD₮/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue/i }).hasAttribute("disabled")).toBe(false);
  });

  it("can repeatedly open and dismiss the add stables sheet", async () => {
    mockPretiumBackend({ phone: "+254712345678" });

    renderWithQueryClient(<TopUpPage />);

    const addButton = (await screen.findAllByText("MPESA via Pretium"))[0]?.closest("button");
    expect(addButton).toBeTruthy();

    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(addButton as HTMLButtonElement);
      expect(await screen.findByRole("textbox", { name: /amount/i })).toBeTruthy();
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("textbox", { name: /amount/i })).toBeNull());
    }
  });

  it("starts a Pretium onramp from the add stables sheet", async () => {
    const fetchMock = mockPretiumBackend({ phone: "+254712345678" });

    renderWithQueryClient(<TopUpPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /mpesa via pretium/i }))[0]);
    fireEvent.change(await screen.findByRole("textbox", { name: /amount/i }), {
      target: { value: "100" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /continue/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const onrampCall = fetchMock.mock.calls.find(([input]) =>
      requestUrl(input).includes("/api/v2/pretium/trigger-onramp"),
    );
    expect(onrampCall).toBeTruthy();
    const onrampBody = onrampCall?.[1]?.body;
    expect(typeof onrampBody).toBe("string");
    expect(JSON.parse(onrampBody as string)).toMatchObject({
      address: account.address,
      // E.164 profile number converted to the 10-digit local MPESA shortcode.
      phoneNumber: "0712345678",
      asset: "USDT",
      amount: 100,
    });
  });

  it("shows every returned Pretium history item without trimming", async () => {
    mockPretiumBackend({
      phone: "+254712345678",
      onramps: [
        {
          ID: 1,
          PretiumID: "PTM-1",
          PretiumStatus: "COMPLETE",
          AmountKES: "20.00",
          TxHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
          CreatedAt: "2026-07-06T10:00:00Z",
        },
      ],
      offramps: [
        {
          id: 2,
          pretium_id: "OFF-1",
          pretium_status: "SUCCESS",
          amount_kes: "100.00",
          tx_hash: "0x2222222222222222222222222222222222222222222222222222222222222222",
          created_at: "2026-07-06T09:00:00Z",
        },
        {
          id: 3,
          pretium_id: "OFF-2",
          pretium_status: "SUCCESS",
          amount_kes: "200.00",
          tx_hash: "0x3333333333333333333333333333333333333333333333333333333333333333",
          created_at: "2026-07-06T08:00:00Z",
        },
        {
          id: 4,
          pretium_id: "OFF-3",
          pretium_status: "SUCCESS",
          amount_kes: "300.00",
          tx_hash: "0x4444444444444444444444444444444444444444444444444444444444444444",
          created_at: "2026-07-06T07:00:00Z",
        },
        {
          id: 5,
          pretium_id: "OFF-4",
          pretium_status: "SUCCESS",
          amount_kes: "400.00",
          tx_hash: "0x5555555555555555555555555555555555555555555555555555555555555555",
          created_at: "2026-07-06T06:00:00Z",
        },
      ],
    });

    renderWithQueryClient(<TopUpPage />);

    await screen.findByRole("button", { name: /complete.*onramp/i });
    expect(await screen.findByRole("button", { name: /complete.*offramp.*kes 400/i })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /complete.*(?:onramp|offramp)/i })).toHaveLength(
      5,
    );
  });

  it("renders completed onramp history rows and opens the detail sheet with copyable Pretium ID", async () => {
    clipboardWrite.mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: clipboardWrite } });
    const pretiumId = "PTM-1234567890-ABCDEFG";
    mockPretiumBackend({ phone: "+254712345678", history: true, pretiumId });

    renderWithQueryClient(<TopUpPage />);

    // Row mirrors the activity feed: labelled "Onramp", amount shown, no Pretium id.
    expect(await screen.findByRole("button", { name: /complete.*onramp/i })).toBeTruthy();
    expect(document.body.textContent).toContain("KES 20");
    expect(document.body.textContent).not.toContain("KES 20.00");
    expect(document.body.textContent).not.toContain(pretiumId);

    // Clicking the onramp row opens the detail sheet with status, Pretium id + tx hash.
    fireEvent.click(screen.getByRole("button", { name: /complete.*onramp/i }));
    expect(await screen.findByText("COMPLETE")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Pretium ID")).toBeTruthy();
    expect(screen.getByText("PTM-1234…BCDEFG")).toBeTruthy();
    expect(screen.getByText("Transaction")).toBeTruthy();
    expect(screen.getByRole("link", { name: /view on block explorer/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /copy pretium id/i }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith(pretiumId));
    expect(toastSuccess).toHaveBeenCalledWith("Pretium ID copied");
  });

  it("opens completed offramp history rows in the detail sheet", async () => {
    mockPretiumBackend({
      phone: "+254712345678",
      history: true,
      offramps: [
        {
          id: 2,
          pretium_id: "OFF-1",
          pretium_status: "SUCCESS",
          mpesa_confirmation: "QG12ABC123",
          phone_number: "+254712345678",
          amount_usd: "7.782101",
          amount_kes: "1000.00",
          tx_hash: "0x2222222222222222222222222222222222222222222222222222222222222222",
          token_address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
          wallet_address: account.address,
          created_at: "2026-07-06T11:00:00Z",
        },
      ],
    });

    renderWithQueryClient(<TopUpPage />);

    const row = await screen.findByRole("button", { name: /complete.*offramp.*kes 1000/i });
    expect(row.textContent).toContain("KES 1000");
    expect(row.textContent).not.toContain("KES 1000.00");

    fireEvent.click(row);

    expect(await screen.findByText("Offramp details")).toBeTruthy();
    expect(screen.getByText("MPESA confirmation")).toBeTruthy();
    expect(screen.getByText("QG12ABC123")).toBeTruthy();
    expect(screen.getByText("Stable sent")).toBeTruthy();
    expect(screen.getByText("7.782101")).toBeTruthy();
    expect(screen.getByRole("link", { name: /view on block explorer/i })).toBeTruthy();
  });

  it("marks incomplete Pretium history rows with the pending status icon", async () => {
    mockPretiumBackend({ phone: "+254712345678", history: true, historyStatus: "PENDING" });

    renderWithQueryClient(<TopUpPage />);

    expect(await screen.findByRole("button", { name: /pending.*onramp/i })).toBeTruthy();
  });

  it("disables cash entry for a non-Kenyan phone number", async () => {
    mockPretiumBackend({ phone: "+12133734253" });

    renderWithQueryClient(<TopUpPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /mpesa via pretium/i }))[0]);

    expect(await screen.findByText("MPESA cash services need a Kenyan phone number.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /amount/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /continue/i }).hasAttribute("disabled")).toBe(true);
  });

  it("warns without blocking for a non-Safaricom Kenyan number", async () => {
    mockPretiumBackend({ phone: "+254730000000" });

    renderWithQueryClient(<TopUpPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /mpesa via pretium/i }))[0]);

    expect(await screen.findByText(/standard Safaricom number/i)).toBeTruthy();
    const amountInput = screen.getByRole("textbox", { name: /amount/i });
    expect(amountInput.hasAttribute("disabled")).toBe(false);
    // The soft Safaricom warning must not block: a valid amount still enables Continue.
    fireEvent.change(amountInput, { target: { value: "100" } });
    expect(screen.getByRole("button", { name: /continue/i }).hasAttribute("disabled")).toBe(false);
  });

  it("does not warn for a Safaricom number", async () => {
    mockPretiumBackend({ phone: "+254712345678" });

    renderWithQueryClient(<TopUpPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /mpesa via pretium/i }))[0]);

    expect(await screen.findByText("+254712345678")).toBeTruthy();
    expect(screen.queryByText(/standard Safaricom number/i)).toBeNull();
  });

  it("disables cash entry when the profile has no phone number", async () => {
    mockPretiumBackend({ phone: "" });

    renderWithQueryClient(<TopUpPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /mpesa via pretium/i }))[0]);

    expect(
      await screen.findByText("Add a phone number to your profile to use MPESA."),
    ).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /amount/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /continue/i }).hasAttribute("disabled")).toBe(true);
  });

  it("enables the Withdraw section and opens the offramp sheet", async () => {
    mockPretiumBackend({ phone: "+254712345678" });

    renderWithQueryClient(<TopUpPage />);

    // No longer "Soon"; the second MPESA entry is the withdraw trigger.
    expect(await screen.findByRole("heading", { name: "Withdraw" })).toBeTruthy();
    expect(screen.queryByText("Soon")).toBeNull();

    fireEvent.click((await screen.findAllByRole("button", { name: /mpesa via pretium/i }))[1]);
    expect(await screen.findByRole("button", { name: /^withdraw$/i })).toBeTruthy();
  });

  it("lets a linked user pick an eligible token and enables withdraw for a valid amount", async () => {
    mockPretiumBackend({
      phone: "+254712345678",
      link: { linked: true, phoneNumber: "+254712345678" },
      tokens: [
        {
          id: 1,
          // Celo USD₮ — matched to the offramp allowlist by address.
          tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
          tokenSymbol: "USD₮",
          tokenName: "Tether USD",
          tokenDecimals: 6,
          balance: "10000000", // 10 USDT
          iconUrl: null,
          lastDateBlock: "",
        },
      ],
    });

    renderWithQueryClient(<TopUpPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /mpesa via pretium/i }))[1]);

    // Link check passes (already linked to the profile phone) → token is shown.
    expect(await screen.findByText("USDT")).toBeTruthy();

    const withdrawButton = screen.getByRole("button", { name: /^withdraw$/i });
    expect(withdrawButton.hasAttribute("disabled")).toBe(true);

    // KES is whole-shilling only; decimal input is trimmed at the decimal point.
    const amountInput = screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "100.50" } });
    expect(amountInput.value).toBe("100");
    await waitFor(() => expect(withdrawButton.hasAttribute("disabled")).toBe(false));

    // 10 USDT × 128.5 buy = 1285 KES max, shown without decimal places.
    fireEvent.click(screen.getByRole("button", { name: /max/i }));
    expect(amountInput.value).toBe("1285");
  });
});
