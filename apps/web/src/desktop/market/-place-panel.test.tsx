import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const ADDRESS = "0xd524d0ed7bc970185ed9c6c9a65a8a02e8897363";

vi.mock("wagmi", () => ({ useConnection: () => ({ address: undefined }) }));
vi.mock("#/lib/navigation/use-voucher-sheet-selection", () => ({
  useVoucherSheetSelection: () => ({ voucher: ADDRESS, open: vi.fn(), close: vi.fn() }),
}));
vi.mock("#/lib/navigation/use-want-sheet-selection", () => ({
  useWantSheetSelection: () => ({ want: null, open: vi.fn(), close: vi.fn() }),
}));
vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({
    data: {
      id: "1",
      address: ADDRESS,
      name: "Bakery voucher",
      symbol: "BAKE",
      tags: [],
      lat: null,
      lng: null,
      chainId: 100,
    },
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    privateInfo: undefined,
  }),
}));
vi.mock("#/components/vouchers/voucher-summary", () => ({
  useVoucherBalanceSummary: () => ({ status: "hidden", hasPositiveBalance: false }),
}));
vi.mock("#/components/vouchers/voucher-labels", () => ({ useMarketDistanceLabel: () => null }));
vi.mock("#/desktop/wants/want-place-desk", () => ({ WantPlaceDesk: () => null }));
vi.mock("#/desktop/vouchers/detail/voucher-actions", () => ({ VoucherActionCells: () => null }));
vi.mock("#/desktop/vouchers/detail/voucher-catalog-button", () => ({
  VoucherCatalogButton: () => null,
}));
vi.mock("#/desktop/vouchers/detail/voucher-info", () => ({
  useCanEditVoucher: () => ({ canEdit: false }),
  VoucherInfoDesk: () => <p>info body</p>,
}));
vi.mock("#/desktop/vouchers/detail/voucher-offerings", () => ({
  VoucherOfferingsDesk: () => <p>offerings body</p>,
}));
vi.mock("#/desktop/vouchers/detail/voucher-posts", () => ({
  VoucherPostsDesk: () => <p>posts body</p>,
}));
vi.mock("#/desktop/vouchers/detail/voucher-reviews", () => ({
  VoucherReviewsDesk: () => <p>reviews body</p>,
}));
vi.mock("#/desktop/vouchers/detail/voucher-activity", () => ({
  VoucherActivityDesk: () => <p>activity body</p>,
}));
vi.mock("#/desktop/vouchers/detail/voucher-section-bits", () => ({
  VoucherBalanceLine: () => null,
  VoucherRatingLine: () => null,
  VoucherShareButton: () => null,
}));

import { MarketPlacePanel } from "./place-panel";

function renderPanel() {
  const rootRoute = createRootRoute({ component: Outlet });
  const index = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <MarketPlacePanel realFix={null} />,
  });
  const stub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/vouchers/$voucherAddress",
    component: () => <p>voucher page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([index, stub]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  window.scrollTo = vi.fn();
  render(<RouterProvider router={router} />);
}

describe("MarketPlacePanel voucher card", () => {
  it("titles the voucher at the 16px section role, not a larger heading of its own", async () => {
    renderPanel();
    const heading = await screen.findByRole("heading", { level: 2, name: /Bakery voucher/ });
    expect(heading.className).toContain("font-heading");
    expect(heading.className).toContain("text-base");
    expect(heading.className).toContain("font-semibold");
    expect(heading.className).not.toContain("text-xl");
    expect(heading.querySelector("a")?.className ?? "").not.toMatch(/text-(xl|2xl)|tracking-tight/);
  });

  it("switches its content with real tabs: a tablist, a panel it controls, and arrow keys", async () => {
    renderPanel();
    const tablist = await screen.findByRole("tablist", { name: "Voucher" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Offerings",
      "Reviews",
      "Posts",
      "Info",
      "Activity",
    ]);
    // Content tabs are not route links: nothing says they are the current page.
    for (const tab of tabs) expect(tab.getAttribute("aria-current")).toBeNull();

    const offerings = tabs[0]!;
    expect(offerings.getAttribute("aria-selected")).toBe("true");
    const panel = screen.getByRole("tabpanel");
    expect(panel.textContent).toBe("offerings body");
    expect(panel.getAttribute("aria-labelledby")).toBe(offerings.id);
    expect(offerings.getAttribute("aria-controls")).toBe(panel.id);

    offerings.focus();
    fireEvent.keyDown(offerings, { key: "ArrowRight" });
    const reviews = screen.getByRole("tab", { name: "Reviews" });
    expect(document.activeElement).toBe(reviews);
    expect(reviews.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("reviews body");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(reviews.id);
    // A closed tab mounts nothing, so it runs no query.
    expect(screen.queryByText("offerings body")).toBeNull();

    fireEvent.keyDown(reviews, { key: "End" });
    expect(screen.getByRole("tab", { name: "Activity" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("tabpanel").textContent).toBe("activity body");
  });

  it("keeps each tab label on one line", async () => {
    renderPanel();
    for (const tab of await screen.findAllByRole("tab")) {
      expect(tab.className).toContain("whitespace-nowrap");
    }
  });
});
