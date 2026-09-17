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

import { explorerTxUrl } from "@clc/core/lib/constants/chains";

import { CHAIN_INFO } from "#/lib/chain";
import { OTXPage } from "./otx-page";
import { parseOTXSearch } from "./transactions-search";

const SIGNER = "0x1111111111111111111111111111111111111111";
const TX_HASH = "0xabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabca";

const dispatch = {
  id: 12,
  trackingId: "2c1f1f0e-0000-4000-8000-000000000000",
  otxType: "RELAY_EXEC",
  signer: SIGNER,
  txHash: TX_HASH,
  nonce: 41,
  replaced: false,
  status: "SUCCESS",
  createdAt: "2026-08-13T11:00:00Z",
  updatedAt: "2026-08-13T11:00:05Z",
};

const rows = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }));
const queryParams = vi.hoisted(() => vi.fn());

vi.mock("@clc/api/features/admin/queries", () => ({
  adminOTXQueryOptions: (_client: unknown, params: unknown) => {
    queryParams(params);
    return {
      queryKey: ["otx", params],
      queryFn: () => ({
        otx: rows.current,
        first: 12,
        last: 12,
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
    validateSearch: parseOTXSearch,
    component: () => <OTXPage search={route.useSearch()} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

async function table() {
  return within(await screen.findByRole("table"));
}

describe("OTXPage", () => {
  afterEach(() => queryParams.mockClear());

  it("links a mined dispatch to the block explorer", async () => {
    renderPage([dispatch]);

    expect(await screen.findByRole("heading", { name: "Origin transactions" })).toBeTruthy();
    const link = (await table()).getByRole("link", { name: /on the block explorer/ });
    expect(link.getAttribute("href")).toBe(explorerTxUrl(CHAIN_INFO, TX_HASH));
  });

  it("does not link a dispatch the network never took", async () => {
    // The hash exists from the moment the transaction is signed, so the
    // explorer would answer "no such transaction" — which reads as data loss.
    renderPage([{ ...dispatch, status: "NO_GAS" }]);

    const rendered = await table();
    expect(rendered.queryByRole("link", { name: /on the block explorer/ })).toBeNull();
    expect(rendered.getByText("no gas")).toBeTruthy();
  });

  it("names the dispatch state, which a tick could not carry", async () => {
    renderPage([{ ...dispatch, status: "IN_NETWORK" }]);

    expect((await table()).getByText("in network")).toBeTruthy();
  });

  it("renders the origin transaction type as a badge", async () => {
    renderPage([dispatch]);

    expect(
      (await table()).getByLabelText("origin transaction type relay exec").className,
    ).toContain("bg-yellow-50");
  });

  it("marks a replaced nonce, since two rows may share one", async () => {
    renderPage([{ ...dispatch, replaced: true }]);

    const rendered = await table();
    expect(rendered.getByText("41")).toBeTruthy();
    expect(rendered.getByText("replaced")).toBeTruthy();
    expect(rendered.getByText("41").closest("td")?.className).not.toContain("text-right");
  });

  it("labels its filters, which Base UI would otherwise show as the raw value", async () => {
    renderPage([dispatch]);

    // textContent also carries the trigger's chevron, so this is a containment
    // check rather than an equality one.
    const typeFilter = await screen.findByLabelText("Type");
    expect(typeFilter.textContent).toContain("All types");
    expect(typeFilter.className).toContain("w-40");
    expect(screen.getByLabelText("Status").textContent).toContain("All statuses");
    expect(
      screen.getByRole("textbox", { name: "Tracking ID or transaction hash" }).className,
    ).toContain("w-72");
  });

  it("colours a selected type filter to match its table badge", async () => {
    renderPage([dispatch], "/?type=RELAY_EXEC");

    expect((await screen.findByLabelText("Type")).className).toContain("bg-yellow-50");
  });

  it("offers the whole tracking ID to the clipboard, not just the shown prefix", async () => {
    renderPage([dispatch]);

    expect((await table()).getByRole("button", { name: "Copy tracking ID" })).toBeTruthy();
    expect(screen.getByText("2c1f1f0e-0000-4000-8000-000000000000")).toBeTruthy();
  });

  it("sends tracking and hash terms to the backend query", async () => {
    const router = renderPage([dispatch], "/?q=2c1f");
    await table();

    expect(router.state.location.search).toMatchObject({ q: "2c1f" });
    expect(queryParams).toHaveBeenCalledWith(expect.objectContaining({ q: "2c1f" }));
  });
});
