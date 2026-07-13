import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockUseSearch } = vi.hoisted(() => ({
  mockUseSearch: vi.fn<() => { tab?: string }>(() => ({})),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: Record<string, unknown>) => ({
    path,
    ...options,
    useSearch: mockUseSearch,
  }),
}));

vi.mock("#/components/home-route-page", () => ({
  HomeRoutePage: ({ activeTab }: { activeTab: string }) => (
    <div data-testid={`home-route-${activeTab}`} />
  ),
}));

import { Route } from "./index";

type RouteFixture = {
  component: () => ReactNode;
  validateSearch: (search: Record<string, unknown>) => { tab?: string };
};

function renderIndex() {
  const Component = (Route as unknown as RouteFixture).component;
  render(<Component />);
}

beforeEach(() => {
  mockUseSearch.mockReturnValue({});
});

describe("IndexPage routing", () => {
  it("keeps a missing legacy tab optional and normalizes supplied values", () => {
    const { validateSearch } = Route as unknown as RouteFixture;

    expect(validateSearch({})).toEqual({ tab: undefined });
    expect(validateSearch({ tab: "activity" })).toEqual({ tab: "activity" });
    expect(validateSearch({ tab: "dashboard" })).toEqual({ tab: "market" });
  });

  it("renders the wallet tab at the root path", () => {
    renderIndex();

    expect(screen.getByTestId("home-route-wallet")).toBeTruthy();
  });

  it("passes a legacy search tab to the shared route shell", () => {
    mockUseSearch.mockReturnValue({ tab: "market" });

    renderIndex();

    expect(screen.getByTestId("home-route-market")).toBeTruthy();
  });
});
