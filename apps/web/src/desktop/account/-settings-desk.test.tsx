import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderInShell } from "#/desktop/shell/-shell-test-router";
import { useShortcutHelp } from "#/desktop/shell/shortcut-help";
import { DesktopTopBar } from "#/desktop/shell/top-bar";

import { SettingsDesk } from "./settings-desk";

const ADDRESS = "0xabcdef1234567890abcdef1234567890abcdef12" as const;
const SAFE = "0x5AFE000000000000000000000000000000000005" as const;
const [FIRST, SECOND, NEWCOMER] = [
  "0x00000000000000000000000000000000000000c3",
  "0x00000000000000000000000000000000000000a1",
  "0x00000000000000000000000000000000000000d4",
] as const;

const security = vi.hoisted(() => ({
  safes: [] as { kind: "safe"; owner: string; signers: string[]; threshold: number }[],
  signers: { data: undefined as unknown, isError: false, refetch: vi.fn() },
  propose: vi.fn(),
  proposing: false,
  report: vi.fn(),
  rotationEnabled: false,
  signInCard: {
    latest: undefined as { oldAddress: string } | undefined,
    canRelink: false,
    relinking: false,
    passkeyMoved: false,
    finishPasskeyMove: vi.fn(),
  },
}));
vi.mock("#/features/safe/hooks/use-safe-signers", () => ({
  useMySafes: () => ({ data: security.safes }),
  useSafeSigners: () => security.signers,
  useProposeSignerChange: () => ({ mutate: security.propose, isPending: security.proposing }),
}));
vi.mock("#/features/safe/hooks/use-report-write-error", () => ({
  useReportWriteError: () => security.report,
}));
vi.mock("#/lib/key-rotation-config", () => ({
  get KEY_ROTATION_ENABLED() {
    return security.rotationEnabled;
  },
}));
vi.mock("#/features/key-rotation/hooks/use-sign-in-card-settings", () => ({
  useSignInCardSettings: () => security.signInCard,
}));
vi.mock("#/components/wallet/recipient-identity-label", () => ({
  RecipientIdentityLabel: ({ address }: { address: string }) => <span>{address}</span>,
}));
vi.mock("#/components/wallet/recipient-address-input", () => ({
  RecipientAddressInput: ({
    id,
    ariaLabel,
    value,
    onValueChange,
    onRecipientChange,
  }: {
    id: string;
    ariaLabel: string;
    value: string;
    onValueChange: (value: string) => void;
    onRecipientChange: (recipient: { address: string; name: null; source: string } | null) => void;
  }) => (
    <input
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => {
        onValueChange(event.target.value);
        onRecipientChange(
          /^0x[0-9a-f]{40}$/i.test(event.target.value)
            ? { address: event.target.value, name: null, source: "manual" }
            : null,
        );
      }}
    />
  ),
}));

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
  security.safes = [];
  security.signers = {
    data: { safe: SAFE, owners: [FIRST, SECOND], threshold: 1 },
    isError: false,
    refetch: vi.fn(),
  };
  security.propose.mockReset();
  security.report.mockReset();
  security.proposing = false;
  security.rotationEnabled = false;
  security.signInCard = {
    latest: undefined,
    canRelink: false,
    relinking: false,
    passkeyMoved: false,
    finishPasskeyMove: vi.fn(),
  };
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

describe("the Multisig settings", () => {
  async function openSafe() {
    security.safes = [{ kind: "safe", owner: SAFE, signers: [FIRST, SECOND], threshold: 1 }];
    await renderInShell(<SettingsDesk address={ADDRESS} />, "/?tab=settings");
    const section = screen.getByRole("heading", { name: "Multisig" }).closest("section")!;
    fireEvent.click(within(section).getByRole("button", { name: "Manage" }));
    return screen.findByRole("dialog");
  }

  it("is left out for an account that signs for no multisig", async () => {
    await renderInShell(<SettingsDesk address={ADDRESS} />, "/?tab=settings");
    expect(screen.queryByRole("heading", { name: "Multisig" })).toBeNull();
  });

  it("lists each signer and the approvals required", async () => {
    const dialog = await openSafe();
    expect(within(dialog).getByText(FIRST)).toBeTruthy();
    expect(within(dialog).getByText(SECOND)).toBeTruthy();
    expect(within(dialog).getAllByRole("button", { name: "Remove signer" })).toHaveLength(2);
    expect(within(dialog).getByText("1 of 2")).toBeTruthy();
  });

  it("proposes an added signer with the approvals chosen", async () => {
    const dialog = await openSafe();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add signer" }));
    const propose = within(dialog).getByRole("button", { name: "Propose" });
    expect((propose as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("New signer"), {
      target: { value: NEWCOMER },
    });
    fireEvent.click(within(dialog).getByRole("radio", { name: "2 of 3" }));
    fireEvent.click(propose);
    expect(security.propose).toHaveBeenCalledWith(
      { kind: "addSigner", signer: NEWCOMER, threshold: 2 },
      expect.anything(),
    );
  });

  it("proposes a removal, and closes once the proposal is queued", async () => {
    security.report.mockReturnValue(true);
    security.propose.mockImplementation((_change, options: { onError: (error: unknown) => void }) =>
      options.onError(new Error("queued")),
    );
    const dialog = await openSafe();
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Remove signer" })[1]!);
    fireEvent.click(within(dialog).getByRole("button", { name: "Propose" }));
    expect(security.propose).toHaveBeenCalledWith(
      { kind: "removeSigner", signer: SECOND, threshold: 1 },
      expect.anything(),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("proposes a changed threshold", async () => {
    const dialog = await openSafe();
    fireEvent.click(within(dialog).getByRole("button", { name: "Change approvals required" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "2 of 2" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Propose" }));
    expect(security.propose).toHaveBeenCalledWith(
      { kind: "changeThreshold", threshold: 2 },
      expect.anything(),
    );
  });

  it("opens the Safe's queue from Multisig transactions", async () => {
    const { useSafeSheet } = await import("#/features/safe/state/safe-sheet");
    act(() => useSafeSheet.getState().close());
    const dialog = await openSafe();
    fireEvent.click(within(dialog).getByRole("button", { name: "Multisig transactions" }));
    expect(useSafeSheet.getState().safe).toBe(SAFE);
  });

  it("offers a retry when the signers cannot be read", async () => {
    security.signers = { data: undefined, isError: true, refetch: vi.fn() };
    const dialog = await openSafe();
    expect(within(dialog).getByRole("alert").textContent).toContain("could not be read");
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(security.signers.refetch).toHaveBeenCalled();
  });
});

describe("the sign-in card rows", () => {
  it("are left out while key rotation is off", async () => {
    await renderInShell(<SettingsDesk address={ADDRESS} />, "/?tab=settings");
    expect(screen.queryByRole("link", { name: "Replace sign-in card" })).toBeNull();
  });

  it("link to replacing the card and moving what is left on the last one", async () => {
    security.rotationEnabled = true;
    security.signInCard.latest = { oldAddress: SECOND };
    await renderInShell(<SettingsDesk address={ADDRESS} />, "/?tab=settings");
    expect(screen.getByRole("link", { name: "Replace sign-in card" }).getAttribute("href")).toBe(
      "/settings/sign-in-card",
    );
    expect(screen.getByRole("link", { name: "Move what's left" }).getAttribute("href")).toBe(
      `/settings/sign-in-card?from=${SECOND}`,
    );
  });

  it("finishes moving a passkey the new card has not registered", async () => {
    security.rotationEnabled = true;
    security.signInCard.canRelink = true;
    await renderInShell(<SettingsDesk address={ADDRESS} />, "/?tab=settings");
    expect(screen.getByText("Finish moving your passkey")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(security.signInCard.finishPasskeyMove).toHaveBeenCalled();
  });
});
