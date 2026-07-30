import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
  useNavigate: () => navigate,
}));

vi.mock("#/components/paper-wallet-scanner", () => ({
  PaperWalletScanner: ({ onKeyDecoded }: { onKeyDecoded: (value: string) => void }) => (
    <button
      type="button"
      onClick={() => onKeyDecoded("ethereum:0xa316408425cF17F1827483dee621c6C3A9B5fad4?value=1")}
    >
      Decode QR
    </button>
  ),
}));

import { SendRecipientPage } from "./send-recipient-page";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockSearch(users: Array<{ name: string; address: string }>) {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        ok: true,
        result: { users },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  navigate.mockReset();
});

describe("SendRecipientPage", () => {
  it("normalizes a phone prefix, lets the user select a Core user, then continues", async () => {
    const fetcher = mockSearch([
      {
        name: "Alice",
        address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      },
    ]);
    renderWithQueryClient(<SendRecipientPage token="0xtoken" />);

    fireEvent.change(
      screen.getByRole("textbox", { name: /recipient ens, email, phone or address/i }),
      {
        target: { value: "255 711 777" },
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: /alice/i }));

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v2/users/search");
    expect(JSON.parse(init.body as string)).toEqual({
      kind: "phone",
      query: "+255711777",
    });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/wallet/send/amount",
        search: {
          token: "0xtoken",
          recipient: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
          recipientLabel: "Alice",
        },
      });
    });
  });

  it("classifies an email before querying Core", async () => {
    const fetcher = mockSearch([
      {
        name: "Alice",
        address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      },
    ]);
    renderWithQueryClient(<SendRecipientPage />);

    fireEvent.change(
      screen.getByRole("textbox", { name: /recipient ens, email, phone or address/i }),
      {
        target: { value: "Alice@Example.COM" },
      },
    );

    expect(await screen.findByRole("button", { name: /alice/i })).toBeTruthy();
    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      kind: "email",
      query: "alice@example.com",
    });
  });

  it("clears a selected user when an ENS suffix suggestion changes the input", async () => {
    mockSearch([
      {
        name: "Alice",
        address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      },
    ]);
    renderWithQueryClient(<SendRecipientPage />);

    fireEvent.change(
      screen.getByRole("textbox", { name: /recipient ens, email, phone or address/i }),
      {
        target: { value: "alice" },
      },
    );
    fireEvent.click(await screen.findByRole("button", { name: /^alice 0x/i }));

    const continueButton = screen.getByRole("button", { name: /continue/i }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "alice.eth" }));

    expect(continueButton.disabled).toBe(true);
  });

  it("uses a complete pasted address directly without a database search", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    renderWithQueryClient(<SendRecipientPage />);
    const input = screen.getByRole("textbox", {
      name: /recipient ens, email, phone or address/i,
    });

    fireEvent.change(input, {
      target: { value: "0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439" },
    });

    expect((input as HTMLInputElement).value).toBe("0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439");
    expect(screen.getByText("Address")).toBeTruthy();
    expect((screen.getByRole("button", { name: /continue/i }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fills the input from a scanned QR address without searching", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    renderWithQueryClient(<SendRecipientPage />);

    fireEvent.click(screen.getByRole("button", { name: /scan qr/i }));
    fireEvent.click(screen.getByRole("button", { name: /decode qr/i }));

    expect(
      (
        screen.getByRole("textbox", {
          name: /recipient ens, email, phone or address/i,
        }) as HTMLInputElement
      ).value,
    ).toBe("0xa316408425cF17F1827483dee621c6C3A9B5fad4");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
