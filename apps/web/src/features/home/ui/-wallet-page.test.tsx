import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  usage: {
    data: {
      vouchers: { used: 0, limit: 1, unlimited: false, canCreate: true },
      pools: { used: 0, limit: 1, unlimited: false, canCreate: true },
      catalogs: { used: 0, limit: 1, unlimited: false, canCreate: true },
      offers: { used: 0, limit: 0, unlimited: true, canCreate: true },
    },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, boolean | string>;
    children: React.ReactNode;
  }) => {
    const pathname = Object.entries(params ?? {}).reduce(
      (value, [key, replacement]) => value.replace(`$${key}`, replacement),
      to,
    );
    const query = new URLSearchParams(
      Object.entries(search ?? {}).map(([key, value]) => [key, String(value)]),
    ).toString();
    return (
      <a href={query ? `${pathname}?${query}` : pathname} {...props}>
        {children}
      </a>
    );
  },
}));

// The profile nudge reads the connected wallet; it has its own test.
vi.mock("./complete-profile-banner", () => ({ CompleteProfileBanner: () => null }));
vi.mock("#/components/catalogs/my-catalog-section", () => ({
  MyCatalogSection: () => <section aria-label="My Catalogs">My Catalogs</section>,
}));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => mocks.usage,
}));

import { WalletPage } from "./wallet-page";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const USDT = {
  id: 1043746,
  tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  tokenSymbol: "USD₮",
  tokenName: "Tether USD",
  tokenDecimals: 6,
  balance: "1234567",
  iconUrl: "https://content.sarafu.network/voucher/icon.jpg",
  lastDateBlock: "2026-07-01T12:20:29Z",
};

const ISSUED = {
  id: 1043747,
  tokenAddress: "0x1111111111111111111111111111111111111111",
  tokenSymbol: "WLLR",
  tokenName: "Will",
  tokenDecimals: 6,
  balance: "5000000",
  iconUrl: null,
  lastDateBlock: "2026-07-02T12:20:29Z",
};

function jsonResponse(result: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "" : "Error",
    text: () => Promise.resolve(JSON.stringify({ ok: status === 200, result })),
  };
}

/**
 * Account balances plus the account's issued list. The issued list answers
 * with the balance rows `owners` names as the account's, retired ones left out
 * as clc-core does, followed by `unminted`: issued vouchers it holds none of.
 */
function mockLatestTokens({
  tokens = [USDT],
  owners = {},
  unminted = [],
  issuedStatus = 200,
  balanceStatus = 200,
}: {
  tokens?: readonly unknown[];
  owners?: Readonly<Record<string, string | null>>;
  unminted?: readonly unknown[];
  issuedStatus?: number;
  balanceStatus?: number;
} = {}) {
  const fetchMock = vi.fn().mockImplementation((url: string | URL) => {
    const href = String(url);
    if (href.includes("/tokens/issued")) {
      if (issuedStatus !== 200) return Promise.resolve(jsonResponse(null, issuedStatus));
      const issued = tokens.filter((value) => {
        const token = value as typeof USDT & { catalogActive?: boolean };
        const ownerAddress = owners[token.tokenAddress.toLowerCase()];
        return (
          token.catalogActive !== false && ownerAddress?.toLowerCase() === ADDRESS.toLowerCase()
        );
      });
      return Promise.resolve(jsonResponse({ tokens: [...issued, ...unminted], first: 0, last: 0 }));
    }
    if (href.includes("/api/v2/accounts/") && href.includes("/tokens") && balanceStatus !== 200)
      return Promise.resolve(jsonResponse(null, balanceStatus));
    return Promise.resolve(jsonResponse({ tokens }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockNoTokens() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ tokens: [] }))),
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
function mockEndpoints({
  pools,
  poolStatus = 200,
}: {
  pools: readonly unknown[];
  poolStatus?: number;
}) {
  const fetchMock = vi.fn().mockImplementation((url: string | URL) => {
    const href = String(url);
    if (href.includes("/api/v2/pools") && poolStatus !== 200)
      return Promise.resolve(jsonResponse(null, poolStatus));
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

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.usage.isError = false;
  mocks.usage.isFetching = false;
  mocks.usage.refetch.mockReset();
});

describe("WalletPage", () => {
  it("shows the wallet header without the total balance card", () => {
    mockLatestTokens();
    renderWithQueryClient(<WalletPage address={ADDRESS} />);
    expect(screen.getByRole("heading", { name: /wallet/i })).toBeTruthy();
    expect(screen.queryByText(/total balance/i)).toBeNull();
  });

  it("shows only Send, Receive, and Cash shortcuts", () => {
    mockLatestTokens();
    renderWithQueryClient(<WalletPage address={ADDRESS} />);
    const actions = within(screen.getByRole("region", { name: "Wallet actions" }));
    expect(actions.getByRole("link", { name: /send/i }).getAttribute("href")).toBe("/wallet/send");
    expect(actions.getByRole("link", { name: /receive/i }).getAttribute("href")).toBe(
      "/wallet/receive",
    );
    expect(actions.getByRole("link", { name: /cash/i }).getAttribute("href")).toBe("/wallet/cash");
    expect(actions.queryByRole("link", { name: "Pools" })).toBeNull();
    expect(actions.queryByRole("link", { name: "Catalogs" })).toBeNull();
    expect(screen.getByRole("link", { name: "All pools" }).getAttribute("href")).toBe("/pools");
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

  it("links a balance to its canonical voucher page", async () => {
    mockLatestTokens();
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    const voucher = (await screen.findByText("USD₮")).closest("a");
    expect(voucher?.getAttribute("href")).toBe(
      "/vouchers/0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e?from=wallet",
    );
  });

  it("lists vouchers the account issued separately from the ones it holds", async () => {
    mockLatestTokens({
      tokens: [USDT, ISSUED],
      owners: { [ISSUED.tokenAddress]: ADDRESS, [USDT.tokenAddress.toLowerCase()]: OTHER },
    });
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    const holdings = within(await screen.findByRole("region", { name: "Holdings" }));
    const issued = within(screen.getByRole("region", { name: /My Vouchers/ }));
    expect(holdings.getByText("USD₮")).toBeTruthy();
    expect(holdings.queryByText("WLLR")).toBeNull();
    expect(issued.getByText("WLLR")).toBeTruthy();
    expect(issued.getByText("5")).toBeTruthy();
    expect(issued.queryByText("USD₮")).toBeNull();

    const text = document.body.textContent ?? "";
    expect(text.indexOf("Holdings")).toBeLessThan(text.indexOf("My Vouchers"));
    expect(text.indexOf("My Vouchers")).toBeLessThan(text.indexOf("My Pools"));
    expect(text.indexOf("My Pools")).toBeLessThan(text.indexOf("My Catalogs"));
  });

  it("treats a token the catalog does not list as a holding", async () => {
    mockLatestTokens();
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    const holdings = within(await screen.findByRole("region", { name: "Holdings" }));
    expect(holdings.getByText("USD₮")).toBeTruthy();
    expect(screen.getByText("No vouchers yet.")).toBeTruthy();
  });

  it("lists an issued voucher whose supply was never created", async () => {
    // The opening mint failed, so the voucher has no balance anywhere and the
    // balance list never mentions it.
    mockLatestTokens({
      tokens: [],
      unminted: [{ ...ISSUED, balance: "0", lastDateBlock: "0001-01-01T00:00:00Z" }],
    });
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    await screen.findByText("WLLR");
    const issued = within(screen.getByRole("region", { name: /My Vouchers/ }));
    expect(issued.getByText("0")).toBeTruthy();
    expect(issued.getByRole("link", { name: /WLLR/ }).getAttribute("href")).toBe(
      `/vouchers/${ISSUED.tokenAddress}?from=wallet`,
    );
    expect(screen.queryByText("No vouchers yet.")).toBeNull();
    expect(screen.queryByRole("region", { name: "Holdings" })).toBeNull();
  });

  it("files balances with one issued read rather than a catalog read per balance", async () => {
    const fetchMock = mockLatestTokens({
      tokens: [USDT, ISSUED],
      owners: { [ISSUED.tokenAddress]: ADDRESS },
    });
    renderWithQueryClient(<WalletPage address={ADDRESS} />);
    await screen.findByRole("region", { name: "Holdings" });

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.includes("/api/v2/vouchers/"))).toEqual([]);
    expect(urls).toContainEqual(
      expect.stringContaining(`/api/v2/accounts/${ADDRESS}/tokens/latest`),
    );
    expect(urls).toContainEqual(
      expect.stringContaining(`/api/v2/accounts/${ADDRESS}/tokens/issued?perPage=100`),
    );
  });

  it("hides a retired voucher the account owns", async () => {
    mockLatestTokens({
      tokens: [{ ...ISSUED, catalogActive: false }],
      owners: { [ISSUED.tokenAddress]: ADDRESS },
    });
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    expect(await screen.findByText("No vouchers yet.")).toBeTruthy();
    expect(screen.queryByText("WLLR")).toBeNull();
    expect(screen.queryByRole("region", { name: "Holdings" })).toBeNull();
  });

  it("does not file balances while the issued list is down", async () => {
    mockLatestTokens({ issuedStatus: 500 });
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    expect(await screen.findByText("Couldn't load vouchers.")).toBeTruthy();
    expect(screen.queryByText("USD₮")).toBeNull();
    expect(screen.queryByRole("region", { name: "Holdings" })).toBeNull();
  });

  it("retries resource limits and failed owned-voucher discovery", async () => {
    mocks.usage.isError = true;
    mockLatestTokens({ issuedStatus: 500 });
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(mocks.usage.refetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "View all" }));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/wallet/vouchers" });

    const vouchers = within(screen.getByRole("region", { name: /My Vouchers/ }));
    fireEvent.click(await vouchers.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it("retries balances without hiding an owned voucher", async () => {
    mockLatestTokens({
      tokens: [ISSUED],
      owners: { [ISSUED.tokenAddress]: ADDRESS },
      balanceStatus: 500,
    });
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    expect(await screen.findByText("WLLR")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
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

  it("retries a failed owned-pools request", async () => {
    mockEndpoints({ pools: [], poolStatus: 500 });
    renderWithQueryClient(<WalletPage address={ADDRESS} />);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });
});
