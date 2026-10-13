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
        credit={<button type="button">Credit</button>}
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
      "Credit",
    ]);
    const current = within(nav).getByRole("button", { name: "Voucher" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect((current as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not reserve trailing space when Credit is unavailable", () => {
    render(<MarketplaceResourceNavigation current="catalogs" />);

    const nav = screen.getByRole("navigation", { name: "Marketplace sections" });
    expect(nav.querySelectorAll("a,button")).toHaveLength(6);
  });

  it("brings the active scope into the mobile scroll area", () => {
    render(<MarketplaceResourceNavigation current="map" />);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });
});
