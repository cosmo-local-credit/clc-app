import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockAbortWalletSwitch } = vi.hoisted(() => ({
  mockAbortWalletSwitch: vi.fn(),
}));

vi.mock("./bottom-navigation", () => ({
  BottomNavigation: ({
    activeTab,
    isAuthenticated,
  }: {
    activeTab: string;
    isAuthenticated: boolean;
  }) => (
    <nav
      data-testid="bottom-navigation"
      data-active-tab={activeTab}
      data-authenticated={String(isAuthenticated)}
    />
  ),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0xabc" as `0x${string}` }),
  useDisconnect: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("#/features/auth/hooks/use-auth-session", () => ({
  useBackendLogout: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("#/lib/wallet-session", () => ({
  abortWalletSwitch: mockAbortWalletSwitch,
}));

vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => "checking" as const,
}));

vi.mock("./wallet-page", () => ({
  WalletPage: () => <div data-testid="wallet-page" />,
}));

vi.mock("./activity-page", () => ({
  ActivityPage: () => <div data-testid="activity-page" />,
}));

vi.mock("./market-page", () => ({
  MarketPage: ({ onboardingBanner }: { onboardingBanner?: ReactNode }) => (
    <div data-testid="market-page">{onboardingBanner}</div>
  ),
}));

vi.mock("./onboarding-banner", () => ({
  OnboardingBanner: () => <div data-testid="onboarding-banner" />,
}));

vi.mock("./posts-page", () => ({
  PostsPage: () => <div data-testid="posts-page" />,
}));

vi.mock("./settings-page", () => ({
  SettingsPage: ({ onSignOut }: { onSignOut: () => void }) => (
    <div data-testid="settings-page">
      <button type="button" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  ),
}));

import { HomePage } from "./home-page";

function renderHome(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockAbortWalletSwitch.mockClear();
});

describe("HomePage tabs", () => {
  it("shows market page by default", () => {
    renderHome(<HomePage />);
    expect(screen.getByTestId("market-page")).toBeTruthy();
    expect(screen.queryByTestId("wallet-page")).toBeNull();
  });

  it("renders the requested wallet tab", () => {
    renderHome(<HomePage activeTab="wallet" />);
    expect(screen.getByTestId("wallet-page")).toBeTruthy();
    expect(screen.getByTestId("bottom-navigation").getAttribute("data-active-tab")).toBe("wallet");
  });

  it("renders the requested activity tab", () => {
    renderHome(<HomePage activeTab="activity" />);
    expect(screen.getByTestId("activity-page")).toBeTruthy();
  });

  it("renders the requested posts tab", () => {
    renderHome(<HomePage activeTab="posts" />);
    expect(screen.getByTestId("posts-page")).toBeTruthy();
  });

  it("renders the requested settings tab", () => {
    renderHome(<HomePage activeTab="settings" />);
    expect(screen.getByTestId("settings-page")).toBeTruthy();
  });
});

describe("HomePage guest mode", () => {
  it("shows market and onboarding banner", () => {
    renderHome(<HomePage isAuthenticated={false} />);
    expect(screen.getByTestId("market-page")).toBeTruthy();
    expect(screen.getByTestId("onboarding-banner")).toBeTruthy();
  });

  it("does not render private content for a requested private tab", () => {
    renderHome(<HomePage activeTab="wallet" isAuthenticated={false} />);
    expect(screen.getByTestId("market-page")).toBeTruthy();
    expect(screen.queryByTestId("wallet-page")).toBeNull();
    expect(screen.queryByRole("button", { name: "Wallet" })).toBeNull();
  });
});

describe("HomePage sign-out", () => {
  it("aborts any pending wallet switch on sign-out", async () => {
    renderHome(<HomePage activeTab="settings" />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(mockAbortWalletSwitch).toHaveBeenCalledTimes(1);
    });
  });
});
