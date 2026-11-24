import type { CreditRoutesParams } from "@clc/api/features/credit-router/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

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
  createFileRoute: () => (options: object) => ({
    options,
    useParams: () => ({ voucherAddress: FIXTURE.voucherC }),
  }),
  retainSearchParams: () => () => {},
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

vi.mock("#/components/auth/authenticated-route", () => ({
  AuthenticatedRoute: ({ children }: { children: ReactNode }) => children,
}));

import { creditQuoteFixture, FIXTURE } from "#/features/credit/api/-credit-quote-fixture";
import { DESKTOP_MEDIA } from "#/desktop/layout";
import { DesktopShortcuts } from "#/desktop/shell/shortcuts";
import { Route } from "#/routes/_nav/get/$voucherAddress";

const SYMBOLS: Record<string, string> = {
  [FIXTURE.voucherA.toLowerCase()]: "AAA",
  [FIXTURE.voucherB.toLowerCase()]: "BBB",
  [FIXTURE.voucherC.toLowerCase()]: "CCC",
  [FIXTURE.voucherD.toLowerCase()]: "DDD",
};
const DECIMALS: Record<string, number> = {};
const FIRST = {
  id: "first",
  hops: [
    {
      pool: { address: FIXTURE.pool1, name: "Kilifi Pool" },
      tokenIn: FIXTURE.voucherA,
      tokenOut: FIXTURE.voucherB,
      feePpm: "0",
      protocolFeePpm: "20000",
      feeSource: "default",
    },
    {
      pool: { address: FIXTURE.pool2, name: "Mombasa Pool" },
      tokenIn: FIXTURE.voucherB,
      tokenOut: FIXTURE.voucherC,
      feePpm: "0",
      protocolFeePpm: "20000",
      feeSource: "pair",
    },
  ],
  rate: { amountIn: "1020000", amountOut: "1000000" },
  maxAmountIn: "9000000",
  maxAmountOut: "8000000",
  maxIsExact: true,
  limitedBy: "liquidity",
  effectiveFeePpm: "400",
};
const SECOND = {
  ...FIRST,
  id: "second",
  hops: [
    {
      pool: { address: FIXTURE.pool3, name: "Malindi Pool" },
      tokenIn: FIXTURE.voucherD,
      tokenOut: FIXTURE.voucherC,
      feePpm: "0",
      protocolFeePpm: "20000",
      feeSource: "pair",
    },
  ],
};
const ALTERNATE = {
  ...FIRST,
  id: "alternate",
  hops: [
    {
      pool: { address: FIXTURE.pool3, name: "Malindi Pool" },
      tokenIn: FIXTURE.voucherA,
      tokenOut: FIXTURE.voucherC,
      feePpm: "0",
      protocolFeePpm: "20000",
      feeSource: "pair",
    },
  ],
  maxAmountIn: "7500000",
  maxAmountOut: "7000000",
};
function page(params: CreditRoutesParams, empty = false) {
  return {
    target: { address: FIXTURE.voucherC, symbol: "CCC", decimals: 6 },
    asOfBlock: 49254469,
    graphVersion: 812,
    stale: false,
    complete: true,
    inputs: empty
      ? []
      : [FIRST, SECOND].map((route) => ({
          voucher: route.hops[0]!.tokenIn,
          walletBalance: "9000000",
          routes: [
            {
              ...route,
              ...(params.amount
                ? { carriesAmount: true, amountIn: params.amount, amountOut: params.amount }
                : {}),
            },
          ],
        })),
    fallbackPools: [],
    cursor: null,
  };
}
const originalMatchMedia = window.matchMedia;
const media = { matches: true, listeners: new Set<() => void>() };
function setDesktop(matches: boolean) {
  act(() => {
    media.matches = matches;
    for (const listener of media.listeners) listener();
  });
}
const clients: QueryClient[] = [];
function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const Component = Route.options.component!;
  return render(
    <QueryClientProvider client={client}>
      <DesktopShortcuts />
      <Component />
    </QueryClientProvider>,
  );
}
function payRow(symbol: string) {
  const table = screen.getByRole("table", { name: "Pay with" });
  return within(table).getByRole("row", { name: new RegExp(`^${symbol}`) });
}
function paySelector(symbol: string) {
  return within(payRow(symbol)).getByRole("button", { name: symbol });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  media.matches = true;
  media.listeners.clear();
  document.documentElement.dataset.layout = "desktop";
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return query === DESKTOP_MEDIA ? media.matches : false;
    },
    onchange: null,
    addEventListener: (_event: string, listener: () => void) => {
      if (query === DESKTOP_MEDIA) media.listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: () => void) => media.listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => true,
  }));
  mocks.reach.mockResolvedValue({ depth: 3, maxHops: 3, inputs: [], vouchers: [], pools: [] });
  mocks.routes.mockImplementation(async (params: CreditRoutesParams) => page(params));
  mocks.quote.mockImplementation(
    async () =>
      creditQuoteFixture({ wallet: WALLET, nowSeconds: Math.floor(Date.now() / 1000) }).quote,
  );
});
afterEach(() => {
  vi.stubGlobal("matchMedia", originalMatchMedia);
  delete document.documentElement.dataset.layout;
  for (const client of clients.splice(0)) client.clear();
});

describe("desktop Get", () => {
  it("compares payment vouchers in a table and keeps route fees visible", async () => {
    renderPage();
    expect(await screen.findByRole("table", { name: "Pay with" })).toBeTruthy();
    expect(payRow("AAA").textContent).toContain("9.00");
    expect(payRow("DDD").textContent).toContain("9.00");
    const details = screen.getByRole("table", { name: "Route details" });
    expect(within(details).getByRole("link", { name: "Kilifi Pool" }).getAttribute("href")).toBe(
      `/pools/${FIXTURE.pool1}`,
    );
    expect(within(details).getByRole("link", { name: "Mombasa Pool" }).getAttribute("href")).toBe(
      `/pools/${FIXTURE.pool2}`,
    );
    expect(within(payRow("AAA")).getByRole("button", { name: "Max 8.00 CCC" })).toBeTruthy();
    expect(payRow("AAA").querySelector("button button")).toBeNull();
    expect(screen.getAllByText("Fee not confirmed")[0]).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review" }).hasAttribute("disabled")).toBe(true);
    expect(document.querySelector("summary")).toBeNull();
  });

  it("quotes the selected voucher and opens a desktop review before signing", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("You get"), { target: { value: "5" } });
    await screen.findByRole("table", { name: "Pay with" });
    fireEvent.click(paySelector("AAA"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review" }).hasAttribute("disabled")).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm exchange" });
    expect(mocks.quote).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "5000000", mode: "exactOutput" }),
    );
    expect(within(dialog).getByRole("link", { name: "Kilifi Pool" }).getAttribute("href")).toBe(
      `/pools/${FIXTURE.pool1}`,
    );
    expect(within(dialog).getByRole("link", { name: "Mombasa Pool" }).getAttribute("href")).toBe(
      `/pools/${FIXTURE.pool2}`,
    );
    expect(within(dialog).getByText("Quote valid until")).toBeTruthy();
    expect(dialog.querySelector("summary")).toBeNull();
    expect(mocks.relay).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((screen.getByLabelText("You get") as HTMLInputElement).value).toBe("5");
  });

  it("keeps the amount, selected voucher and review when switching between views", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("You get"), { target: { value: "5" } });
    await screen.findByRole("table", { name: "Pay with" });
    fireEvent.click(paySelector("AAA"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review" }).hasAttribute("disabled")).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await screen.findByRole("dialog", { name: "Confirm exchange" });
    setDesktop(false);
    const mobile = await screen.findByRole("dialog", { name: "Confirm exchange" });
    expect(mobile.querySelector("summary")).toBeTruthy();
    setDesktop(true);
    const desktop = await screen.findByRole("dialog", { name: "Confirm exchange" });
    expect(desktop.querySelector("summary")).toBeNull();
    fireEvent.click(within(desktop).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((screen.getByLabelText("You get") as HTMLInputElement).value).toBe("5");
    expect(paySelector("AAA").getAttribute("aria-pressed")).toBe("true");
    expect(mocks.quote).toHaveBeenCalledTimes(1);
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("prices spending in the selected voucher and clears the amount when switching mode", async () => {
    renderPage();
    await screen.findByRole("table", { name: "Pay with" });
    fireEvent.click(paySelector("DDD"));
    fireEvent.change(screen.getByLabelText("You get"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Spend" }));
    expect((screen.getByLabelText("You spend") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("You spend"), { target: { value: "2.5" } });
    await waitFor(() =>
      expect(mocks.routes).toHaveBeenCalledWith(
        expect.objectContaining({ amount: "2500000", mode: "exactInput" }),
        expect.anything(),
      ),
    );
    expect(paySelector("DDD").getAttribute("aria-pressed")).toBe("true");
  });

  it("moves focus by row and keeps Max independent from route selection", async () => {
    renderPage();
    await screen.findByRole("table", { name: "Pay with" });
    const firstSelector = paySelector("AAA");
    const secondSelector = paySelector("DDD");
    const firstMax = within(payRow("AAA")).getByRole("button", { name: "Max 8.00 CCC" });
    act(() => firstSelector.focus());
    expect(firstSelector.getAttribute("aria-pressed")).toBe("true");

    // Keyboard navigation starts at the current row even when Max has focus.
    act(() => firstMax.focus());
    fireEvent.keyDown(firstMax, { key: "j" });
    expect(document.activeElement).toBe(secondSelector);
    expect(secondSelector.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(secondSelector, { key: "k" });
    expect(document.activeElement).toBe(firstSelector);
    expect(firstSelector.getAttribute("aria-pressed")).toBe("true");

    const secondMax = within(payRow("DDD")).getByRole("button", { name: "Max 8.00 CCC" });
    act(() => secondMax.focus());
    expect(firstSelector.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(secondMax);
    expect(secondSelector.getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("You get") as HTMLInputElement).value).toBe("8.00");
    expect(screen.getAllByRole("link", { name: "Malindi Pool" })[0]).toBeTruthy();
    await waitFor(() =>
      expect(mocks.routes).toHaveBeenCalledWith(
        expect.objectContaining({ amount: "8000000" }),
        expect.anything(),
      ),
    );
    expect(mocks.routes.mock.calls.filter(([params]) => params.amount === "8000000")).toHaveLength(
      1,
    );
    expect(mocks.quote).not.toHaveBeenCalled();
  });

  it("shows failed discovery as an error and retries without showing an empty result", async () => {
    mocks.routes.mockRejectedValueOnce(new Error("Exchange unavailable"));
    renderPage();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/No way to get/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table", { name: "Pay with" })).toBeTruthy();
  });

  it("shows fallback pools with links that preselect the target voucher", async () => {
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) => ({
      ...page(params, true),
      fallbackPools: [
        {
          address: FIXTURE.pool1,
          name: "Kilifi Pool",
          liquidity: "12000000",
          accepts: [FIXTURE.voucherA],
        },
      ],
    }));
    renderPage();
    const table = await screen.findByRole("table", { name: "Pools that hold CCC" });
    expect(within(table).getByText("12.00 CCC")).toBeTruthy();
    expect(within(table).getByRole("link", { name: "Kilifi Pool" }).getAttribute("href")).toBe(
      `/pools/${FIXTURE.pool1}`,
    );
    expect(within(table).getByRole("link", { name: "Swap" }).getAttribute("href")).toBe(
      `/pools/${FIXTURE.pool1}/swap?receive=${FIXTURE.voucherC}`,
    );
    expect(screen.getByRole("button", { name: "Review" }).hasAttribute("disabled")).toBe(true);
  });
  it("keeps discovery pending separate from an empty result", async () => {
    let resolveRoutes!: (value: ReturnType<typeof page>) => void;
    mocks.routes.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRoutes = resolve;
        }),
    );
    renderPage();
    expect(await screen.findByText("Finding options…")).toBeTruthy();
    expect(screen.queryByText(/No way to get/)).toBeNull();
    await act(async () => {
      resolveRoutes(page({ to: FIXTURE.voucherC }, true));
    });
    expect(await screen.findByText("No way to get CCC with what you hold")).toBeTruthy();
  });

  it("offers a refused route's maximum and reprices it before allowing review", async () => {
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) => {
      const result = page(params);
      result.inputs = result.inputs.slice(0, 1);
      if (params.amount && BigInt(params.amount) > 8000000n) {
        const current = result.inputs[0]!.routes[0]!;
        Object.assign(current, { carriesAmount: false, refusal: { reason: "liquidity", hop: 0 } });
      }
      return result;
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText("You get"), { target: { value: "10" } });
    const max = await screen.findByRole("button", { name: "Max 8.00 CCC" });
    expect(screen.getByRole("button", { name: "Review" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(max);
    expect((screen.getByLabelText("You get") as HTMLInputElement).value).toBe("8.00");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review" }).hasAttribute("disabled")).toBe(false),
    );
    expect(mocks.routes).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "8000000" }),
      expect.anything(),
    );
    expect(mocks.quote).not.toHaveBeenCalled();
  });

  it("shows alternate Pool links and applies an alternate route's maximum", async () => {
    mocks.routes.mockImplementation(async (params: CreditRoutesParams) => {
      const result = page(params);
      result.inputs[0]!.routes.push(ALTERNATE);
      return result;
    });
    renderPage();

    const alternatives = await screen.findByRole("table", { name: "Other ways" });
    expect(alternatives.querySelector("button button, button a")).toBeNull();
    const alternateSelector = within(alternatives).getByRole("button", { name: "Malindi Pool" });
    act(() => alternateSelector.focus());
    expect(document.activeElement).toBe(alternateSelector);
    const alternatePool = within(alternatives).getByRole("link", { name: "Malindi Pool" });
    expect(alternatePool.getAttribute("href")).toBe(`/pools/${FIXTURE.pool3}`);
    act(() => alternatePool.focus());
    expect(document.activeElement).toBe(alternatePool);

    const max = within(alternatives).getByRole("button", { name: "Max 7.00 CCC" });
    act(() => max.focus());
    expect(document.activeElement).toBe(max);
    expect(within(alternatives).getByRole("button", { name: "Malindi Pool" })).toBeTruthy();
    fireEvent.click(max);

    expect((screen.getByLabelText("You get") as HTMLInputElement).value).toBe("7.00");
    await waitFor(() =>
      expect(mocks.routes).toHaveBeenCalledWith(
        expect.objectContaining({ amount: "7000000" }),
        expect.anything(),
      ),
    );
    expect(mocks.routes.mock.calls.filter(([params]) => params.amount === "7000000")).toHaveLength(
      1,
    );
    const previousRoute = within(alternatives).getByRole("button", {
      name: "Kilifi Pool → Mombasa Pool",
    });
    fireEvent.click(previousRoute);
    expect(
      within(screen.getByRole("table", { name: "Route details" })).getByRole("link", {
        name: "Kilifi Pool",
      }),
    ).toBeTruthy();
  });
});
