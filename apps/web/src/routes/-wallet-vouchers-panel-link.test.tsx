import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * `/wallet/vouchers?voucher=…&panel=open` is the desktop list with a voucher
 * open in its inspector. The phone has no such panel, so a link shared from
 * the desktop lands on that voucher's page instead of dropping it.
 */
const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const VOUCHER = "0x00000000000000000000000000000000000000a1";

vi.mock("#/components/auth/authenticated-route", () => ({
  AuthenticatedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ address: ADDRESS }) }));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({ data: undefined, isPending: true, isError: false }),
}));
vi.mock("#/desktop/wallet/all-vouchers-desk", () => ({
  AllVouchersDesk: () => <p>Desktop voucher list</p>,
}));

import { DESKTOP_MEDIA } from "#/desktop/layout";
import { Route } from "./_nav/wallet/vouchers";

const originalMatchMedia = window.matchMedia;
const originalFetch = globalThis.fetch;

function mountAt(desktop: boolean, entry: string) {
  document.documentElement.dataset.layout = desktop ? "desktop" : "mobile";
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: query === DESKTOP_MEDIA && desktop,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const root = createRootRoute({ component: Outlet });
  const nav = createRoute({ getParentRoute: () => root, id: "_nav", component: Outlet });
  const vouchers = Route.update({ getParentRoute: () => nav, path: "wallet/vouchers" } as never);
  const voucherPage = createRoute({
    getParentRoute: () => nav,
    path: "vouchers/$voucherAddress",
    validateSearch: (search: Record<string, unknown>) => ({
      from: typeof search.from === "string" ? search.from : undefined,
    }),
    component: () => <p>Voucher page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([nav.addChildren([vouchers, voucherPage])]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "",
        text: () => Promise.resolve(JSON.stringify({ ok: true, result: { tokens: [] } })),
      }),
    ),
  );
});

afterEach(() => {
  vi.stubGlobal("matchMedia", originalMatchMedia);
  vi.stubGlobal("fetch", originalFetch);
  delete document.documentElement.dataset.layout;
});

describe("a desktop voucher-panel link", () => {
  it("lands the phone on that voucher's page, replacing the link", async () => {
    const router = mountAt(false, `/wallet/vouchers?voucher=${VOUCHER}&panel=open`);

    expect(await screen.findByText("Voucher page")).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/vouchers/${VOUCHER}`);
    expect(router.state.location.search).toEqual({ from: "vouchers" });
    expect(router.history.length).toBe(1);
  });

  it("keeps the desktop on its list with the panel", async () => {
    const router = mountAt(true, `/wallet/vouchers?voucher=${VOUCHER}&panel=open`);

    expect(await screen.findByText("Desktop voucher list")).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe("/wallet/vouchers"));
    expect(router.state.location.search).toEqual({ voucher: VOUCHER, panel: "open" });
  });

  it("leaves the phone's plain list where it is", async () => {
    const router = mountAt(false, "/wallet/vouchers");

    expect(await screen.findByRole("heading", { name: "All Vouchers" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/wallet/vouchers");
  });
});
