import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ActivityKind } from "@clc/api/features/accounts/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockNavigate, mockUseSearch, mockAuthStatus, mockSafeShow } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseSearch: vi.fn((): Record<string, unknown> => ({ tab: "market", view: "map" })),
  mockAuthStatus: {
    isLoading: false,
    isAuthenticated: false,
  },
  mockSafeShow: vi.fn(),
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
vi.mock("#/features/safe/state/safe-sheet", () => ({
  useSafeSheet: { getState: () => ({ show: mockSafeShow }) },
}));

vi.mock("#/components/auth/authenticated-route", () => ({
  AuthenticatedRoute: ({ children }: { children: ReactNode }) =>
    mockAuthStatus.isAuthenticated ? children : <div data-testid="sign-in-screen" />,
}));

vi.mock("#/features/home/ui/home-page", () => ({
  HomePage: ({
    activeTab,
    isAuthenticated,
    activityQ,
    activityTypes,
    messageTo,
    onActivityQueryChange,
    onActivityTypesChange,
    onMessageToConsumed,
  }: {
    activeTab: string;
    isAuthenticated: boolean;
    activityQ?: string;
    activityTypes?: readonly ActivityKind[];
    messageTo?: `0x${string}`;
    onActivityQueryChange?: (query: string) => void;
    onActivityTypesChange?: (types: readonly ActivityKind[]) => void;
    onMessageToConsumed?: () => void;
  }) => (
    <div
      data-testid="home-page"
      data-tab={activeTab}
      data-authenticated={String(isAuthenticated)}
      data-activity-q={activityQ}
      data-activity-types={activityTypes?.join(",")}
      data-message-to={messageTo}
    >
      <button type="button" onClick={() => onActivityQueryChange?.("market")}>
        Set query
      </button>
      <button type="button" onClick={() => onActivityTypesChange?.(["sent", "swapped"])}>
        Set types
      </button>
      <button type="button" onClick={onMessageToConsumed}>
        Clear message recipient
      </button>
    </div>
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
  mockSafeShow.mockClear();
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
    expect(screen.getByTestId("home-page").getAttribute("data-authenticated")).toBe("false");
  });

  it.each(["wallet", "activity", "settings"])(
    "shows a guest the sign-in screen on %s and stays on that tab",
    async (tab) => {
      mockUseSearch.mockReturnValue({ tab, view: "map" });
      renderIndex();

      expect(await screen.findByTestId("sign-in-screen")).toBeTruthy();
      expect(screen.queryByTestId("home-page")).toBeNull();
      expect(mockNavigate).not.toHaveBeenCalled();
    },
  );

  it("keeps Posts public for a guest", async () => {
    mockUseSearch.mockReturnValue({ tab: "posts", view: "map" });
    renderIndex();

    expect((await screen.findByTestId("home-page")).getAttribute("data-tab")).toBe("posts");
  });

  it("passes private tabs through for authenticated users", async () => {
    mockAuthStatus.isAuthenticated = true;
    mockUseSearch.mockReturnValue({ tab: "wallet", view: "map" });
    renderIndex();
    expect((await screen.findByTestId("home-page")).getAttribute("data-tab")).toBe("wallet");
    expect(screen.getByTestId("home-page").getAttribute("data-authenticated")).toBe("true");
  });

  it("passes canonical Activity state and uses replace only for search typing", async () => {
    mockAuthStatus.isAuthenticated = true;
    mockUseSearch.mockReturnValue({
      tab: "activity",
      view: "map",
      activityQ: "old voucher",
      activityTypes: "sent,swapped",
    });
    renderIndex();

    const page = await screen.findByTestId("home-page");
    expect(page.getAttribute("data-activity-q")).toBe("old voucher");
    expect(page.getAttribute("data-activity-types")).toBe("sent,swapped");

    fireEvent.click(screen.getByRole("button", { name: "Set query" }));
    const queryNavigation = mockNavigate.mock.calls[0]?.[0];
    expect(queryNavigation.replace).toBe(true);
    expect(queryNavigation.search({ tab: "activity", activityTypes: "sent" })).toEqual({
      tab: "activity",
      activityTypes: "sent",
      activityQ: "market",
    });

    fireEvent.click(screen.getByRole("button", { name: "Set types" }));
    const typeNavigation = mockNavigate.mock.calls[1]?.[0];
    expect(typeNavigation.replace).toBeUndefined();
    expect(typeNavigation.search({ tab: "activity", activityQ: "market" })).toEqual({
      tab: "activity",
      activityQ: "market",
      activityTypes: "sent,swapped",
    });
  });

  it("passes and clears a resource-owner message recipient", async () => {
    const owner = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
    mockAuthStatus.isAuthenticated = true;
    mockUseSearch.mockReturnValue({
      tab: "activity",
      section: "messages",
      messageTo: owner,
    });
    renderIndex();

    expect((await screen.findByTestId("home-page")).getAttribute("data-message-to")).toBe(owner);
    fireEvent.click(screen.getByRole("button", { name: "Clear message recipient" }));

    const navigation = mockNavigate.mock.calls[0]?.[0];
    expect(navigation.replace).toBe(true);
    expect(navigation.search({ tab: "activity", messageTo: owner })).toEqual({
      tab: "activity",
      messageTo: undefined,
    });
  });

  it("opens the exact Safe proposal from a notification route", async () => {
    const safe = "0x1111111111111111111111111111111111111111";
    const safeTx = `0x${"ab".repeat(32)}`;
    mockAuthStatus.isAuthenticated = true;
    mockUseSearch.mockReturnValue({
      tab: "activity",
      section: "notifications",
      safe,
      safeTx,
    });
    renderIndex();
    expect(await screen.findByTestId("home-page")).toBeTruthy();
    expect(mockSafeShow).toHaveBeenCalledWith(safe, safeTx);
  });
});
