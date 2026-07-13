import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { HomeTab } from "#/features/home/ui/tabs";

const { mockNavigate, mockUseAuthStatus } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseAuthStatus: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mockUseAuthStatus(),
}));

vi.mock("./home-page", () => ({
  HomePage: ({
    activeTab,
    isAuthenticated,
    onTabChange,
  }: {
    activeTab: HomeTab;
    isAuthenticated: boolean;
    onTabChange: (tab: HomeTab) => void;
  }) => (
    <div data-testid={`home-${activeTab}-${isAuthenticated ? "auth" : "guest"}`}>
      <button type="button" onClick={() => onTabChange("activity")}>
        Activity tab
      </button>
      <button type="button" onClick={() => onTabChange("settings")}>
        Settings tab
      </button>
      <button type="button" onClick={() => onTabChange(activeTab)}>
        Current tab
      </button>
    </div>
  ),
}));

import { HomeRoutePage } from "./home-route-page";

beforeEach(() => {
  mockNavigate.mockClear();
  mockUseAuthStatus.mockReturnValue({ isAuthenticated: true, isLoading: false });
});

describe("HomeRoutePage", () => {
  it("renders the requested endpoint tab when authenticated", async () => {
    render(<HomeRoutePage activeTab="activity" />);

    expect(await screen.findByTestId("home-activity-auth")).toBeTruthy();
  });

  it("pushes path history when changing tabs", async () => {
    render(<HomeRoutePage activeTab="activity" />);

    await screen.findByTestId("home-activity-auth");
    fireEvent.click(screen.getByRole("button", { name: "Settings tab" }));

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings" });
  });

  it("does not add duplicate history for the current tab", async () => {
    render(<HomeRoutePage activeTab="settings" />);

    await screen.findByTestId("home-settings-auth");
    fireEvent.click(screen.getByRole("button", { name: "Current tab" }));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("redirects a guest from a private tab to the public market", async () => {
    mockUseAuthStatus.mockReturnValue({ isAuthenticated: false, isLoading: false });

    render(<HomeRoutePage activeTab="settings" />);

    expect(await screen.findByTestId("home-market-guest")).toBeTruthy();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/market", replace: true });
    });
  });

  it("keeps a guest on the public market path", async () => {
    mockUseAuthStatus.mockReturnValue({ isAuthenticated: false, isLoading: false });

    render(<HomeRoutePage activeTab="market" />);

    expect(await screen.findByTestId("home-market-guest")).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("renders only the fallback while authentication is loading", () => {
    mockUseAuthStatus.mockReturnValue({ isAuthenticated: false, isLoading: true });

    render(<HomeRoutePage activeTab="wallet" />);

    expect(screen.queryByTestId("home-wallet-guest")).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
