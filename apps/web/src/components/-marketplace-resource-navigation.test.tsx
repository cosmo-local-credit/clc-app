import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    search: _search,
    ...props
  }: {
    to: string;
    children: ReactNode;
    search?: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { MarketplaceResourceNavigation } from "./marketplace-resource-navigation";

describe("MarketplaceResourceNavigation", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  it("always renders the six controls in order and marks the current page", () => {
    render(
      <MarketplaceResourceNavigation
        current="vouchers"
        filters={<button type="button">Filters</button>}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Marketplace sections" });
    expect(Array.from(nav.querySelectorAll("a,button")).map((item) => item.textContent)).toEqual([
      "All",
      "Offers",
      "Voucher",
      "Pools",
      "Catalogs",
      "Map",
      "Filters",
    ]);
    const current = within(nav).getByRole("button", { name: "Voucher" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect((current as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows Catalog Filters as a disabled control", () => {
    render(<MarketplaceResourceNavigation current="catalogs" />);
    expect((screen.getByRole("button", { name: "Filters" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("brings the active scope into the mobile scroll area", () => {
    render(<MarketplaceResourceNavigation current="map" />);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });
});
