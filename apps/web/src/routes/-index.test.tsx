import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockNavigate, mockUseSearch, mockAuthStatus } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseSearch: vi.fn(() => ({ tab: "market", view: "map" })),
  mockAuthStatus: {
    isLoading: false,
    isAuthenticated: false,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: mockUseSearch,
    useNavigate: () => mockNavigate,
  }),
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mockAuthStatus,
}));

vi.mock("#/features/home/ui/home-page", () => ({
  HomePage: ({
    activeTab,
    marketView,
    isAuthenticated,
  }: {
    activeTab: string;
    marketView: string;
    isAuthenticated: boolean;
  }) => (
    <div
      data-testid="home-page"
      data-tab={activeTab}
      data-market-view={marketView}
      data-authenticated={String(isAuthenticated)}
    />
  ),
}));

import { Route } from "./_nav/index";

type RouteFixture = {
  component: () => ReactNode;
  validateSearch: (search: Record<string, unknown>) => { tab?: string; view?: string };
};

function renderIndex() {
  const Component = (Route as unknown as RouteFixture).component;
  render(<Component />);
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockUseSearch.mockReturnValue({ tab: "market", view: "map" });
  mockAuthStatus.isLoading = false;
  mockAuthStatus.isAuthenticated = false;
});

describe("IndexPage routing", () => {
  it("keeps market as the default tab", () => {
    const { validateSearch } = Route as unknown as RouteFixture;

    expect(validateSearch({})).toEqual({ tab: "market", view: "map" });
    expect(validateSearch({ tab: "dashboard" })).toEqual({ tab: "market", view: "map" });
    expect(validateSearch({ tab: "market", view: "list" })).toEqual({
      tab: "market",
      view: "list",
    });
  });

  it("renders a loading shell while auth is loading", () => {
    mockAuthStatus.isLoading = true;
    renderIndex();
    expect(screen.queryByTestId("home-page")).toBeNull();
  });

  it("renders the market map for disconnected users", async () => {
    renderIndex();
    expect((await screen.findByTestId("home-page")).getAttribute("data-tab")).toBe("market");
    expect(screen.getByTestId("home-page").getAttribute("data-market-view")).toBe("map");
    expect(screen.getByTestId("home-page").getAttribute("data-authenticated")).toBe("false");
  });

  it("normalizes private tabs for guests without adding history", async () => {
    mockUseSearch.mockReturnValue({ tab: "wallet", view: "map" });
    renderIndex();

    expect((await screen.findByTestId("home-page")).getAttribute("data-tab")).toBe("market");
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/",
        search: { tab: "market" },
        replace: true,
      });
    });
  });

  it("passes private tabs through for authenticated users", async () => {
    mockAuthStatus.isAuthenticated = true;
    mockUseSearch.mockReturnValue({ tab: "wallet", view: "map" });
    renderIndex();
    expect((await screen.findByTestId("home-page")).getAttribute("data-tab")).toBe("wallet");
    expect(screen.getByTestId("home-page").getAttribute("data-authenticated")).toBe("true");
  });
});
