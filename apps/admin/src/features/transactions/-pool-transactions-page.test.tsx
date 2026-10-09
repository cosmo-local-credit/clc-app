import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { PoolTransactionsPage } from "./pool-transactions-page";
import { parsePoolTransactionsSearch } from "./transactions-search";

const POOL = "0x33a573149db22e759fB9A38Bcc461C12855c2645";
const INITIATOR = "0x1111111111111111111111111111111111111111";
const TOKEN_IN = "0x2222222222222222222222222222222222222222";
const TOKEN_OUT = "0x3333333333333333333333333333333333333333";

const swap = {
  id: 20_000_003,
  txId: 20,
  logIndex: 3,
  txHash: "0xabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabca",
  t: "2026-08-13T11:00:00Z",
  success: true,
  type: "swap",
  pool: POOL,
  initiator: INITIATOR,
  tokenIn: TOKEN_IN,
  tokenInSymbol: "SRF",
  tokenInDecimals: 6,
  amountIn: "1000000",
  tokenOut: TOKEN_OUT,
  tokenOutSymbol: "CKS",
  tokenOutDecimals: 6,
  amountOut: "990000",
  fee: "1000",
  protocolFee: "2000",
};

const rows = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }));
const queryParams = vi.hoisted(() => vi.fn());

vi.mock("@clc/api/features/admin/queries", () => ({
  adminPoolTransactionsQueryOptions: (_client: unknown, params: unknown) => {
    queryParams(params);
    return {
      queryKey: ["pool-tx", params],
      queryFn: () => ({
        transactions: rows.current,
        first: 20_000_003,
        last: 20_000_003,
        receivedCount: rows.current.length,
      }),
    };
  },
}));

function renderPage(data: Array<Record<string, unknown>>, initialEntry = "/") {
  rows.current = data;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const route = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: parsePoolTransactionsSearch,
    component: () => <PoolTransactionsPage search={route.useSearch()} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

/** Scoped to the table: "swap" and "deposit" are also the filter chips. */
async function table() {
  return within(await screen.findByRole("table"));
}

describe("PoolTransactionsPage", () => {
  afterEach(() => queryParams.mockClear());

  it("uses the dashboard-sized type filter control", async () => {
    renderPage([swap]);

    const types = await screen.findByLabelText("Transaction types");
    expect(types.className).toContain("h-9");
    expect(types.className).toContain("p-0.5");
    expect(
      screen.getByRole("textbox", { name: "Hash, initiator, pool, or voucher" }).className,
    ).toContain("w-72");
    expect(screen.getByRole("button", { name: "swap" }).className).toContain(
      "data-[pressed]:bg-violet-50",
    );
  });

  it("shows both sides of a swap with the voucher each is denominated in", async () => {
    renderPage([swap]);

    expect(await screen.findByRole("heading", { name: "Pool transactions" })).toBeTruthy();
    const rendered = await table();
    expect(rendered.getByText("swap")).toBeTruthy();
    const amountIn = rendered.getByText("1");
    expect(amountIn).toBeTruthy();
    expect(amountIn.closest("td")?.className).not.toContain("text-right");
    expect(rendered.getByText("0.99")).toBeTruthy();
    expect(rendered.getByText("SRF")).toBeTruthy();
    expect(rendered.getAllByText("CKS").length).toBeGreaterThan(0);
  });

  it("renders the operation and receipt outcome as badges", async () => {
    renderPage([swap]);

    const rendered = await table();
    expect(rendered.getByLabelText("pool transaction type swap").className).toContain(
      "bg-violet-50",
    );
    expect(rendered.getByLabelText("pool transaction state success")).toBeTruthy();
  });

  it("keeps a fee smaller than two decimals from rounding to zero", async () => {
    // 1000 raw units of a six-decimal token is 0.001. Printing a real fee as "0"
    // is the one output worse than a long number.
    renderPage([swap]);

    expect((await table()).getByText("0.001")).toBeTruthy();
  });

  it("leaves a deposit's out side and fee empty rather than zero", async () => {
    renderPage([
      {
        ...swap,
        type: "deposit",
        tokenOut: null,
        tokenOutSymbol: "",
        tokenOutDecimals: null,
        amountOut: null,
        fee: null,
      },
    ]);

    const rendered = await table();
    expect(rendered.getByText("deposit")).toBeTruthy();
    expect(rendered.queryByText("0")).toBeNull();
    expect(rendered.getAllByText("—")).toHaveLength(3);
  });

  it("sends a pool-search term to the backend and keeps it in the URL", async () => {
    const router = renderPage([swap], "/?q=0xabc");
    await table();

    expect(router.state.location.search).toMatchObject({ q: "0xabc" });
    expect(queryParams).toHaveBeenCalledWith(expect.objectContaining({ q: "0xabc" }));
  });
});
