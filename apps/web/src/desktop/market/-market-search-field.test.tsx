import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { readRecentSearches, rememberSearch } from "#/features/home/api/recent-search-storage";

const VOUCHER = "0xd524d0ed7bc970185ed9c6c9a65a8a02e8897363";
const POOL = "0x00000000000000000000000000000000000000a1";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  applyFacetFilters: vi.fn(),
  clearTerm: vi.fn(),
}));

vi.mock("#/lib/api/marketplace", () => ({ marketplaceClient: { list: mocks.list } }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ state: "guest", isAuthenticated: false, isLoading: false }),
}));

import type { MarketFilterControls } from "#/features/home/hooks/use-market-filter";
import { MarketSearchField } from "./market-search-field";

function result(kind: "voucher" | "pool", address: string, name: string): MarketplaceResult {
  return {
    kind,
    id: address,
    name,
    chainId: 100,
    address,
    symbol: null,
    locationName: "Mombasa",
    voucherKind: kind === "voucher" ? "goods" : null,
    tags: [],
  } as unknown as MarketplaceResult;
}

/** The vocabulary request asks for facets; a search asks for vouchers and pools. */
function answer(params: { q?: string; facets?: boolean; kinds?: string[] }) {
  if (params.facets) {
    return {
      results: [],
      nextCursor: null,
      tagFacets: [
        { tag: "agriculture", count: 4 },
        { tag: "care", count: 2 },
      ],
    };
  }
  return {
    results: [result("voucher", VOUCHER, "Bakery voucher"), result("pool", POOL, "Bakers pool")],
    nextCursor: null,
  };
}

function Field({ initialTerm = "", tags = [] as string[] }) {
  const [term, setTerm] = useState(initialTerm);
  const filter = {
    term,
    setTerm,
    clearTerm: () => {
      mocks.clearTerm();
      setTerm("");
    },
    tags,
    tagMatch: "any",
    vouchers: [],
    voucherMatch: "any",
    isAtTagLimit: false,
    applyFacetFilters: mocks.applyFacetFilters,
  } as unknown as MarketFilterControls;
  return <MarketSearchField filter={filter} label="Search the marketplace" column={false} />;
}

function renderField(props: Parameters<typeof Field>[0] = {}) {
  const rootRoute = createRootRoute({ component: Outlet });
  const index = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <Field {...props} />,
  });
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      index,
      stub("/vouchers/$voucherAddress"),
      stub("/pools/$poolAddress"),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const field = () => screen.findByRole("combobox", { name: "Search the marketplace" });

beforeEach(() => {
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  mocks.list.mockReset();
  mocks.list.mockImplementation(async (params) => answer(params));
  mocks.applyFacetFilters.mockReset();
  mocks.clearTerm.mockReset();
});

describe("MarketSearchField suggestions", () => {
  it("opens with recent terms and categories at rest, and a recent term searches", async () => {
    rememberSearch("guest", "bread");
    rememberSearch("guest", "honey");
    renderField();
    const input = await field();
    expect(input.getAttribute("aria-expanded")).toBe("false");

    fireEvent.focus(input);
    const listbox = await screen.findByRole("listbox", { name: "Search suggestions" });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    // Newest first, then the categories the marketplace offers.
    const labels = (await screen.findAllByRole("option")).map((option) => option.textContent);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
    expect(labels.slice(0, 2)).toEqual(["honey", "bread"]);
    expect(listbox.textContent).toContain("Agriculture");

    fireEvent.click(screen.getByRole("option", { name: "bread" }));
    expect((input as HTMLInputElement).value).toBe("bread");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("offers matching vouchers, pools and categories as you type, and Enter opens the active voucher", async () => {
    const router = renderField();
    const input = await field();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "bake" } });

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
    const [search, voucherOption, poolOption] = screen.getAllByRole("option");
    expect(search?.textContent).toBe("Search “bake”");
    expect(voucherOption?.textContent).toContain("Bakery voucher");
    expect(poolOption?.textContent).toContain("Pool · Mombasa");

    // Down once reaches the voucher after the search row.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const voucher = screen.getByRole("option", { name: /Bakery voucher/ });
    expect(voucher.getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(voucher.id);

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/vouchers/${VOUCHER}`));
    expect(router.state.location.search).toMatchObject({ from: "market" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens a suggested pool by pointer", async () => {
    const router = renderField();
    const input = await field();
    fireEvent.change(input, { target: { value: "bake" } });
    fireEvent.click(await screen.findByRole("option", { name: /Bakers pool/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/pools/${POOL}`));
  });

  it("keeps the typed search on Enter with nothing active, and remembers it", async () => {
    renderField();
    const input = await field();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "bread" } });
    await screen.findAllByRole("option");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("bread");
    expect(readRecentSearches("guest")).toEqual(["bread"]);
  });

  it("applies a category to the current search without losing the ones already chosen", async () => {
    renderField({ tags: ["care"] });
    const input = await field();
    fireEvent.focus(input);
    fireEvent.click(await screen.findByRole("option", { name: "Agriculture" }));
    expect(mocks.applyFacetFilters).toHaveBeenCalledWith(["care", "agriculture"], "any", [], "any");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on Escape without clearing the search, and Escape does not reach the shell", async () => {
    renderField({ initialTerm: "bread" });
    const input = await field();
    fireEvent.focus(input);
    await screen.findByRole("listbox");

    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    fireEvent.keyDown(input, { key: "Escape" });
    document.removeEventListener("keydown", outer);

    expect(screen.queryByRole("listbox")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("bread");
    expect(outer).not.toHaveBeenCalled();
  });

  it("closes when focus leaves the field", async () => {
    renderField();
    const input = await field();
    fireEvent.focus(input);
    await screen.findByRole("listbox");
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("offers Try again when the suggestions fail, and asks again", async () => {
    mocks.list.mockImplementation(async (params) => {
      if (params.facets) return answer(params);
      throw new Error("down");
    });
    renderField();
    const input = await field();
    fireEvent.change(input, { target: { value: "bake" } });

    const retry = await screen.findByRole("option", { name: "Try again" });
    const before = mocks.list.mock.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.list.mock.calls.length).toBeGreaterThan(before));
  });

  it("offers Load more for further results once the automatic pages are spent", async () => {
    mocks.list.mockImplementation(async (params) =>
      params.facets
        ? answer(params)
        : { results: [], nextCursor: `cursor-${mocks.list.mock.calls.length}` },
    );
    renderField();
    const input = await field();
    fireEvent.change(input, { target: { value: "bake" } });

    const more = await screen.findByRole("option", { name: "Load more" }, { timeout: 5000 });
    const before = mocks.list.mock.calls.length;
    fireEvent.click(more);
    await waitFor(() => expect(mocks.list.mock.calls.length).toBeGreaterThan(before));
  });

  it("clears the search from its button", async () => {
    renderField({ initialTerm: "bread" });
    await field();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(mocks.clearTerm).toHaveBeenCalled();
  });
});
