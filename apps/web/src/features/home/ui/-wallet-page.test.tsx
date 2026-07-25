import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { WalletPage } from "./wallet-page";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockLatestTokens() {
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
                  id: 1043746,
                  tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
                  tokenSymbol: "USD₮",
                  tokenName: "Tether USD",
                  tokenDecimals: 6,
                  balance: "1234567",
                  iconUrl: "https://content.sarafu.network/voucher/icon.jpg",
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

describe("WalletPage", () => {
  it("shows the wallet header without the total balance card", () => {
    mockLatestTokens();
    renderWithQueryClient(<WalletPage address={ADDRESS} />);
    expect(screen.getByRole("heading", { name: /wallet/i })).toBeTruthy();
    expect(screen.queryByText(/total balance/i)).toBeNull();
  });

  it("links Send, Receive, Cash, and Pools without Swap", () => {
    mockLatestTokens();
    renderWithQueryClient(<WalletPage address={ADDRESS} />);
    expect(screen.getByRole("link", { name: /send/i }).getAttribute("href")).toBe("/wallet/send");
    expect(screen.getByRole("link", { name: /receive/i }).getAttribute("href")).toBe(
      "/wallet/receive",
    );
    expect(screen.getByRole("link", { name: /cash/i }).getAttribute("href")).toBe("/wallet/top-up");
    expect(screen.getByRole("link", { name: /pools/i }).getAttribute("href")).toBe("/pools");
    expect(screen.queryByRole("link", { name: /swap/i })).toBeNull();
  });

  it("shows fetched voucher balances with real logos", async () => {
    mockLatestTokens();
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    expect(await screen.findByText("USD₮")).toBeTruthy();
    expect(screen.getByText("Tether USD")).toBeTruthy();
    expect(screen.getByText("1.23")).toBeTruthy();
    const logo = document.querySelector(
      'img[src="https://content.sarafu.network/voucher/icon.jpg"]',
    );
    expect(logo?.getAttribute("loading")).toBe("lazy");
  });

  it("does not show the old placeholder pool section", () => {
    mockLatestTokens();
    renderWithQueryClient(<WalletPage address={ADDRESS} />);
    expect(screen.queryByText(/your pools/i)).toBeNull();
    expect(screen.queryByText(/Local Solar Coop/)).toBeNull();
    expect(screen.queryByText(/Fresh Food Circle/)).toBeNull();
  });
});
