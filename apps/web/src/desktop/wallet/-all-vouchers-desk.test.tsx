import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const TOKEN = "0x1111111111111111111111111111111111111111";

const mocks = vi.hoisted(() => ({ hasNextPage: false }));

vi.mock("wagmi", () => ({ useConnection: () => ({ address: ADDRESS }) }));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({
    data: { vouchers: { used: 0, limit: 3, unlimited: false, canCreate: true } },
    isError: false,
  }),
}));
vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAccountTokensInfinite: () => ({
    data: { pages: [{ tokens: [] }] },
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: mocks.hasNextPage,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock("#/features/wallet/hooks/use-partitioned-vouchers", () => ({
  usePartitionedVouchers: () => ({
    holdings: [
      {
        id: TOKEN,
        contractAddress: TOKEN,
        symbol: "RIV",
        name: "Riverside Voucher",
        amount: "12.5",
        balance: "1250",
        fiat: "",
        color: "",
        kind: "voucher",
      },
    ],
    issued: [],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

import { AllVouchersDesk } from "./all-vouchers-desk";

async function mount(url: string) {
  const root = createRootRoute({ component: Outlet });
  // The desktop reads its search by this route id, as the real route tree names it.
  const nav = createRoute({ getParentRoute: () => root, id: "_nav", component: Outlet });
  const vouchers = createRoute({
    getParentRoute: () => nav,
    path: "/wallet/vouchers",
    validateSearch: (search: Record<string, unknown>) => ({
      voucher: typeof search.voucher === "string" ? search.voucher : undefined,
      panel: search.panel === "open" ? ("open" as const) : undefined,
    }),
    component: AllVouchersDesk,
  });
  const router = createRouter({
    routeTree: root.addChildren([nav.addChildren([vouchers])]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "All Vouchers" });
  return router;
}

beforeEach(() => {
  mocks.hasNextPage = false;
  // jsdom lays nothing out; give the split room so the inspector docks.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 1400,
  });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});

describe("All Vouchers inspector", () => {
  it("closes a direct link to the list itself instead of going back", async () => {
    const router = await mount(`/wallet/vouchers?voucher=${TOKEN}&panel=open`);
    // A deep link: nothing of this page's own precedes it.
    expect(router.history.canGoBack()).toBe(false);

    const inspector = await screen.findByRole("complementary");
    fireEvent.click(within(inspector).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(router.state.location.search.voucher).toBeUndefined());
    expect(router.state.location.pathname).toBe("/wallet/vouchers");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("closes a voucher opened from the list by going back to the list", async () => {
    const router = await mount("/wallet/vouchers");

    fireEvent.click(screen.getByRole("row", { name: /Riverside Voucher/ }));
    const inspector = await screen.findByRole("complementary");
    expect(router.state.location.search.voucher?.toLowerCase()).toBe(TOKEN);
    expect(router.history.canGoBack()).toBe(true);

    fireEvent.click(within(inspector).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.search.voucher).toBeUndefined());
    // It popped the entry the list pushed rather than stacking another one.
    expect(router.history.canGoBack()).toBe(false);
  });

  it("closes with Escape from inside the inspector", async () => {
    const router = await mount(`/wallet/vouchers?voucher=${TOKEN}&panel=open`);

    const inspector = await screen.findByRole("complementary");
    fireEvent.keyDown(inspector, { key: "Escape" });

    await waitFor(() => expect(router.state.location.search.voucher).toBeUndefined());
  });

  it("says a sort covers only the loaded rows while more pages may load", async () => {
    mocks.hasNextPage = true;
    await mount("/wallet/vouchers");

    const holdings = screen.getByRole("table", { name: "Holdings" });
    fireEvent.click(within(holdings).getByRole("button", { name: /Balance/ }));
    expect(screen.getByRole("status").textContent).toContain("rows loaded so far");
  });
});
