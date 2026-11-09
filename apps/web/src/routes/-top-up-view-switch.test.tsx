import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * Add / withdraw across a resize that crosses the desktop breakpoint. Both
 * views read the open form from `?sheet=`, so it survives the swap and one Back
 * closes it whichever view opened it. A ramp still running when the views swap
 * keeps the new view's submit disarmed until it settles.
 *
 * The real route, LayoutSwitch, Pretium hooks and mutation cache; the network
 * is a fetch stub and the voucher relay is stood in for.
 */
const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const PHONE = "+254712345678";

const mocks = vi.hoisted(() => ({
  relay: vi.fn(),
  onramp: vi.fn(),
}));

vi.mock("#/components/auth/authenticated-route", () => ({
  AuthenticatedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ address: ADDRESS }),
  useBytecode: () => ({ data: undefined, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("#/features/wallet/api/send-voucher-relay", () => ({ relayVoucherTransfer: mocks.relay }));
// Pretium's MPESA ramps exist on Celo only; see -top-up-page.test.tsx.
vi.mock("#/lib/chain", () => ({
  CHAIN_ID: 42220,
  CHAIN_INFO: {
    name: "Celo",
    nativeSymbol: "CELO",
    blockTimeMs: 1_000,
    explorerUrl: "https://celoscan.io",
    explorerName: "Celoscan",
    caliburAddress: "0x1289fE793392fb1a905f78Ea23f632EDD3d15b85",
  },
}));

import { DESKTOP_MEDIA } from "#/desktop/layout";
import { Route } from "./_nav/wallet/top-up";

function jsonResponse(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

function stubBackend() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/auth/profile")) {
        return Promise.resolve(
          jsonResponse({ address: ADDRESS, name: "Alice", phone: PHONE, country: "KE" }),
        );
      }
      if (url.includes("/api/v2/accounts/") && url.includes("/tokens")) {
        return Promise.resolve(
          jsonResponse({
            tokens: [
              {
                id: 1,
                tokenAddress: USDT,
                tokenSymbol: "USD₮",
                tokenName: "Tether USD",
                tokenDecimals: 6,
                balance: "10000000",
                iconUrl: null,
                lastDateBlock: "",
              },
            ],
            first: 0,
            last: 0,
          }),
        );
      }
      if (url.includes("/api/v2/pretium/link-by-address/")) {
        return Promise.resolve(jsonResponse({ linked: true, phoneNumber: PHONE }));
      }
      if (url.includes("/api/v2/pretium/rates")) {
        return Promise.resolve(jsonResponse({ buy: 128.5, sell: 127.75 }));
      }
      if (url.includes("/api/v2/pretium/transactions-by-address/")) {
        return Promise.resolve(
          jsonResponse({ address: ADDRESS, onramps: [], offramps: [], totalCount: 0 }),
        );
      }
      if (url.includes("/api/v2/pretium/trigger-onramp")) {
        return mocks.onramp();
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }),
  );
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const originalMatchMedia = window.matchMedia;
const originalFetch = globalThis.fetch;
const media = { matches: false, listeners: new Set<() => void>() };

function setViewport(desktop: boolean) {
  act(() => {
    media.matches = desktop;
    for (const listener of media.listeners) listener();
  });
}

function mountAt(desktop: boolean, entry = "/wallet/top-up") {
  media.matches = desktop;
  document.documentElement.dataset.layout = desktop ? "desktop" : "mobile";
  const root = createRootRoute({ component: Outlet });
  const nav = createRoute({ getParentRoute: () => root, id: "_nav", component: Outlet });
  const topUp = Route.update({ getParentRoute: () => nav, path: "wallet/top-up" } as never);
  const router = createRouter({
    routeTree: root.addChildren([nav.addChildren([topUp])]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const index = (router: ReturnType<typeof mountAt>) => router.history.location.state.__TSR_index;
const sheetParam = (router: ReturnType<typeof mountAt>) =>
  (router.state.location.search as { sheet?: string }).sheet;

async function openRamp(which: 0 | 1) {
  fireEvent.click((await screen.findAllByRole("button", { name: /MPESA via Pretium/ }))[which]);
}

const inspector = () => screen.findByRole("complementary");

function expectDisarmed(button: HTMLElement) {
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
}

beforeEach(() => {
  vi.clearAllMocks();
  media.listeners.clear();
  stubBackend();
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 1400,
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return query === DESKTOP_MEDIA && media.matches;
    },
    addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
  }));
});

afterEach(() => {
  // Put back only what this file stubs: the setup file's ResizeObserver must stay.
  vi.stubGlobal("matchMedia", originalMatchMedia);
  vi.stubGlobal("fetch", originalFetch);
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  delete document.documentElement.dataset.layout;
});

describe("Add / withdraw across a phone/desktop switch", () => {
  it("keeps the desktop's open form on the phone, where one Back closes it", async () => {
    const router = mountAt(true);
    await openRamp(0);
    await inspector();
    expect(sheetParam(router)).toBe("add");
    expect(index(router)).toBe(1);

    setViewport(false);

    expect(await screen.findByRole("textbox", { name: /amount/i })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(sheetParam(router)).toBeUndefined());
    expect(index(router)).toBe(0);
    await waitFor(() => expect(screen.queryByRole("textbox", { name: /amount/i })).toBeNull());
  });

  it("opens the phone's form as a history entry the desktop then closes with Back", async () => {
    const router = mountAt(false);
    await openRamp(1);
    await screen.findByRole("button", { name: /^withdraw$/i });
    expect(sheetParam(router)).toBe("withdraw");
    expect(index(router)).toBe(1);

    setViewport(true);

    const panel = await inspector();
    expect(within(panel).getByRole("heading", { name: "Withdraw" })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(sheetParam(router)).toBeUndefined());
    expect(index(router)).toBe(0);
  });

  it("closes a phone form opened by a direct link in place", async () => {
    const router = mountAt(false, "/wallet/top-up?sheet=add");
    expect(await screen.findByRole("textbox", { name: /amount/i })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(sheetParam(router)).toBeUndefined());
    expect(router.state.location.pathname).toBe("/wallet/top-up");
    expect(router.history.length).toBe(1);
  });

  it("keeps the desktop's Continue disarmed while the phone's MPESA prompt is still being sent", async () => {
    const onramp = deferred<ReturnType<typeof jsonResponse>>();
    mocks.onramp.mockReturnValue(onramp.promise);
    const router = mountAt(false);
    await openRamp(0);
    fireEvent.change(await screen.findByRole("textbox", { name: /amount/i }), {
      target: { value: "100" },
    });
    const start = await screen.findByRole("button", { name: /continue/i });
    await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(start);
    await waitFor(() => expect(mocks.onramp).toHaveBeenCalledTimes(1));

    setViewport(true);

    const panel = await inspector();
    fireEvent.change(within(panel).getByRole("textbox", { name: /amount/i }), {
      target: { value: "200" },
    });
    expectDisarmed(within(panel).getByRole("button", { name: "Starting…" }));

    await act(async () => {
      onramp.resolve(jsonResponse({ transactionCode: "PTM-2", status: "PENDING", message: "" }));
      await onramp.promise;
    });

    // The phone that sent it is gone: its success does not close the desktop's form.
    await waitFor(() =>
      expect(
        (within(panel).getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(sheetParam(router)).toBe("add");
    expect(mocks.onramp).toHaveBeenCalledTimes(1);
  });

  it("keeps the phone's Withdraw disarmed while the desktop's withdrawal is still relaying", async () => {
    const relay = deferred<{ trackingId: string }>();
    mocks.relay.mockReturnValue(relay.promise);
    mountAt(true);
    await openRamp(1);
    const panel = await inspector();
    fireEvent.change(await within(panel).findByRole("textbox", { name: /amount/i }), {
      target: { value: "100" },
    });
    const submit = within(panel).getByRole("button", { name: "Withdraw" });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));

    setViewport(false);

    fireEvent.change(await screen.findByRole("textbox", { name: /amount/i }), {
      target: { value: "100" },
    });
    expectDisarmed(screen.getByRole("button", { name: "Submitting…" }));

    await act(async () => {
      relay.resolve({ trackingId: "track-1" });
      await relay.promise;
    });

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /^withdraw$/i }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(mocks.relay).toHaveBeenCalledTimes(1);
  });
});
