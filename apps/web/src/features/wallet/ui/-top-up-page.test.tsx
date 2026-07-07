import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { account, toastSuccess } = vi.hoisted(() => ({
  account: { address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as string | undefined },
  toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: account.address }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: toastSuccess,
  },
}));

import { TopUpPage } from "./top-up-page";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockPretiumBackend({ phone, history = false }: { phone: string; history?: boolean }) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.includes("/auth/profile")) {
      return Promise.resolve(jsonResponse(profilePayload(phone)));
    }
    if (url.includes("/api/v2/pretium/rates")) {
      return Promise.resolve(jsonResponse({ buy: 128.5, sell: 127.75 }));
    }
    if (url.includes("/api/v2/pretium/transactions-by-address/")) {
      return Promise.resolve(
        jsonResponse(
          history
            ? {
                address: account.address,
                onramps: [
                  {
                    ID: 1,
                    PretiumID: "PTM-1",
                    PretiumStatus: "PENDING",
                    AmountKES: "20.00",
                    CreatedAt: "2026-07-06T10:00:00Z",
                  },
                ],
                offramps: [],
                totalCount: 1,
              }
            : { address: account.address, onramps: [], offramps: [], totalCount: 0 },
        ),
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
  toastSuccess.mockReset();
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

  it("opens the add stables sheet with the user's Kenyan MPESA number and a 20 KES amount", async () => {
    mockPretiumBackend({ phone: "+254712345678" });

    renderWithQueryClient(<TopUpPage />);

    expect(screen.queryByRole("textbox", { name: /amount/i })).toBeNull();
    fireEvent.click((await screen.findAllByRole("button", { name: /mpesa via pretium/i }))[0]);

    expect(await screen.findByText("+254712345678")).toBeTruthy();
    expect(screen.getByText("KES")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement).value).toBe("20");
    // 20 KES ÷ 127.75 sell ≈ 0.16 USD₮ (shown instead of the raw buy/sell rate).
    expect(screen.getByText("You'll receive")).toBeTruthy();
    expect(await screen.findByText(/≈ 0.16 USD₮/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue/i }).hasAttribute("disabled")).toBe(false);
  });

  it("starts a Pretium onramp from the add stables sheet", async () => {
    const fetchMock = mockPretiumBackend({ phone: "+254712345678" });

    renderWithQueryClient(<TopUpPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /mpesa via pretium/i }))[0]);
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
      amount: 20,
    });
  });

  it("renders Pretium history returned by the backend", async () => {
    mockPretiumBackend({ phone: "+254712345678", history: true });

    renderWithQueryClient(<TopUpPage />);

    expect(await screen.findByText("PENDING")).toBeTruthy();
    expect(document.body.textContent).toContain("PTM-1");
    expect(document.body.textContent).toContain("KES 20.00");
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
    expect(screen.getByRole("textbox", { name: /amount/i }).hasAttribute("disabled")).toBe(false);
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
});
