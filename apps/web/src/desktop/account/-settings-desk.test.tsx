import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderInShell } from "#/desktop/shell/-shell-test-router";
import { useShortcutHelp } from "#/desktop/shell/shortcut-help";
import { DesktopTopBar } from "#/desktop/shell/top-bar";

import { SettingsDesk } from "./settings-desk";

const ADDRESS = "0xabcdef1234567890abcdef1234567890abcdef12" as const;

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useConnection: () => ({ address: ADDRESS }),
}));
vi.mock("#/components/introduction/introduction-provider", () => ({
  useIntroductionReplay: () => null,
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, address: ADDRESS }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: { name: "Amina Otieno" }, isPending: false }),
}));
vi.mock("#/features/home/hooks/use-sign-out", () => ({
  useSignOut: () => ({ signOut: vi.fn(), isSigningOut: false }),
}));
vi.mock("#/features/home/hooks/use-notification-settings", () => ({
  useNotificationSettings: () => ({
    presentation: {
      status: "On",
      title: "Notifications are on",
      description: "",
      alert: null,
      canEnable: false,
    },
    hasDetail: true,
    enabling: false,
    enable: vi.fn(),
  }),
  useNotificationCuePreferences: () => ({
    sound: true,
    vibration: false,
    setSound: vi.fn(),
    setVibration: vi.fn(),
    canVibrate: false,
  }),
}));
vi.mock("#/features/home/hooks/use-passkey-settings", () => ({
  usePasskeySettings: () => ({
    passkey: {},
    badge: null,
    errorText: null,
    shownDescription: "",
    hasDetail: false,
    canLink: false,
    canSwitch: false,
    canRetryStatus: false,
  }),
}));
vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => "delegated",
}));
vi.mock("#/providers/theme", () => ({
  useHydratedTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockReset();
  // jsdom has no layout, so it has no scrolling either.
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value(this: Element, ...args: unknown[]) {
      scrollIntoView(this.id, ...args);
    },
  });
  window.localStorage.removeItem("clc.desktop.shortcuts");
  useShortcutHelp.setState({ open: false });
});

afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe("the top bar's notification action", () => {
  it("is named for notification settings, not for an inbox", async () => {
    await renderInShell(<DesktopTopBar />);
    expect(screen.queryByRole("link", { name: "Notifications" })).toBeNull();
    const link = screen.getByRole("link", { name: "Notification settings" });
    expect(link.getAttribute("href")).toBe("/?tab=settings#notifications");
  });

  it("lands on the Notifications row of Settings with its preferences open", async () => {
    await renderInShell(
      <>
        <DesktopTopBar />
        <SettingsDesk address={ADDRESS} />
      </>,
      "/?tab=wallet",
    );
    expect(screen.queryByRole("switch", { name: "Sound" })).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Notification settings" }));

    expect(await screen.findByRole("switch", { name: "Sound" })).toBeTruthy();
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith("notifications", expect.anything());
    });
    expect(document.getElementById("notifications")?.textContent).toContain("Notifications");
  });

  it("leaves the preferences closed when Settings is opened any other way", async () => {
    await renderInShell(<SettingsDesk address={ADDRESS} />, "/?tab=settings");
    expect(screen.getByRole("button", { name: "Manage" })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Sound" })).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("the shortcuts row", () => {
  it("switches the single-key shortcuts off and on, and opens the list", async () => {
    await renderInShell(<SettingsDesk address={ADDRESS} />, "/?tab=settings");
    const toggle = screen.getByRole("switch", { name: "Single-key shortcuts" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle.getAttribute("aria-checked")).toBe("false");
    });
    expect(window.localStorage.getItem("clc.desktop.shortcuts")).toBe("off");

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(window.localStorage.getItem("clc.desktop.shortcuts")).toBe("on");
    });

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(useShortcutHelp.getState().open).toBe(true);
  });
});
