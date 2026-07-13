import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { HomeTab } from "#/features/home/ui/tabs";

const { mockNavigate, mockUseAccount } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseAccount: vi.fn(() => ({ isConnected: true })),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("wagmi", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock("#/features/onboarding/ui/landing-page", () => ({
  LandingPage: () => <div data-testid="landing-page" />,
}));

vi.mock("./home-page", () => ({
  HomePage: ({
    activeTab,
    onTabChange,
  }: {
    activeTab: HomeTab;
    onTabChange: (tab: HomeTab) => void;
  }) => (
    <div data-testid={`home-${activeTab}`}>
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
  mockUseAccount.mockReturnValue({ isConnected: true });
});

describe("HomeRoutePage", () => {
  it("renders the activity endpoint tab when connected", async () => {
    render(<HomeRoutePage activeTab="activity" />);

    await waitFor(() => {
      expect(screen.getByTestId("home-activity")).toBeTruthy();
    });
  });

  it("renders the settings endpoint tab when connected", async () => {
    render(<HomeRoutePage activeTab="settings" />);

    await waitFor(() => {
      expect(screen.getByTestId("home-settings")).toBeTruthy();
    });
  });

  it("pushes path history when changing tabs", async () => {
    render(<HomeRoutePage activeTab="activity" />);

    await screen.findByTestId("home-activity");
    fireEvent.click(screen.getByRole("button", { name: "Settings tab" }));

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings" });
  });

  it("does not add duplicate history for the current tab", async () => {
    render(<HomeRoutePage activeTab="settings" />);

    await screen.findByTestId("home-settings");
    fireEvent.click(screen.getByRole("button", { name: "Current tab" }));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("renders the landing page when disconnected", () => {
    mockUseAccount.mockReturnValue({ isConnected: false });

    render(<HomeRoutePage activeTab="settings" />);

    expect(screen.getByTestId("landing-page")).toBeTruthy();
  });
});
