import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockNavigate, mockUseSearch, mockAuthStatus } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseSearch: vi.fn(() => ({ tab: "market" })),
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

vi.mock("#/components/home-page", () => ({
  HomePage: ({ activeTab, isAuthenticated }: { activeTab: string; isAuthenticated: boolean }) => (
    <div
      data-testid="home-page"
      data-tab={activeTab}
      data-authenticated={String(isAuthenticated)}
    />
  ),
}));

import { Route } from "./index";

function renderIndex() {
  const Component = (Route as unknown as { component: () => ReactNode }).component;
  render(<Component />);
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockUseSearch.mockReturnValue({ tab: "market" });
  mockAuthStatus.isLoading = false;
  mockAuthStatus.isAuthenticated = false;
});

describe("IndexPage routing", () => {
  it("renders a loading shell while auth is loading", () => {
    mockAuthStatus.isLoading = true;
    renderIndex();
    expect(screen.queryByTestId("home-page")).toBeNull();
  });

  it("renders market for disconnected users", async () => {
    renderIndex();
    expect((await screen.findByTestId("home-page")).getAttribute("data-tab")).toBe("market");
    expect(screen.getByTestId("home-page").getAttribute("data-authenticated")).toBe("false");
  });

  it("falls back to market for private tabs requested by guests", async () => {
    mockUseSearch.mockReturnValue({ tab: "wallet" });
    renderIndex();
    expect((await screen.findByTestId("home-page")).getAttribute("data-tab")).toBe("market");
  });

  it("passes private tabs through for authenticated users", async () => {
    mockAuthStatus.isAuthenticated = true;
    mockUseSearch.mockReturnValue({ tab: "wallet" });
    renderIndex();
    expect((await screen.findByTestId("home-page")).getAttribute("data-tab")).toBe("wallet");
    expect(screen.getByTestId("home-page").getAttribute("data-authenticated")).toBe("true");
  });
});
