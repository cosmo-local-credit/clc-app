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
  reach: vi.fn(),
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
  creditRouterClient: { reach: mocks.reach, routes: mocks.routes, quote: mocks.quote },
}));
vi.mock("#/lib/api/market", () => ({
  marketClient: {
    getMarketVoucher: async (address: string) => ({
      address,
      symbol: SYMBOLS[address.toLowerCase()] ?? "???",
      decimals: DECIMALS[address.toLowerCase()] ?? 6,
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
/** A voucher counted in 18 decimals, as an external token would be. */
const VOUCHER_E = getAddress(`0x${"e5".repeat(20)}`);
const SYMBOLS: Record<string, string> = {
  [FIXTURE.voucherA.toLowerCase()]: "AAA",
  [FIXTURE.voucherB.toLowerCase()]: "BBB",
  [FIXTURE.voucherC.toLowerCase()]: "CCC",
  [VOUCHER_D.toLowerCase()]: "DDD",
  [FIXTURE.voucherD.toLowerCase()]: "FFF",
  [VOUCHER_E.toLowerCase()]: "EEE",
};
/** Decimals other than the catalog's usual 6, by lower-case address. */
let DECIMALS: Record<string, number> = {};

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

type RouteFixture = {
  id: string;
  hops: ReturnType<typeof hop>[];
  rate: { amountIn: string; amountOut: string } | null;
  maxAmountIn: string | null;
  maxAmountOut: string | null;
  maxIsExact: boolean;
  limitedBy: string | null;
  limitedByHop?: number;
  effectiveFeePpm: string;
};

/** AAA to CCC through BBB: 1.02 AAA buys 1 CCC. */
const TWO_HOP: RouteFixture = {
  id: "r_two",
  hops: [
    hop(FIXTURE.pool1, "Kilifi Pool", FIXTURE.voucherA, FIXTURE.voucherB, "default"),
    hop(FIXTURE.pool2, "Mombasa Pool", FIXTURE.voucherB, FIXTURE.voucherC),
  ],
  rate: { amountIn: "1020000", amountOut: "1000000" },
  maxAmountIn: "9000000",
  maxAmountOut: "8823529",
  maxIsExact: true,
  limitedBy: "liquidity",
  limitedByHop: 1,
  effectiveFeePpm: "400",
};
/** AAA straight to CCC through Malindi, dearer than the route through BBB. */
const DIRECT_A: RouteFixture = {
  id: "r_direct",
  hops: [hop(FIXTURE.pool3, "Malindi Pool", FIXTURE.voucherA, FIXTURE.voucherC)],
  rate: { amountIn: "1100000", amountOut: "1000000" },
  maxAmountIn: "9000000",
  maxAmountOut: "8181818",
  maxIsExact: true,
  limitedBy: "wallet",
  limitedByHop: 0,
  effectiveFeePpm: "200",
};
const ONE_HOP: RouteFixture = {
  id: "r_one",
  hops: [hop(FIXTURE.pool2, "Mombasa Pool", VOUCHER_D, FIXTURE.voucherC)],
  rate: { amountIn: "1000000", amountOut: "999800" },
  maxAmountIn: null,
  maxAmountOut: null,
  maxIsExact: false,
  limitedBy: null,
  effectiveFeePpm: "200",
};

/** Three hops to FFF: AAA, BBB and CCC through Kilifi, Mombasa and Malindi. */
const THREE_HOP: RouteFixture = {
  id: "r_three",
  hops: [
    hop(FIXTURE.pool1, "Kilifi Pool", FIXTURE.voucherA, FIXTURE.voucherB),
    hop(FIXTURE.pool2, "Mombasa Pool", FIXTURE.voucherB, FIXTURE.voucherC),
    hop(FIXTURE.pool3, "Malindi Pool", FIXTURE.voucherC, FIXTURE.voucherD),
  ],
  rate: { amountIn: "1000000", amountOut: "999400" },
  maxAmountIn: "9000000",
  maxAmountOut: "8994600",
  maxIsExact: false,
  limitedBy: "deposit_cap",
  limitedByHop: 2,
  effectiveFeePpm: "600",
};

/**
 * A route priced at the request's amount: getting costs 2% more of the
 * voucher spent, spending pays out 2% less. `refuse` makes it fall short.
 */
function priced(
  route: RouteFixture,
  params: CreditRoutesParams,
  refuse?: { reason: string; maxAmountIn?: string; maxAmountOut?: string },
) {
  if (params.amount === undefined) return route;
  if (refuse) {
    return {
      ...route,
      ...(refuse.maxAmountIn ? { maxAmountIn: refuse.maxAmountIn } : {}),
      ...(refuse.maxAmountOut ? { maxAmountOut: refuse.maxAmountOut } : {}),
      carriesAmount: false,
      refusal: { reason: refuse.reason, hop: 0 },
    };
  }
  const amount = BigInt(params.amount);
  const [amountIn, amountOut] =
    params.mode === "exactOutput"
      ? [(amount * 102n) / 100n, amount]
      : [amount, (amount * 98n) / 100n];
  return {
    ...route,
    carriesAmount: true,
    amountIn: amountIn.toString(),
    amountOut: amountOut.toString(),
  };
}

function threeHopPage(params: CreditRoutesParams) {
  return {
    target: { address: FIXTURE.voucherD, symbol: "FFF", decimals: 6 },
    asOfBlock: 49254469,
    graphVersion: 812,
    stale: false,
    complete: true,
    inputs: [
      { voucher: FIXTURE.voucherA, walletBalance: "9000000", routes: [priced(THREE_HOP, params)] },
    ],
    fallbackPools: [],
    cursor: null,
  };
}

function page(params: CreditRoutesParams, overrides: Record<string, unknown> = {}) {
  return {
    target: { address: FIXTURE.voucherC, symbol: "CCC", decimals: 6 },
    asOfBlock: 49254469,
    graphVersion: 812,
    stale: false,
    complete: true,
    inputs: [
      { voucher: FIXTURE.voucherA, walletBalance: "9000000", routes: [priced(TWO_HOP, params)] },
      { voucher: VOUCHER_D, walletBalance: "3000000", routes: [priced(ONE_HOP, params)] },
    ],
    fallbackPools: [],
    cursor: null,
    ...overrides,
  };
}

function renderPage(voucherAddress: `0x${string}` = FIXTURE.voucherC) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CreditGetPage voucherAddress={voucherAddress} />
    </QueryClientProvider>,
  );
}

/** The wallet's reach: it holds AAA and DDD, and whatever `held` adds. */
function reach(held: { voucher: string; balance: string }[] = []) {
  return {
    depth: 3,
    maxHops: 3,
    asOfBlock: 49254469,
    graphVersion: 812,
    stale: false,
    digest: `0x${"ab".repeat(32)}`,
    inputs: [
      { voucher: FIXTURE.voucherA, balance: "9000000" },
      { voucher: VOUCHER_D, balance: "3000000" },
      ...held,
    ],
    vouchers: [],
    pools: [],
  };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  DECIMALS = {};
  mocks.reach.mockResolvedValue(reach());
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

/** The routes were asked for at this raw amount. */
async function pricedAt(amount: string, mode: "exactInput" | "exactOutput") {
  await waitFor(() =>
    expect(mocks.routes).toHaveBeenCalledWith(
      expect.objectContaining({ amount, mode }),
      expect.anything(),
    ),
  );
}

/** The row for one voucher in the Pay with list: its radio's label and the line under it. */
function row(symbol: string): HTMLElement {
  const radio = screen.getByRole("radio", { name: new RegExp(`^${symbol}`) });
  return radio.closest("label")!.parentElement!;
}

async function chooseTwoHopForFiveCcc() {
  renderPage();
  fireEvent.change(await screen.findByLabelText("You get"), { target: { value: "5" } });
  await pricedAt("5000000", "exactOutput");
  await waitFor(() => expect(row("AAA").textContent).toContain("≈ 5.10 AAA"));
  fireEvent.click(screen.getByRole("radio", { name: /^AAA/ }));
  const review = screen.getByRole("button", { name: "Review" });
  await waitFor(() => expect(review.hasAttribute("disabled")).toBe(false));
  return review;
}

/**
 * The review's collapsed Route details: checked closed, then opened. Its
 * summary names the swaps; everything else sits inside.
 */
function openRouteDetails(sheet: HTMLElement, summary: string): HTMLElement {
  const found = [...sheet.querySelectorAll("summary")].find(
    (element) => element.textContent === summary,
  );
  expect(found).toBeTruthy();
  const details = found!.parentElement as HTMLDetailsElement;
  expect(details.open).toBe(false);
  // The same turning chevron as the Pay with rows marks it as one to open.
  expect(details.querySelector("summary svg[aria-hidden='true']")).toBeTruthy();
  fireEvent.click(details.querySelector("summary")!);
  expect(details.open).toBe(true);
  return details;
}

describe("CreditGetPage", () => {
  it("lists one Pay with row per voucher, with its best route's swaps and the rate before an amount", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 2, name: "Pay with" })).toBeTruthy();
    const radios = await screen.findAllByRole("radio");
    expect(radios.map((radio) => radio.closest("label")!.textContent)).toEqual([
      "AAA1 CCC ≈ 1.02 AAA",
      "DDD1 CCC ≈ 1.00 DDD",
    ]);
    // Several vouchers are separate choices: none is picked for the person.
    expect(radios.some((radio) => radio.hasAttribute("data-checked"))).toBe(false);
    expect(within(row("AAA")).getByRole("button", { name: "2 swaps" })).toBeTruthy();
    expect(within(row("DDD")).getByRole("button", { name: "1 swap" })).toBeTruthy();
    // Routing details stay closed until asked for.
    expect(screen.queryByText(/Kilifi Pool/)).toBeNull();
    expect(screen.getByRole("button", { name: "Review" }).hasAttribute("disabled")).toBe(true);
  });

  it("opens a voucher's swaps, pools, fees and capacity on demand", async () => {
    renderPage();
    await screen.findAllByRole("radio");
    const toggle = within(row("AAA")).getByRole("button", { name: "2 swaps" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    const details = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    const text = details.textContent ?? "";
    expect(text).toContain("via BBB");
    expect(text).toContain("Rate1 AAA ≈ 0.98 CCC");
    expect(text).toContain("Fee0.04%");
    expect(text).toContain("Up to 8.82 CCC");
    expect(text).toContain("Swap 1: AAA → BBB · Kilifi Pool");
    expect(text).toContain("Swap 2: BBB → CCC · Mombasa Pool");
    expect(text).toContain("Protocol fee 2.00%");
    expect(text).toContain("Estimated at block 49254469");
    // Swap one's fee is the pool default until its pair fee has been read.
    expect(within(details).getAllByText("Fee not confirmed")).toHaveLength(1);
    expect(within(details).getByText("Estimate")).toBeTruthy();

    const direct = within(row("DDD")).getByRole("button", { name: "1 swap" });
    fireEvent.click(direct);
    const directDetails = document.getElementById(direct.getAttribute("aria-controls")!)!;
    expect(directDetails.textContent).toContain("Capacity unknown");
    expect(directDetails.textContent).not.toContain("via");
  });

  it("lists a voucher's other routes under Other ways, and makes a chosen one the row's route", async () => {
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) =>
      page(params, {
        inputs: [
          {
            voucher: FIXTURE.voucherA,
            walletBalance: "9000000",
            routes: [priced(TWO_HOP, params), priced(DIRECT_A, params)],
          },
          { voucher: VOUCHER_D, walletBalance: "3000000", routes: [priced(ONE_HOP, params)] },
        ],
      }),
    );
    renderPage();
    // Still one row per voucher.
    expect(await screen.findAllByRole("radio")).toHaveLength(2);
    expect(row("AAA").textContent).toContain("1 CCC ≈ 1.02 AAA");

    fireEvent.click(within(row("AAA")).getByRole("button", { name: "2 swaps" }));
    expect(within(row("AAA")).getByRole("heading", { name: "Other ways" })).toBeTruthy();
    const other = within(row("AAA")).getByRole("button", { name: /1 swap.*Malindi Pool/ });
    expect(other.textContent).toContain("1 CCC ≈ 1.10 AAA");
    fireEvent.click(other);

    // The direct route now stands for AAA, and the one through BBB is the other way.
    await waitFor(() => expect(row("AAA").textContent).toContain("1 CCC ≈ 1.10 AAA"));
    expect(within(row("AAA")).getByRole("button", { name: "1 swap" })).toBeTruthy();
    expect(within(row("AAA")).getByRole("button", { name: /2 swaps · via BBB/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^AAA/ }).hasAttribute("data-checked")).toBe(true);
  });

  it("shows what each voucher costs when getting, and what it pays out when spending", async () => {
    renderPage();
    // Get is the mode a person starts in, and it shows as the one chosen.
    const getMode = await screen.findByRole("button", { name: "Get" });
    expect(getMode.getAttribute("aria-pressed")).toBe("true");
    expect(getMode.hasAttribute("data-pressed")).toBe(true);
    expect(screen.getByRole("button", { name: "Spend" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    fireEvent.change(await screen.findByLabelText("You get"), { target: { value: "5" } });
    await pricedAt("5000000", "exactOutput");
    await waitFor(() => expect(row("AAA").textContent).toContain("≈ 5.10 AAA"));
    expect(row("DDD").textContent).toContain("≈ 5.10 DDD");

    fireEvent.click(screen.getByRole("button", { name: "Spend" }));
    expect((screen.getByLabelText("You spend") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Spend" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Get" }).getAttribute("aria-pressed")).toBe("false");
    // Pressing the active mode again keeps it rather than turning it off.
    fireEvent.click(screen.getByRole("button", { name: "Spend" }));
    expect(screen.getByRole("button", { name: "Spend" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByLabelText("You spend"), { target: { value: "5" } });
    await pricedAt("5000000", "exactInput");
    await waitFor(() => expect(row("AAA").textContent).toContain("≈ 4.90 CCC"));
    expect(row("DDD").textContent).toContain("≈ 4.90 CCC");
    // Every voucher is priced in one listing, never one voucher at a time.
    for (const [params] of mocks.routes.mock.calls) expect(params).not.toHaveProperty("from");
  });

  it("shows the spend rate in the voucher spent before an amount", async () => {
    renderPage();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: "Spend" }));
    await waitFor(() => expect(row("AAA").textContent).toContain("1 AAA ≈ 0.98 CCC"));
  });

  it("names the amount's unit: the target when getting, the voucher paid with when spending", async () => {
    renderPage();
    await screen.findAllByRole("radio");
    const unit = () => screen.getByLabelText(/^You (get|spend)$/).parentElement!.lastElementChild!;
    await waitFor(() => expect(unit().textContent).toBe("CCC"));

    fireEvent.click(screen.getByRole("button", { name: "Spend" }));
    // No voucher is picked yet, so the amount counts in whichever one will pay.
    const hint = screen.getByText("of the voucher you pay with");
    expect(unit()).toBe(hint);
    expect(screen.getByLabelText("You spend").getAttribute("aria-describedby")).toBe(hint.id);

    fireEvent.click(screen.getByRole("radio", { name: /^AAA/ }));
    await waitFor(() => expect(unit().textContent).toBe("AAA"));
    expect(screen.queryByText("of the voucher you pay with")).toBeNull();
    expect(screen.getByLabelText("You spend").hasAttribute("aria-describedby")).toBe(false);
  });

  it("says More than you have when the wallet is the limit, and offers the most a pool takes", async () => {
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) =>
      page(params, {
        inputs: [
          {
            voucher: FIXTURE.voucherA,
            walletBalance: "9000000",
            routes: [
              BigInt(params.amount ?? "0") > 3_000_000n
                ? priced(TWO_HOP, params, { reason: "liquidity", maxAmountOut: "3004000" })
                : priced(TWO_HOP, params),
            ],
          },
          {
            voucher: VOUCHER_D,
            walletBalance: "3000000",
            routes: [priced(ONE_HOP, params, { reason: "wallet_balance" })],
          },
        ],
      }),
    );
    renderPage();
    fireEvent.change(await screen.findByLabelText("You get"), { target: { value: "50" } });
    await pricedAt("50000000", "exactOutput");

    await waitFor(() => expect(row("DDD").textContent).toContain("More than you have"));
    const max = within(row("AAA")).getByRole("button", { name: "Max 3.00 CCC" });
    // Neither row can carry the amount, so neither can be picked.
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.hasAttribute("data-disabled")).toBe(true);
    }
    expect(screen.getByRole("button", { name: "Review" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(max);
    expect((screen.getByLabelText("You get") as HTMLInputElement).value).toBe("3.00");
    await pricedAt("3000000", "exactOutput");
    await waitFor(() => expect(row("AAA").textContent).toContain("≈ 3.06 AAA"));
    expect(screen.getByRole("radio", { name: /^AAA/ }).hasAttribute("data-checked")).toBe(true);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review" }).hasAttribute("disabled")).toBe(false),
    );
  });

  it("fills the most a pool takes in the voucher spent when spending", async () => {
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) =>
      page(params, {
        inputs: [
          {
            voucher: FIXTURE.voucherA,
            walletBalance: "9000000",
            routes: [priced(TWO_HOP, params, { reason: "deposit_cap", maxAmountIn: "2500000" })],
          },
          { voucher: VOUCHER_D, walletBalance: "3000000", routes: [priced(ONE_HOP, params)] },
        ],
      }),
    );
    renderPage();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: "Spend" }));
    fireEvent.change(screen.getByLabelText("You spend"), { target: { value: "8" } });
    await pricedAt("8000000", "exactInput");

    fireEvent.click(await within(row("AAA")).findByRole("button", { name: "Max 2.50 AAA" }));
    expect((screen.getByLabelText("You spend") as HTMLInputElement).value).toBe("2.50");
    await pricedAt("2500000", "exactInput");
  });

  it("picks the one voucher that can pay, and leaves the others visible", async () => {
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) =>
      page(params, {
        inputs: [
          {
            voucher: FIXTURE.voucherA,
            walletBalance: "9000000",
            routes: [priced(TWO_HOP, params)],
          },
          {
            voucher: VOUCHER_D,
            walletBalance: "3000000",
            routes: [priced(ONE_HOP, params, { reason: "wallet_balance" })],
          },
        ],
      }),
    );
    renderPage();
    fireEvent.change(await screen.findByLabelText("You get"), { target: { value: "5" } });
    await pricedAt("5000000", "exactOutput");
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /^AAA/ }).hasAttribute("data-checked")).toBe(true),
    );
    expect(screen.getByRole("radio", { name: /^DDD/ }).hasAttribute("data-disabled")).toBe(true);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review" }).hasAttribute("disabled")).toBe(false),
    );
  });

  it("shows a single voucher as the choice already made, without a radio list", async () => {
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) =>
      page(params, {
        inputs: [
          {
            voucher: FIXTURE.voucherA,
            walletBalance: "9000000",
            routes: [priced(TWO_HOP, params)],
          },
        ],
      }),
    );
    renderPage();
    expect(await screen.findByRole("heading", { name: "Pay with" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("1 CCC ≈ 1.02 AAA")).toBeTruthy());
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();

    fireEvent.change(screen.getByLabelText("You get"), { target: { value: "5" } });
    await pricedAt("5000000", "exactOutput");
    await waitFor(() => expect(screen.getByText("≈ 5.10 AAA")).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review" }).hasAttribute("disabled")).toBe(false),
    );
  });

  it("prices a voucher with other decimals only once it is picked to spend", async () => {
    DECIMALS = { [VOUCHER_E.toLowerCase()]: 18 };
    const E_ROUTE: RouteFixture = {
      ...ONE_HOP,
      id: "r_e",
      hops: [hop(FIXTURE.pool2, "Mombasa Pool", VOUCHER_E, FIXTURE.voucherC)],
      rate: { amountIn: "1000000000000000000", amountOut: "1000000" },
    };
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) =>
      page(params, {
        inputs: [
          {
            voucher: FIXTURE.voucherA,
            walletBalance: "9000000",
            routes: [priced(TWO_HOP, params)],
          },
          { voucher: VOUCHER_E, walletBalance: "1", routes: [priced(E_ROUTE, params)] },
        ],
      }),
    );
    renderPage();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: "Spend" }));
    fireEvent.click(screen.getByRole("radio", { name: /^AAA/ }));
    fireEvent.change(screen.getByLabelText("You spend"), { target: { value: "5" } });
    await pricedAt("5000000", "exactInput");
    await waitFor(() => expect(row("AAA").textContent).toContain("≈ 4.90 CCC"));
    // Five in six decimals is not five EEE: that row keeps its rate.
    expect(row("EEE").textContent).toContain("1 EEE ≈ 1.00 CCC");

    fireEvent.click(screen.getByRole("radio", { name: /^EEE/ }));
    await pricedAt("5000000000000000000", "exactInput");
    await waitFor(() => expect(row("EEE").textContent).toContain("≈ 4.90 CCC"));
    expect(row("AAA").textContent).toContain("1 AAA ≈ 0.98 CCC");
  });

  it("renders a three-hop route the way it renders any other", async () => {
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) => threeHopPage(params));
    renderPage(FIXTURE.voucherD);

    const toggle = await screen.findByRole("button", { name: "3 swaps" });
    fireEvent.click(toggle);
    const text = document.getElementById(toggle.getAttribute("aria-controls")!)!.textContent;
    expect(text).toContain("via BBB, CCC");
    expect(text).toContain("Rate1 AAA ≈ 0.99 FFF");
    expect(text).toContain("At least 8.99 FFF");
    expect(text).toContain("Fee0.06%");
    expect(text).toContain("Swap 3: CCC → FFF · Malindi Pool");
  });

  it("quotes, reviews, checks and relays a three-hop route", async () => {
    const fixture = creditQuoteFixture({
      wallet: WALLET,
      nowSeconds: Math.floor(Date.now() / 1000),
      hops: 3,
    });
    mocks.quote.mockResolvedValue(fixture.quote);
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) => threeHopPage(params));
    renderPage(FIXTURE.voucherD);

    fireEvent.change(await screen.findByLabelText("You get"), { target: { value: "5" } });
    await waitFor(() =>
      expect(mocks.routes).toHaveBeenCalledWith(
        expect.objectContaining({ amount: "5000000", mode: "exactOutput" }),
        expect.anything(),
      ),
    );
    // The one voucher that can pay is already chosen.
    expect(screen.queryByRole("radio")).toBeNull();
    const review = screen.getByRole("button", { name: "Review" });
    await waitFor(() => expect(review.hasAttribute("disabled")).toBe(false));
    fireEvent.click(review);

    await waitFor(() => expect(mocks.quote).toHaveBeenCalledOnce());
    expect(mocks.quote.mock.calls[0]![0].route).toEqual(fixture.request.route);
    const sheet = await screen.findByRole("dialog");
    expect(sheet.textContent).toContain("You get5.00 FFF");
    const route = openRouteDetails(sheet, "Route details · 3 swaps");
    const swaps = route.textContent ?? "";
    expect(swaps.indexOf("Swap 1: AAA → BBB · Kilifi Pool")).toBeGreaterThan(-1);
    expect(swaps.indexOf("Swap 1: AAA → BBB · Kilifi Pool")).toBeLessThan(
      swaps.indexOf("Swap 2: BBB → CCC · Mombasa Pool"),
    );
    expect(swaps.indexOf("Swap 2: BBB → CCC · Mombasa Pool")).toBeLessThan(
      swaps.indexOf("Swap 3: CCC → FFF · Malindi Pool"),
    );

    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(mocks.relay).toHaveBeenCalledOnce());
    expect(mocks.relay.mock.calls[0]![0].signedBatch.batchedCall.calls).toHaveLength(9);
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/routed-swaps/$trackingId",
        params: { trackingId: "f47ac10b-58cc-4372-a567-0e02b2c3d479" },
      }),
    );
  });

  it("says how much of the voucher the wallet already has, above the options it still lists", async () => {
    mocks.reach.mockResolvedValue(reach([{ voucher: FIXTURE.voucherC, balance: "2500000" }]));
    renderPage();

    const held = await screen.findByText(/You already have/);
    expect(held.textContent).toBe("You already have 2.50 CCC");
    const payWith = await screen.findByRole("heading", { name: "Pay with" });
    // The panel comes first in the page, and the options are still there.
    expect(held.compareDocumentPosition(payWith) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(held.compareDocumentPosition(screen.getByLabelText("You get"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByRole("radio", { name: /^AAA/ })).toBeTruthy();
  });

  it("says nothing of a voucher the wallet holds none of", async () => {
    mocks.reach.mockResolvedValue(reach([{ voucher: FIXTURE.voucherC, balance: "0" }]));
    renderPage();
    expect(await screen.findByRole("radio", { name: /^AAA/ })).toBeTruthy();
    await waitFor(() => expect(mocks.reach).toHaveBeenCalled());
    expect(screen.queryByText(/You already have/)).toBeNull();
  });

  it("still lists options when the reach cannot be read", async () => {
    mocks.reach.mockRejectedValue(new BackendApiError(401, "no session", "E06"));
    renderPage();
    expect(await screen.findByRole("radio", { name: /^AAA/ })).toBeTruthy();
    expect(screen.queryByText(/You already have/)).toBeNull();
  });

  it("asks for routes without a depth, so the router lists up to its maximum", async () => {
    renderPage();
    expect(await screen.findByRole("radio", { name: /^AAA/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("You get"), { target: { value: "5" } });
    await waitFor(() =>
      expect(mocks.routes).toHaveBeenCalledWith(
        expect.objectContaining({ amount: "5000000", mode: "exactOutput" }),
        expect.anything(),
      ),
    );
    for (const [params] of mocks.routes.mock.calls) expect(params).not.toHaveProperty("depth");
  });

  it("says plainly when nothing the wallet holds reaches the voucher, with the pools that hold it", async () => {
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
    const none = await screen.findByText("No way to get CCC with what you hold");
    expect(none.getAttribute("role")).toBe("status");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Pay with" })).toBeNull();
    const pool = screen.getByRole("link", { name: /Mombasa Pool/ });
    expect(pool.getAttribute("href")).toBe(
      `/pools/${FIXTURE.pool2}/swap?receive=${FIXTURE.voucherC}`,
    );
    await waitFor(() => expect(pool.textContent).toContain("Takes BBB, DDD"));
    expect(pool.textContent).toContain("2,799.00 CCC");
  });

  it("treats an unavailable router as Exchange unavailable with a retry, never as no options", async () => {
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
    expect(alert.textContent).toContain("Exchange unavailable");
    expect(screen.queryByText(/No way to get/)).toBeNull();
    available = true;
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("radio", { name: /^AAA/ })).toBeTruthy();
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
    expect(screen.getByRole("radio", { name: /^AAA/ })).toBeTruthy();
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
    expect(sheet.textContent).toContain("Fee0.04%");
    // Getting an exact amount guarantees it: no minimum, and no extra when there is none.
    expect(sheet.textContent).not.toContain("Minimum received");
    expect(sheet.textContent).not.toContain("Extra received");
    const route = openRouteDetails(sheet, "Route details · 2 swaps");
    expect(route.textContent).toContain("Swap 1: AAA → BBB · Kilifi Pool");
    expect(route.textContent).toContain("Swap 2: BBB → CCC · Mombasa Pool");
    expect(route.textContent).toContain("Protocol fee<0.01 BBB");
    expect(route.textContent).toContain("Quote valid until");

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

    const changed = await within(sheet).findByText("Amounts changed. Review again.");
    // The notice stays outside the collapsed route details.
    expect(changed.closest("details")).toBeNull();
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
    const refused = await within(sheet).findByText("Quote didn't match your request. Not signed.");
    expect(refused.closest("details")).toBeNull();
    expect(mocks.relay).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(within(sheet).getByRole("button", { name: "Confirm" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("reviews an amount to spend with its minimum received", async () => {
    const fixture = creditQuoteFixture({
      wallet: WALLET,
      nowSeconds: Math.floor(Date.now() / 1000),
      mode: "exactInput",
      surplus: { output: "1000" },
    });
    mocks.quote.mockResolvedValue(fixture.quote);
    renderPage();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: "Spend" }));
    fireEvent.click(screen.getByRole("radio", { name: /^AAA/ }));
    fireEvent.change(screen.getByLabelText("You spend"), { target: { value: "5" } });
    await pricedAt("5000000", "exactInput");
    const review = screen.getByRole("button", { name: "Review" });
    await waitFor(() => expect(review.hasAttribute("disabled")).toBe(false));
    fireEvent.click(review);

    await waitFor(() => expect(mocks.quote).toHaveBeenCalledOnce());
    expect(mocks.quote.mock.calls[0]![0]).toMatchObject({ mode: "exactInput", amount: "5000000" });
    const sheet = await screen.findByRole("dialog");
    expect(sheet.textContent).toContain("You spend5.00 AAA");
    expect(sheet.textContent).toContain("Minimum received5.00 CCC");
    // Extra received belongs to getting an exact amount.
    expect(sheet.textContent).not.toContain("Extra received");
  });

  it("states extra received when getting only when there is some", async () => {
    const fixture = creditQuoteFixture({
      wallet: WALLET,
      nowSeconds: Math.floor(Date.now() / 1000),
      surplus: { output: "40000", bridge: [{ voucher: FIXTURE.voucherB, amount: "3000" }] },
    });
    mocks.quote.mockResolvedValue(fixture.quote);
    fireEvent.click(await chooseTwoHopForFiveCcc());
    const sheet = await screen.findByRole("dialog");
    expect(sheet.textContent).toContain("Extra received0.04 CCC");
    expect(sheet.textContent).not.toContain("Minimum received");
    // A bridge remainder is route detail, inside the collapsed section.
    const route = openRouteDetails(sheet, "Route details · 2 swaps");
    expect(route.textContent).toContain("Left in your wallet0.00 BBB");
  });

  it.each([
    [
      new BackendApiError(409, "route_unavailable", "E24", {
        result: { state: "route_unavailable", reason: "deposit_cap", hop: 0 },
      }),
      "A pool can't take more right now",
      "Change amount",
    ],
    [
      new BackendApiError(409, "route_unavailable", "E24", {
        result: { state: "route_unavailable", reason: "wallet_balance", hop: -1 },
      }),
      "More than you have",
      "Change amount",
    ],
    [
      new BackendApiError(409, "simulation_failed", "E26", {
        result: { revert: { reason: "LimitExceeded", message: "", data: "0x" } },
      }),
      "Exchange would fail: LimitExceeded",
      "Change amount",
    ],
    [
      new BackendApiError(409, "quote_mismatch", "E25", { result: { hop: 1 } }),
      "Price couldn't be confirmed",
      "Try again",
    ],
    [
      new BackendApiError(503, "router_unavailable", "E27", { retryAfterMs: 0 }),
      "Exchange unavailable",
      "Try again",
    ],
  ])("explains a refused quote with its next step (%s)", async (error, message, action) => {
    mocks.quote.mockRejectedValue(error);
    fireEvent.click(await chooseTwoHopForFiveCcc());
    const alert = (await screen.findByText(message)).closest("[role=alert]") as HTMLElement;
    expect(screen.queryByRole("dialog")).toBeNull();
    const next = within(alert).getByRole("button", { name: action });
    fireEvent.click(next);
    if (action === "Change amount") {
      expect(document.activeElement).toBe(screen.getByLabelText("You get"));
      expect(mocks.quote).toHaveBeenCalledOnce();
    } else {
      await waitFor(() => expect(mocks.quote).toHaveBeenCalledTimes(2));
    }
  });
});
