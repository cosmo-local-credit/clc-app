import { BackendApiError } from "@clc/api/client/errors";
import type { CreditRoutesParams } from "@clc/api/features/credit-router/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const PRIVATE_KEY = `0x${"42".repeat(32)}` as const;
const WALLET = privateKeyToAccount(PRIVATE_KEY).address;

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  routes: vi.fn(),
  quote: vi.fn(),
  relay: vi.fn(),
  getHealth: vi.fn(),
  getEOANonce: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
  Link: ({
    to,
    params,
    search,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
    children: ReactNode;
    className?: string;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (current, [key, value]) => current.replace(`$${key}`, value),
      to,
    );
    const query = new URLSearchParams(search ?? {}).toString();
    return (
      <a href={query ? `${path}?${query}` : path} className={className}>
        {children}
      </a>
    );
  },
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, isLoading: false, address: WALLET }),
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ connector: { id: "private-key" } }) }));
vi.mock("#/connectors/privateKey", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/connectors/privateKey")>()),
  getStoredKey: () => PRIVATE_KEY,
}));
vi.mock("#/features/webauthn/api/sign-digest", () => ({ signDigestWithPasskey: vi.fn() }));
vi.mock("#/lib/api/credit-router", () => ({
  creditRouterClient: { routes: mocks.routes, quote: mocks.quote },
}));
vi.mock("#/lib/api/market", () => ({
  marketClient: {
    getMarketVoucher: async (address: string) => ({
      address,
      symbol: SYMBOLS[address.toLowerCase()] ?? "???",
      decimals: 6,
    }),
  },
}));
vi.mock("@clc/api/features/relayer/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@clc/api/features/relayer/client")>()),
  createRelayerClient: () => ({
    getHealth: mocks.getHealth,
    relay: mocks.relay,
    getEOANonce: mocks.getEOANonce,
  }),
}));

import { creditQuoteFixture, FIXTURE } from "#/features/credit/api/-credit-quote-fixture";
import { CreditGetPage } from "./credit-get-page";

const VOUCHER_D = getAddress(`0x${"d4".repeat(20)}`);
const SYMBOLS: Record<string, string> = {
  [FIXTURE.voucherA.toLowerCase()]: "AAA",
  [FIXTURE.voucherB.toLowerCase()]: "BBB",
  [FIXTURE.voucherC.toLowerCase()]: "CCC",
  [VOUCHER_D.toLowerCase()]: "DDD",
};

function hop(
  pool: `0x${string}`,
  name: string,
  tokenIn: string,
  tokenOut: string,
  feeSource = "pair",
) {
  return {
    pool: { address: pool, name },
    tokenIn,
    tokenOut,
    feePpm: "0",
    feeSource,
    protocolFeePpm: "20000",
  };
}

const TWO_HOP = {
  id: "r_two",
  hops: [
    hop(FIXTURE.pool1, "Kilifi Pool", FIXTURE.voucherA, FIXTURE.voucherB, "default"),
    hop(FIXTURE.pool2, "Mombasa Pool", FIXTURE.voucherB, FIXTURE.voucherC),
  ],
  rate: { amountIn: "1000000", amountOut: "999600" },
  maxAmountIn: "9000000",
  maxAmountOut: "8996400",
  maxIsExact: true,
  limitedBy: "liquidity",
  limitedByHop: 1,
  effectiveFeePpm: "400",
};
const ONE_HOP = {
  id: "r_one",
  hops: [hop(FIXTURE.pool2, "Mombasa Pool", VOUCHER_D, FIXTURE.voucherC)],
  rate: { amountIn: "1000000", amountOut: "999800" },
  maxAmountIn: null,
  maxAmountOut: null,
  maxIsExact: false,
  limitedBy: null,
  effectiveFeePpm: "200",
};

function page(params: CreditRoutesParams, overrides: Record<string, unknown> = {}) {
  const sized = params.amount !== undefined;
  const carry = (route: typeof TWO_HOP | typeof ONE_HOP) =>
    sized ? { ...route, carriesAmount: true, amountIn: "5002000", amountOut: "5000000" } : route;
  return {
    target: { address: FIXTURE.voucherC, symbol: "CCC", decimals: 6 },
    asOfBlock: 49254469,
    graphVersion: 812,
    stale: false,
    complete: true,
    inputs: [
      { voucher: FIXTURE.voucherA, walletBalance: "9000000", routes: [carry(TWO_HOP)] },
      { voucher: VOUCHER_D, walletBalance: "3000000", routes: [carry(ONE_HOP)] },
    ],
    fallbackPools: [],
    cursor: null,
    ...overrides,
  };
}

function renderPage(creditDepth?: 1 | 2) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CreditGetPage voucherAddress={FIXTURE.voucherC} creditDepth={creditDepth} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.routes.mockImplementation(async (params: CreditRoutesParams) => page(params));
  mocks.getHealth.mockResolvedValue({
    ok: true,
    result: { relayerAddress: FIXTURE.relayer, chainId: 100, idempotentRelay: true },
  });
  mocks.relay.mockResolvedValue({
    ok: true,
    result: { trackingId: "f47ac10b-58cc-4372-a567-0e02b2c3d479" },
  });
});

async function chooseTwoHopForFiveCcc() {
  renderPage();
  fireEvent.change(await screen.findByLabelText("You get"), { target: { value: "5" } });
  await waitFor(() =>
    expect(mocks.routes).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "5000000", mode: "exactOutput" }),
      expect.anything(),
    ),
  );
  fireEvent.click(await screen.findByRole("button", { name: /AAA.*BBB.*CCC/ }));
  const review = screen.getByRole("button", { name: "Review" });
  await waitFor(() => expect(review.hasAttribute("disabled")).toBe(false));
  return review;
}

describe("CreditGetPage", () => {
  it("lists routes grouped by input voucher in the server's order, as estimates", async () => {
    renderPage();
    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Pay with AAA",
      "Pay with DDD",
    ]);

    const twoHop = await screen.findByRole("button", { name: /AAA.*BBB.*CCC/ });
    expect(twoHop.textContent).toContain("2 hops");
    expect(twoHop.textContent).toContain("Kilifi Pool · Mombasa Pool");
    expect(twoHop.textContent).toContain("1 AAA = 0.99 CCC");
    expect(twoHop.textContent).toContain("Up to 8.99 CCC");
    expect(twoHop.textContent).toContain("limited by pool liquidity");
    expect(twoHop.textContent).toContain("Fee 0.04%");
    // Hop one's fee is the pool default until its pair fee has been read.
    expect(within(twoHop).getByText("Fee not confirmed")).toBeTruthy();

    const oneHop = screen.getByRole("button", { name: /DDD.*CCC/ });
    expect(oneHop.textContent).toContain("1 hop");
    expect(oneHop.textContent).toContain("Capacity unknown");
    expect(within(oneHop).getByText("Estimate")).toBeTruthy();
    expect(screen.getByText(/Estimated at block/).textContent).toContain("49254469");
  });

  it("lists one-hop routes only when opened with Credit at depth 1", async () => {
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) =>
      params.depth === 1 ? page(params, { inputs: [page(params).inputs[1]] }) : page(params),
    );
    renderPage(1);
    expect(await screen.findByText("Pay with DDD")).toBeTruthy();
    expect(screen.queryByText("Pay with AAA")).toBeNull();
    expect(mocks.routes.mock.calls.every(([params]) => params.depth === 1)).toBe(true);

    fireEvent.change(screen.getByLabelText("You get"), { target: { value: "5" } });
    await waitFor(() =>
      expect(mocks.routes).toHaveBeenCalledWith(
        expect.objectContaining({ depth: 1, amount: "5000000", mode: "exactOutput" }),
        expect.anything(),
      ),
    );
  });

  it("lists every route the product offers (two hops) when Credit is off", async () => {
    renderPage();
    expect(await screen.findByText("Pay with AAA")).toBeTruthy();
    expect(mocks.routes.mock.calls[0]?.[0]).toMatchObject({ depth: 2 });
  });

  it("shows the pools that hold the voucher when no route reaches it", async () => {
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) =>
      page(params, {
        inputs: [],
        fallbackPools: [
          {
            address: FIXTURE.pool2,
            name: "Mombasa Pool",
            liquidity: "2799000000",
            accepts: [FIXTURE.voucherB, VOUCHER_D],
          },
        ],
      }),
    );
    renderPage();
    expect(await screen.findByText("No route from your vouchers reaches CCC.")).toBeTruthy();
    const pool = screen.getByRole("link", { name: /Mombasa Pool/ });
    expect(pool.getAttribute("href")).toBe(
      `/pools/${FIXTURE.pool2}/swap?receive=${FIXTURE.voucherC}`,
    );
    await waitFor(() => expect(pool.textContent).toContain("Takes BBB, DDD"));
    expect(pool.textContent).toContain("2,799.00 CCC");
  });

  it("treats an unavailable router as a retry, never as no routes", async () => {
    // The 503 is retried like any server fault before it is shown.
    let available = false;
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) => {
      if (available) return page(params);
      throw new BackendApiError(503, "router_unavailable", "E27", {
        retryAfterMs: 0,
        result: { state: "router_unavailable" },
      });
    });
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(mocks.routes.mock.calls.length).toBeGreaterThan(1);
    expect(alert.textContent).toContain("Routing is unavailable right now.");
    expect(screen.queryByText(/No route from your vouchers/)).toBeNull();
    available = true;
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Pay with AAA")).toBeTruthy();
  });

  it("restarts paging from the first page when the listing changed between pages", async () => {
    let changed = false;
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) => {
      if (params.cursor) {
        changed = true;
        throw new BackendApiError(409, "listing changed", "E28");
      }
      return page(params, { cursor: changed ? null : "page-2" });
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(mocks.routes.mock.calls.filter(([params]) => !params.cursor).length).toBe(2),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
    expect(screen.getByText("Pay with AAA")).toBeTruthy();
  });

  it("quotes the chosen route, reviews it, checks it and relays the app's own signature", async () => {
    const fixture = creditQuoteFixture({
      wallet: WALLET,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    mocks.quote.mockResolvedValue(fixture.quote);
    const review = await chooseTwoHopForFiveCcc();
    fireEvent.click(review);

    await waitFor(() => expect(mocks.quote).toHaveBeenCalledOnce());
    expect(mocks.quote.mock.calls[0]![0]).toEqual({
      route: [
        { pool: FIXTURE.pool1, tokenIn: FIXTURE.voucherA, tokenOut: FIXTURE.voucherB },
        { pool: FIXTURE.pool2, tokenIn: FIXTURE.voucherB, tokenOut: FIXTURE.voucherC },
      ],
      mode: "exactOutput",
      amount: "5000000",
      recipient: null,
      keyHash: `0x${"00".repeat(32)}`,
    });

    const sheet = await screen.findByRole("dialog");
    expect(sheet.textContent).toContain("You spend5.00 AAA");
    expect(sheet.textContent).toContain("You get5.00 CCC");
    expect(sheet.textContent).toContain("Minimum received5.00 CCC");
    expect(sheet.textContent).toContain("Effective fee0.04%");
    expect(sheet.textContent).toContain("Hop 1 · Kilifi Pool");
    expect(sheet.textContent).toContain("Hop 2 · Mombasa Pool");
    expect(sheet.textContent).toContain("Protocol fee<0.01 BBB");

    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(mocks.relay).toHaveBeenCalledOnce());
    const payload = mocks.relay.mock.calls[0]![0];
    expect(payload.userAddress).toBe(WALLET);
    expect(payload.operationId).toBeTruthy();
    expect(payload.signedBatch.executor).toBe(FIXTURE.relayer);
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/routed-swaps/$trackingId",
        params: { trackingId: "f47ac10b-58cc-4372-a567-0e02b2c3d479" },
      }),
    );
  });

  it("asks again for an expired quote instead of signing it", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = creditQuoteFixture({ wallet: WALLET, nowSeconds: now - 400 });
    const fresh = creditQuoteFixture({ wallet: WALLET, nowSeconds: now });
    mocks.quote.mockResolvedValueOnce(expired.quote).mockResolvedValueOnce(fresh.quote);
    fireEvent.click(await chooseTwoHopForFiveCcc());
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm" }));

    expect(
      await within(sheet).findByText(
        "The quote changed. Review the updated amounts before confirming.",
      ),
    ).toBeTruthy();
    expect(mocks.quote).toHaveBeenCalledTimes(2);
    expect(mocks.quote.mock.calls[1]![0]).toEqual(mocks.quote.mock.calls[0]![0]);
    expect(mocks.relay).not.toHaveBeenCalled();

    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(mocks.relay).toHaveBeenCalledOnce());
    expect(mocks.relay.mock.calls[0]![0].signedBatch.deadline).toBe(fresh.quote.batch.deadline);
  });

  it("refuses to sign a quote whose batch pays someone else", async () => {
    const fixture = creditQuoteFixture({
      wallet: WALLET,
      nowSeconds: Math.floor(Date.now() / 1000),
      tamper: (hops) =>
        hops.map((entry, index) =>
          index === 1 ? { ...entry, recipient: FIXTURE.attacker } : entry,
        ),
    });
    mocks.quote.mockResolvedValue(fixture.quote);
    fireEvent.click(await chooseTwoHopForFiveCcc());
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm" }));
    expect(
      await within(sheet).findByText(
        "This quote didn't match what you asked for, so it was not signed.",
      ),
    ).toBeTruthy();
    expect(mocks.relay).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(within(sheet).getByRole("button", { name: "Confirm" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it.each([
    [
      new BackendApiError(409, "route_unavailable", "E24", {
        result: { state: "route_unavailable", reason: "deposit_cap", hop: 0 },
      }),
      "A pool on this route can't take more of this voucher right now.",
    ],
    [
      new BackendApiError(409, "simulation_failed", "E26", {
        result: { revert: { reason: "LimitExceeded", message: "", data: "0x" } },
      }),
      "This exchange would fail: LimitExceeded.",
    ],
    [
      new BackendApiError(409, "quote_mismatch", "E25", { result: { hop: 1 } }),
      "A pool's price could not be confirmed.",
    ],
  ])("explains a refused quote (%s)", async (error, message) => {
    mocks.quote.mockRejectedValue(error);
    fireEvent.click(await chooseTwoHopForFiveCcc());
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
