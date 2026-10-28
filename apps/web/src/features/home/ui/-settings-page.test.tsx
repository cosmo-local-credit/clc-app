import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useInstallStore } from "#/features/install/install-store";
import { PLATFORM_ABOUT_URL } from "#/lib/legal";

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("sonner", () => ({ toast }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string;
    search?: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a href={search ? `${to}?${new URLSearchParams(search).toString()}` : to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("#/components/language-selector", () => ({
  LanguageSettingsRow: () => <div data-testid="language-row" />,
}));

vi.mock("#/components/theme-selector", () => ({
  ThemeSettingsRow: () => <div data-testid="theme-row" />,
}));

vi.mock("./notification-settings-section", () => ({
  NotificationSettingsSection: ({ walletAddress }: { walletAddress?: string }) => (
    <div data-testid="notification-row">{walletAddress}</div>
  ),
}));

vi.mock("./passkey-settings-section", () => ({
  PasskeySettingsSection: ({ address }: { address?: string }) => (
    <div data-testid="passkey-row" data-address={address} />
  ),
}));

vi.mock("./account-settings-section", () => ({
  AccountSettingsSection: () => <div data-testid="account-row" />,
}));

const { mySafes } = vi.hoisted(() => ({ mySafes: { data: undefined as unknown[] | undefined } }));
vi.mock("#/features/safe/hooks/use-safe-signers", () => ({ useMySafes: () => mySafes }));
vi.mock("./multisig-settings-section", () => ({
  MultisigSettingsRows: ({ safes }: { safes: unknown[] }) => (
    <div data-testid="multisig-rows">{safes.length}</div>
  ),
}));

const { SettingsPage } = await import("./settings-page");

const ADDRESS = "0xabcdef1234567890abcdef1234567890abcdef12" as const;

beforeEach(() => {
  useInstallStore.setState(useInstallStore.getInitialState(), true);
  mySafes.data = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  toast.error.mockReset();
  toast.success.mockReset();
});

function group(name: string) {
  return screen.getByRole("region", { name });
}

describe("SettingsPage", () => {
  it("adds Multisig after Sign-in only for someone who signs for a multisig", () => {
    mySafes.data = [{ kind: "safe", owner: ADDRESS, signers: [ADDRESS], threshold: 1 }];
    render(<SettingsPage delegationStatus="checking" isSigningOut={false} onSignOut={vi.fn()} />);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Account", "Preferences", "Sign-in", "Multisig", "App", "Session"]);
    expect(within(group("Multisig")).getByTestId("multisig-rows").textContent).toBe("1");
  });

  it("leaves Multisig out for someone who signs for none", () => {
    mySafes.data = [];
    render(<SettingsPage delegationStatus="checking" isSigningOut={false} onSignOut={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "Multisig" })).toBeNull();
  });

  it("groups the rows under Account, Preferences, Sign-in, App and Session, in that order", () => {
    render(<SettingsPage delegationStatus="checking" isSigningOut={false} onSignOut={vi.fn()} />);

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Account",
      "Preferences",
      "Sign-in",
      "App",
      "Session",
    ]);
    // Muted text on the gray page background falls short of 4.5:1.
    for (const heading of headings) {
      expect(heading.className).toContain("text-foreground");
      expect(heading.className).toContain("text-sm");
    }

    expect(within(group("Account")).getByTestId("account-row")).toBeTruthy();
    const preferences = within(group("Preferences"));
    expect(
      ["language-row", "theme-row", "notification-row"].map(
        (id) => preferences.getByTestId(id).dataset.testid,
      ),
    ).toEqual(["language-row", "theme-row", "notification-row"]);
    expect(within(group("Sign-in")).getByTestId("passkey-row")).toBeTruthy();
    expect(within(group("Sign-in")).getByRole("button", { name: /wallet session/i })).toBeTruthy();
  });

  it("links to About Cosmo-Local Credit from the App group, in a new tab", () => {
    render(<SettingsPage delegationStatus="checking" isSigningOut={false} onSignOut={vi.fn()} />);

    const about = within(group("App")).getByRole("link", { name: "About Cosmo-Local Credit" });
    expect(about.getAttribute("href")).toBe(PLATFORM_ABOUT_URL);
    expect(about.getAttribute("target")).toBe("_blank");
    expect(about.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("offers Install CLC, or Share CLC once installed", () => {
    const { unmount } = render(
      <SettingsPage delegationStatus="checking" isSigningOut={false} onSignOut={vi.fn()} />,
    );
    const install = within(group("App")).getByRole("link", { name: "Install CLC" });
    // Install knows it was opened from here, so its Back returns to Settings.
    expect(install.getAttribute("href")).toBe("/install?from=settings");
    unmount();

    useInstallStore.setState({ installed: true });
    render(<SettingsPage delegationStatus="checking" isSigningOut={false} onSignOut={vi.fn()} />);
    expect(within(group("App")).getByRole("link", { name: "Share CLC" })).toBeTruthy();
  });

  it("shows this build's version and commit as a static row", () => {
    render(<SettingsPage delegationStatus="checking" isSigningOut={false} onSignOut={vi.fn()} />);
    // The vitest config inlines a dirty `0.0.0-test` build with an unknown commit.
    const version = screen.getByText("0.0.0-test (1) · unknown*");
    expect(version.getAttribute("dir")).toBe("ltr");
    expect(version.className).toContain("font-mono");
    expect(screen.queryByRole("button", { name: /app version/i })).toBeNull();
  });

  it("keeps every row 44px high", () => {
    render(
      <SettingsPage
        address={ADDRESS}
        delegationStatus="checking"
        isSigningOut={false}
        onSignOut={vi.fn()}
      />,
    );
    const rows = [
      screen.getByRole("button", { name: /wallet session/i }),
      screen.getByRole("link", { name: /install clc/i }),
      screen.getByRole("link", { name: /about cosmo-local credit/i }),
      screen.getByText("App version").parentElement,
      screen.getByRole("button", { name: /sign out/i }),
    ];
    for (const row of rows) {
      expect(row?.className).toContain("h-11");
      expect(row?.className).not.toContain("min-h-");
    }
  });

  it("shows the connected address ellipsized, and in full with a copy button in its sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(
      <SettingsPage
        address={ADDRESS}
        delegationStatus="delegated"
        isSigningOut={false}
        onSignOut={vi.fn()}
      />,
    );

    const row = screen.getByRole("button", { name: /wallet session/i });
    expect(row.textContent).toContain("0xabcd…def12");
    expect(screen.queryByText(/delegated to calibur/i)).toBeNull();

    fireEvent.click(row);
    const sheet = await screen.findByRole("dialog", { name: "Wallet session" });
    const fullAddress = within(sheet).getByText(
      (_, element) => element?.getAttribute("dir") === "ltr" && element.textContent === ADDRESS,
    );
    // Both ends are highlighted, as in the row's ellipsized form.
    expect(
      [...fullAddress.querySelectorAll(".text-primary")].map((part) => part.textContent),
    ).toEqual(["abcd", "def12"]);
    expect(within(sheet).getByText(/delegated to calibur/i)).toBeTruthy();
    expect(within(sheet).getByText("Active")).toBeTruthy();

    fireEvent.click(within(sheet).getByRole("button", { name: "Copy address" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ADDRESS));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Address copied"));
  });

  it("reports when address copying is unavailable or rejected", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const first = render(
      <SettingsPage
        address={ADDRESS}
        delegationStatus="delegated"
        isSigningOut={false}
        onSignOut={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /wallet session/i }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Wallet session" })).getByRole("button", {
        name: "Copy address",
      }),
    );
    expect(toast.error).toHaveBeenCalledWith("Couldn't copy address");
    first.unmount();

    const writeText = vi.fn().mockRejectedValue(new Error("permission denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(
      <SettingsPage
        address={ADDRESS}
        delegationStatus="delegated"
        isSigningOut={false}
        onSignOut={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /wallet session/i }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Wallet session" })).getByRole("button", {
        name: "Copy address",
      }),
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
  });

  it("shows an inactive delegation and no copy button without an address", async () => {
    render(
      <SettingsPage delegationStatus="not-delegated" isSigningOut={false} onSignOut={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /wallet session/i }));
    const sheet = await screen.findByRole("dialog", { name: "Wallet session" });
    expect(within(sheet).getByText(/no address available/i)).toBeTruthy();
    expect(within(sheet).getByText("Inactive")).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: "Copy address" })).toBeNull();
  });

  it("puts the passkey and notification rows on the connected wallet", () => {
    render(
      <SettingsPage
        address={ADDRESS}
        delegationStatus="checking"
        isSigningOut={false}
        onSignOut={vi.fn()}
      />,
    );
    expect(screen.getByTestId("passkey-row").dataset.address).toBe(ADDRESS);
    expect(screen.getByTestId("notification-row").textContent).toBe(ADDRESS);
  });

  it("asks before signing out, and signs out only once confirmed", async () => {
    const onSignOut = vi.fn();
    render(<SettingsPage delegationStatus="checking" isSigningOut={false} onSignOut={onSignOut} />);

    fireEvent.click(within(group("Session")).getByRole("button", { name: "Sign out" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Sign out?" }));
    expect(onSignOut).not.toHaveBeenCalled();
    expect(sheet.getByText("You’ll need your paper card or passkey to sign back in.")).toBeTruthy();

    const confirm = sheet.getByRole("button", { name: "Sign out" });
    expect(confirm.className).toContain("text-destructive");
    expect(confirm.dataset.variant).toBe("destructive");
    fireEvent.click(confirm);

    expect(onSignOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the session when the confirmation is cancelled", async () => {
    const onSignOut = vi.fn();
    render(<SettingsPage delegationStatus="checking" isSigningOut={false} onSignOut={onSignOut} />);

    fireEvent.click(within(group("Session")).getByRole("button", { name: "Sign out" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Sign out?" }));
    fireEvent.click(sheet.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("shows the Spinner and 'Signing out…' on a busy row while signing out", () => {
    render(<SettingsPage delegationStatus="checking" isSigningOut={true} onSignOut={vi.fn()} />);
    const row = within(group("Session")).getByRole("button", { name: "Signing out…" });
    expect((row as HTMLButtonElement).disabled).toBe(true);
    expect(row.getAttribute("aria-busy")).toBe("true");
    expect(row.querySelector("[data-slot=spinner]")).toBeTruthy();
  });
});
