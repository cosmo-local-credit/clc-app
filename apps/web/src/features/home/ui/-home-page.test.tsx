import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockAbortWalletSwitch } = vi.hoisted(() => ({
  mockAbortWalletSwitch: vi.fn(),
}));

vi.mock("#/components/ui/clc-logo", () => ({
  CLCLogo: () => <svg data-testid="clc-logo" />,
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0xabc" as `0x${string}` }),
  useDisconnect: () => ({ disconnectAsync: vi.fn() }),
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

vi.mock("./market-page", () => ({
  MarketPage: ({ onboardingBanner }: { onboardingBanner?: ReactNode }) => (
    <div data-testid="market-page">{onboardingBanner}</div>
  ),
}));

vi.mock("./onboarding-banner", () => ({
  OnboardingBanner: () => <div data-testid="onboarding-banner" />,
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

vi.mock("./undone-page", () => ({
  UndonePage: ({ tab }: { tab: string }) => <div data-testid={`undone-${tab}`} />,
}));

import { HomePage } from "./home-page";

function renderHome(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockAbortWalletSwitch.mockClear();
});

describe("HomePage (uncontrolled)", () => {
  it("shows market page by default", () => {
    renderHome(<HomePage />);
    expect(screen.getByTestId("market-page")).toBeTruthy();
    expect(screen.queryByTestId("wallet-page")).toBeNull();
  });

  it("switches to wallet tab for authenticated users", () => {
    renderHome(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Wallet" }));
    expect(screen.getByTestId("wallet-page")).toBeTruthy();
    expect(screen.queryByTestId("market-page")).toBeNull();
  });

  it("switches to activity tab", () => {
    renderHome(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(screen.getByTestId("undone-activity")).toBeTruthy();
  });

  it("switches to pool tab", () => {
    renderHome(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Pool" }));
    expect(screen.getByTestId("undone-pool")).toBeTruthy();
  });

  it("switches to settings tab", () => {
    renderHome(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
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

describe("HomePage (controlled)", () => {
  it("renders the tab provided by the parent", () => {
    renderHome(<HomePage activeTab="pool" />);
    expect(screen.getByTestId("undone-pool")).toBeTruthy();
  });

  it("calls onTabChange with the selected tab", () => {
    const onTabChange = vi.fn();
    renderHome(<HomePage activeTab="wallet" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onTabChange).toHaveBeenCalledWith("settings");
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
