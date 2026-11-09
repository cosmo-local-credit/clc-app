import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Navigate: (props: { to: string; params: Record<string, string>; replace?: boolean }) => (
    <p data-testid="navigate">
      {JSON.stringify({ to: props.to, params: props.params, replace: props.replace })}
    </p>
  ),
}));
vi.mock("#/desktop/switch", () => ({
  LayoutSwitch: ({ mobile }: { mobile: ReactNode }) => mobile,
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: false, isLoading: false, address: undefined }),
}));
vi.mock("#/components/nearby-catalog", () => ({
  NearbyCatalog: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("#/features/catalogs/ui/catalogs-page", () => ({ CatalogsPage: () => <p>catalogs</p> }));
vi.mock("#/features/home/ui/market-list-page", () => ({ MarketListPage: () => <p>vouchers</p> }));
vi.mock("#/features/home/ui/marketplace-page", () => ({ MarketplacePage: () => <p>all</p> }));
vi.mock("#/features/home/ui/offers-page", () => ({ OffersPage: () => <p>offers</p> }));
vi.mock("#/features/pools/ui", () => ({ PoolsPage: () => <p>pools</p> }));
vi.mock("#/features/wants/ui/wants-page", () => ({ WantsPage: () => <p>wants</p> }));

import { Route } from "./_nav/market/index";

const VOUCHER = "0x2222222222222222222222222222222222222222";
const search = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

beforeEach(() => {
  search.current = { scope: "vouchers", view: "list" };
  vi.spyOn(Route, "useSearch").mockImplementation((() => search.current) as never);
});

function renderPhone() {
  const Component = Route.options.component as () => ReactNode;
  return render(<Component />);
}

const target = () => JSON.parse(screen.getByTestId("navigate").textContent ?? "");

describe("a desktop market card link on the phone", () => {
  it("opens the voucher it names instead of dropping it", () => {
    search.current = { ...search.current, voucher: VOUCHER };
    renderPhone();
    expect(target()).toEqual({
      to: "/vouchers/$voucherAddress",
      params: { voucherAddress: VOUCHER },
      replace: true,
    });
  });

  it("opens the Want it names", () => {
    search.current = { ...search.current, want: "42" };
    renderPhone();
    expect(target()).toEqual({ to: "/wants/$wantId", params: { wantId: "42" }, replace: true });
  });

  it("shows the list when it names neither", () => {
    renderPhone();
    expect(screen.getByText("vouchers")).toBeTruthy();
    expect(screen.queryByTestId("navigate")).toBeNull();
  });
});
