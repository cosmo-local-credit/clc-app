import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search: _search,
    ...props
  }: {
    children: ReactNode;
    to: string;
    search?: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("#/components/app-menu", () => ({
  AppMenu: () => <button type="button">Open menu</button>,
}));

import { useMarketplaceSearchShell } from "#/features/home/stores/marketplace-search-shell";
import { MarketplaceSearchShell } from "./marketplace-search-shell";

describe("MarketplaceSearchShell", () => {
  beforeEach(() => useMarketplaceSearchShell.setState({ collapsed: false }));

  it("orders menu, search, Filters, and Collapse before scopes and Credit", () => {
    const view = render(
      <MarketplaceSearchShell
        current="all"
        search={<input aria-label="Search marketplace" />}
        filters={<button type="button">Filters</button>}
        credit={<button type="button">Credit</button>}
      />,
    );

    const menu = screen.getByRole("button", { name: "Open menu" });
    const search = screen.getByRole("textbox", { name: "Search marketplace" });
    const filters = screen.getByRole("button", { name: "Filters" });
    const collapse = screen.getByRole("button", { name: "Collapse marketplace search" });
    const all = screen.getByRole("button", { name: "All" });
    const credit = screen.getByRole("button", { name: "Credit" });

    expect(menu.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(search.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      filters.compareDocumentPosition(collapse) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(collapse.compareDocumentPosition(all) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(all.compareDocumentPosition(credit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(view.container.firstElementChild?.className).toContain("bg-background");
  });

  it("keeps the menu beside the search FAB while collapsed", () => {
    render(
      <MarketplaceSearchShell
        current="map"
        surface="map"
        search={<input aria-label="Search marketplace" />}
        filters={<button type="button">Filters</button>}
        credit={<button type="button">Credit</button>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse marketplace search" }));

    expect(screen.getByRole("button", { name: "Open menu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open marketplace search" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Search marketplace" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Credit" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Marketplace sections" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open marketplace search" }));
    expect(screen.getByRole("textbox", { name: "Search marketplace" })).toBeTruthy();
  });

  it("uses a transparent surface over the map", () => {
    const view = render(
      <MarketplaceSearchShell
        current="map"
        surface="map"
        search={<input aria-label="Search marketplace" />}
      />,
    );

    expect(view.container.firstElementChild?.className).toContain("bg-transparent");
    expect(view.container.firstElementChild?.className).not.toContain("bg-background");
  });
});
