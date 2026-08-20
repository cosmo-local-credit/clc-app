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
import { VoucherTransactionsPage } from "./voucher-transactions-page";
import { parseVoucherTransactionsSearch } from "./transactions-search";

const VOUCHER = "0x33a573149db22e759fB9A38Bcc461C12855c2645";
const SENDER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const TX_HASH = "0xabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabca";

const transfer = {
  id: 10_000_000,
  txId: 10,
  logIndex: 0,
  txHash: TX_HASH,
  t: "2026-08-13T11:00:00Z",
  success: true,
  type: "transfer",
  voucher: VOUCHER,
  voucherName: "Sarafu",
  voucherSymbol: "SRF",
  voucherDecimals: 6,
  from: SENDER,
  to: RECIPIENT,
  amount: "1500000",
};

const rows = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }));
const queryParams = vi.hoisted(() => vi.fn());

vi.mock("@clc/api/features/admin/queries", () => ({
  adminVoucherTransactionsQueryOptions: (_client: unknown, params: unknown) => {
    queryParams(params);
    return {
      queryKey: ["voucher-tx", params],
      queryFn: () => ({
        transactions: rows.current,
        first: 10_000_000,
        last: 10_000_000,
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
    validateSearch: parseVoucherTransactionsSearch,
    component: () => <VoucherTransactionsPage search={route.useSearch()} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

/**
 * Assertions are scoped to the table: "transfer", "mint" and "burn" are also the
 * filter chips, so an unscoped query would pass on the toolbar alone and prove
 * nothing about the row.
 */
async function table() {
  return within(await screen.findByRole("table"));
}

describe("VoucherTransactionsPage", () => {
  afterEach(() => queryParams.mockClear());

  it("uses the dashboard-sized type filter control", async () => {
    renderPage([transfer]);

    const types = await screen.findByLabelText("Transaction types");
    expect(types.className).toContain("h-9");
    expect(types.className).toContain("p-0.5");
    expect(screen.getByRole("textbox", { name: "From, to, hash, or voucher" }).className).toContain(
      "w-72",
    );
    expect(screen.getByRole("button", { name: "transfer" }).className).toContain(
      "data-[pressed]:bg-sky-50",
    );
  });

  it("scales the amount by the voucher's decimals", async () => {
    renderPage([transfer]);

    expect(await screen.findByRole("heading", { name: "Voucher transactions" })).toBeTruthy();
    const rendered = await table();
    expect(rendered.getByText("transfer")).toBeTruthy();
    const amount = rendered.getByText("1.5");
    expect(amount).toBeTruthy();
    expect(amount.closest("td")?.className).not.toContain("text-right");
  });

  it("renders the transaction type as a badge", async () => {
    renderPage([transfer]);

    const badge = (await table()).getByLabelText("voucher transaction type transfer");
    expect(badge.className).toContain("bg-sky-50");
  });

  it("shows the raw integer, marked, when the catalog does not know the voucher", async () => {
    // Scaling by an assumed zero would be right only by accident. The raw value
    // with a marker is the honest answer.
    renderPage([{ ...transfer, voucherDecimals: null }]);

    const rendered = await table();
    expect(rendered.getByText("1500000")).toBeTruthy();
    expect(rendered.getByText("raw")).toBeTruthy();
  });

  it("renders a reverted receipt outcome as a status badge", async () => {
    renderPage([{ ...transfer, success: false }]);

    expect((await table()).getByLabelText("voucher transaction state reverted")).toBeTruthy();
  });

  it("renders a successful receipt outcome as a status badge", async () => {
    renderPage([transfer]);

    const rendered = await table();
    expect(rendered.getByLabelText("voucher transaction state success")).toBeTruthy();
    expect(rendered.queryByLabelText("voucher transaction state reverted")).toBeNull();
  });

  it("leaves a burn's recipient blank, since nothing received the supply", async () => {
    renderPage([{ ...transfer, type: "burn", to: null }]);

    const rendered = await table();
    expect(rendered.getByText("burn")).toBeTruthy();
    expect(rendered.getByText("—")).toBeTruthy();
  });

  it("links the transaction hash out to the block explorer", async () => {
    renderPage([transfer]);

    const link = (await table()).getByRole("link", { name: /on the block explorer/ });
    expect(link.getAttribute("href")).toBe(`https://celoscan.io/tx/${TX_HASH}`);
  });

  it("sends a free-text term to the backend and keeps it in the URL", async () => {
    const router = renderPage([transfer], "/?q=0xabc");
    await table();

    expect(router.state.location.search).toMatchObject({ q: "0xabc" });
    expect(queryParams).toHaveBeenCalledWith(expect.objectContaining({ q: "0xabc" }));
  });

  it("does not send a one-character term that clc-core rejects", async () => {
    const router = renderPage([transfer], "/?q=x");
    await table();

    expect(router.state.location.search).toMatchObject({ q: "x" });
    expect(queryParams).not.toHaveBeenCalledWith(expect.objectContaining({ q: "x" }));
  });
});
