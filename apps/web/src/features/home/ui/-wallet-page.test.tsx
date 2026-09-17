import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { chainHasPretiumRamp } from "@clc/core/features/wallet/pretium";
import { CHAIN_ID, CHAIN_INFO } from "#/lib/chain";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce(
        (value, [key, replacement]) => value.replace(`$${key}`, replacement),
        to,
      )}
      {...props}
    >
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

function mockNoTokens() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "",
      text: () => Promise.resolve(JSON.stringify({ ok: true, result: { tokens: [] } })),
    }),
  );
}

const OTHER = "0x9999999999999999999999999999999999999999";

const OWNED_POOL = {
  id: 7,
  chainId: 42220,
  address: "0x9F2e5B1c4A70D3f8a6C1e0B2d4A7c9E3F1b5D820",
  name: "Kilifi Mkulima",
  symbol: "KMK",
  decimals: 6,
  ownerAddress: ADDRESS,
  voucherCount: 3,
  tags: [],
} as const;

/**
 * One mock covering both queries this page issues. The blanket token mock above
 * cannot serve the pool list — the two responses have different shapes, and a
 * pool page read as a token page is silently empty rather than failing.
 */
function mockEndpoints({ pools }: { pools: readonly unknown[] }) {
  const fetchMock = vi.fn().mockImplementation((url: string | URL) => {
    const href = String(url);
    const result = href.includes("/api/v2/pools")
      ? { pools, first: 0, last: 0 }
      : { tokens: [] as unknown[] };
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: "",
      text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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

  it("keeps Cash visible and disables it only when this chain has no ramp", () => {
    mockLatestTokens();
    renderWithQueryClient(<WalletPage address={ADDRESS} />);
    expect(screen.getByRole("link", { name: /send/i }).getAttribute("href")).toBe("/wallet/send");
    expect(screen.getByRole("link", { name: /receive/i }).getAttribute("href")).toBe(
      "/wallet/receive",
    );
    // Exact, not /pools/i: the Your Pools header also links out to "All pools".
    expect(screen.getByRole("link", { name: "Pools" }).getAttribute("href")).toBe("/pools");
    expect(screen.queryByRole("link", { name: /swap/i })).toBeNull();

    if (chainHasPretiumRamp(CHAIN_ID)) {
      expect(screen.getByRole("link", { name: /cash/i }).getAttribute("href")).toBe(
        "/wallet/top-up",
      );
      expect(screen.queryByRole("button", { name: /cash/i })).toBeNull();
      return;
    }

    const cash = screen.getByRole("button", { name: /cash/i }) as HTMLButtonElement;
    expect(cash.disabled).toBe(true);
    expect(cash.title).toBe(`Cash services aren't available on ${CHAIN_INFO.name}.`);
    expect(screen.queryByRole("link", { name: /cash/i })).toBeNull();
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

  it("offers voucher creation when the wallet is empty", async () => {
    mockNoTokens();
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    expect(await screen.findByText("No vouchers yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create voucher" }).getAttribute("href")).toBe(
      "/vouchers/create/voucher",
    );
  });

  it("lists the pools this address owns, not the old hardcoded placeholders", async () => {
    mockEndpoints({ pools: [OWNED_POOL] });
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    expect(await screen.findByText("Kilifi Mkulima")).toBeTruthy();
    expect(screen.getByText("3 vouchers")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Kilifi Mkulima/ }).getAttribute("href")).toBe(
      `/pools/${OWNED_POOL.address}`,
    );
    expect(screen.queryByText(/Local Solar Coop/)).toBeNull();
    expect(screen.queryByText(/Fresh Food Circle/)).toBeNull();
  });

  it("asks the catalog for this address' pools rather than filtering a fetched page", async () => {
    const fetchMock = mockEndpoints({ pools: [OWNED_POOL] });
    renderWithQueryClient(<WalletPage address={ADDRESS} />);
    await screen.findByText("Kilifi Mkulima");

    const poolRequest = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes("/api/v2/pools"));
    // Lowercased or checksummed does not matter — clc-core folds case — but the
    // predicate has to be on the request, or the list is "whichever of your
    // pools happened to land in page one of the whole catalog".
    expect(poolRequest).toContain(`owner=${ADDRESS}`);
  });

  it("drops rows a backend without the owner filter would have returned", async () => {
    // An older clc-core ignores an unknown query parameter and answers with the
    // whole catalog; presenting that as "your pools" is worse than showing none.
    mockEndpoints({
      pools: [OWNED_POOL, { ...OWNED_POOL, id: 8, name: "Someone Else's", ownerAddress: OTHER }],
    });
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    expect(await screen.findByText("Kilifi Mkulima")).toBeTruthy();
    expect(screen.queryByText("Someone Else's")).toBeNull();
  });

  it("offers pool creation when this address owns none", async () => {
    mockEndpoints({ pools: [] });
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    expect(await screen.findByText("You haven't created a pool yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create pool" }).getAttribute("href")).toBe(
      "/pools/create/pool",
    );
  });
});
