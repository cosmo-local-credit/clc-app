import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: false, isLoading: false },
  search: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    ...props
  }: {
    children: ReactNode;
    to: string;
    search?: Record<string, unknown> | ((previous: Record<string, unknown>) => unknown);
  }) => {
    const resolved = (typeof search === "function" ? search(mocks.search) : search) ?? {};
    const query = new URLSearchParams(
      Object.entries(resolved as Record<string, string | undefined>).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, value]],
      ),
    ).toString();
    return (
      <a href={query ? `${to}?${query}` : to} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("#/components/app-menu", () => ({
  AppMenu: () => <button type="button">Open menu</button>,
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mocks.auth,
}));

import { MarketBar, type MarketSurface } from "./market-bar";

const filter = {
  term: "",
  setTerm: vi.fn(),
  clearTerm: vi.fn(),
} as unknown as CatalogFilterControls;

function renderBar(current: MarketSurface) {
  return render(
    <MarketBar
      current={current}
      filter={filter}
      searchLabel="Search the marketplace"
      filters={<button type="button">Filters</button>}
      credit={<button type="button">Credit</button>}
    />,
  );
}

beforeEach(() => {
  mocks.auth = { isAuthenticated: false, isLoading: false };
  mocks.search = {};
});

describe("MarketBar", () => {
  it("opens each list from its badge, carrying the search, tags and Credit", () => {
    mocks.search = { q: "bike", tags: "Repair", creditable: "true", voucher: "0xabc" };
    renderBar("map");

    const sections = screen.getByRole("navigation", { name: "Marketplace sections" });
    const links = within(sections).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "All",
      "Pools",
      "Vouchers",
      "Offers",
      "Catalogs",
      "Activity",
      "Posts",
    ]);
    expect(links[0]?.getAttribute("href")).toBe(
      "/market?q=bike&tags=Repair&creditable=true&scope=all",
    );
    expect(links[1]?.getAttribute("href")).toBe(
      "/market?q=bike&tags=Repair&creditable=true&scope=pools",
    );
    expect(links[5]?.getAttribute("href")).toBe("/?tab=activity");
    expect(links[6]?.getAttribute("href")).toBe("/?tab=posts");
    for (const link of links) expect(link.getAttribute("aria-current")).toBeNull();
    expect(screen.queryByRole("link", { name: "Map" })).toBeNull();
  });

  it("returns to the map from the open list's badge and from the Map button", () => {
    mocks.search = { scope: "pools", q: "bike", out_voucher: `0x${"a".repeat(40)}` };
    renderBar("pools");

    const pools = screen.getByRole("link", { name: "Pools" });
    expect(pools.getAttribute("aria-current")).toBe("page");
    expect(pools.getAttribute("href")).toBe("/?q=bike");
    expect(screen.getByRole("link", { name: "Map" }).getAttribute("href")).toBe("/?q=bike");
  });

  it("marks All open and returns to the map from it", () => {
    mocks.search = { scope: "all", q: "bike", tags: "Repair" };
    renderBar("all");

    const all = screen.getByRole("link", { name: "All" });
    expect(all.getAttribute("aria-current")).toBe("page");
    expect(all.getAttribute("href")).toBe("/?q=bike&tags=Repair");
    expect(screen.getByRole("link", { name: "Pools" }).getAttribute("href")).toBe(
      "/market?q=bike&tags=Repair&scope=pools",
    );
    expect(screen.getByRole("link", { name: "Map" }).getAttribute("href")).toBe(
      "/?q=bike&tags=Repair",
    );
  });

  it.each(["posts", "activity"] as const)("returns from %s to an unfiltered map", (current) => {
    mocks.search = { tab: current, q: "private search", tags: "Repair" };
    renderBar(current);
    const label = current === "posts" ? "Posts" : "Activity";
    expect(screen.getByRole("link", { name: label }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe("/");
  });

  it("puts Credit at the end of the search row for a member, and offers no Sign in", () => {
    mocks.auth = { isAuthenticated: true, isLoading: false };
    renderBar("vouchers");

    const field = screen.getByRole("button", { name: "Filters" }).parentElement;
    expect(field?.nextElementSibling).toBe(screen.getByRole("button", { name: "Credit" }));
    const sections = screen.getByRole("navigation", { name: "Marketplace sections" });
    expect(sections.firstElementChild?.textContent).toBe("All");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("gives a guest Sign in at the end of the row and no Credit", () => {
    renderBar("map");

    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      "/onboarding?step=welcome",
    );
    expect(screen.queryByRole("button", { name: "Credit" })).toBeNull();
  });

  it("keeps Sign in away while the session is still being checked", () => {
    mocks.auth = { isAuthenticated: false, isLoading: true };
    renderBar("map");

    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});
