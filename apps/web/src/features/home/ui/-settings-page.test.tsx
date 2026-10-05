import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { PLATFORM_ABOUT_URL } from "#/lib/legal";

vi.mock("#/components/install-app-link", () => ({
  InstallAppLink: () => <a href="/install">Install CLC</a>,
}));

vi.mock("#/components/language-selector", () => ({
  LanguageSelector: () => <div data-testid="language-selector" />,
}));

vi.mock("#/components/theme-selector", () => ({
  ThemeSelector: () => <div data-testid="theme-selector" />,
}));

vi.mock("./notification-settings-section", () => ({
  NotificationSettingsSection: ({ walletAddress }: { walletAddress?: string }) => (
    <div data-testid="notification-settings">{walletAddress}</div>
  ),
}));

vi.mock("./passkey-settings-section", () => ({
  PasskeySettingsSection: ({ address }: { address?: string }) => (
    <div data-testid="passkey-settings" data-address={address} />
  ),
}));

vi.mock("./account-settings-section", () => ({
  AccountSettingsSection: () => <div data-testid="account-settings" />,
}));

const { SettingsPage } = await import("./settings-page");

describe("SettingsPage", () => {
  it("links to About Cosmo-Local Credit immediately above Account", () => {
    render(<SettingsPage delegationStatus="checking" isSigningOut={false} onSignOut={vi.fn()} />);

    const about = screen.getByRole("link", { name: "About Cosmo-Local Credit" });
    const account = screen.getByTestId("account-settings");

    expect(about.getAttribute("href")).toBe(PLATFORM_ABOUT_URL);
    expect(about.getAttribute("target")).toBe("_blank");
    expect(about.getAttribute("rel")).toBe("noopener noreferrer");
    expect(about.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the connected address", () => {
    render(
      <SettingsPage
        address="0xabcdef1234567890abcdef1234567890abcdef12"
        delegationStatus="checking"
        isSigningOut={false}
        onSignOut={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/0xabcdef1234567890abcdef1234567890abcdef12/i)).toHaveLength(2);
  });

  it("puts the sign-in methods section on the connected wallet", () => {
    render(
      <SettingsPage
        address="0xabcdef1234567890abcdef1234567890abcdef12"
        delegationStatus="checking"
        isSigningOut={false}
        onSignOut={vi.fn()}
      />,
    );
    expect(screen.getByTestId("passkey-settings").dataset.address).toBe(
      "0xabcdef1234567890abcdef1234567890abcdef12",
    );
  });

  it("offers theme and language under Preferences, as the app menu does", () => {
    render(<SettingsPage delegationStatus="checking" isSigningOut={false} onSignOut={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /preferences/i })).toBeTruthy();
    expect(screen.getByTestId("theme-selector")).toBeTruthy();
    expect(screen.getByTestId("language-selector")).toBeTruthy();
  });

  it("shows 'No address available' when address is undefined", () => {
    render(<SettingsPage delegationStatus="checking" isSigningOut={false} onSignOut={vi.fn()} />);
    expect(screen.getByText(/no address available/i)).toBeTruthy();
  });

  it("passes the connected address to notification settings", () => {
    render(
      <SettingsPage
        address="0xabcdef1234567890abcdef1234567890abcdef12"
        delegationStatus="checking"
        isSigningOut={false}
        onSignOut={vi.fn()}
      />,
    );
    expect(screen.getByTestId("notification-settings").textContent).toBe(
      "0xabcdef1234567890abcdef1234567890abcdef12",
    );
  });

  it("shows the Calibur delegation row with active badge when delegated", () => {
    render(
      <SettingsPage
        address="0xabcdef1234567890abcdef1234567890abcdef12"
        delegationStatus="delegated"
        isSigningOut={false}
        onSignOut={vi.fn()}
      />,
    );
    expect(screen.getByText(/delegated to calibur/i)).toBeTruthy();
    expect(screen.getByText(/active/i)).toBeTruthy();
  });

  it("shows the Calibur delegation row with inactive badge when not-delegated", () => {
    render(
      <SettingsPage
        address="0xabcdef1234567890abcdef1234567890abcdef12"
        delegationStatus="not-delegated"
        isSigningOut={false}
        onSignOut={vi.fn()}
      />,
    );
    expect(screen.getByText(/delegated to calibur/i)).toBeTruthy();
    expect(screen.getByText(/inactive/i)).toBeTruthy();
  });

  it("calls onSignOut when sign out button is clicked", () => {
    const onSignOut = vi.fn();
    render(<SettingsPage delegationStatus="checking" isSigningOut={false} onSignOut={onSignOut} />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("disables the sign out button and shows 'Signing out...' while signing out", () => {
    render(<SettingsPage delegationStatus="checking" isSigningOut={true} onSignOut={vi.fn()} />);
    const button = screen.getByRole("button", { name: /signing out/i });
    expect(button).toBeTruthy();
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
