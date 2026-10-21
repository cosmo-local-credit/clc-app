import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const coordinator = vi.hoisted(() => ({
  enable: vi.fn(),
  readSnapshot: vi.fn(),
}));

vi.mock("#/features/notifications/subscription/coordinator", () => ({
  enableNotificationSubscription: coordinator.enable,
  readNotificationSubscriptionSnapshot: coordinator.readSnapshot,
}));

const { NotificationSettingsSection } = await import("./notification-settings-section");

const supportedCapability = {
  canRequestPermission: true,
  canSubscribe: false,
  hasNotification: true,
  hasPushManager: true,
  hasServiceWorker: true,
  isSecureContext: true,
  permission: "default",
  platform: "chrome-android",
  reasons: [],
  status: "supported",
} as const;

beforeEach(() => {
  coordinator.enable.mockReset();
  coordinator.readSnapshot.mockReset();
  coordinator.readSnapshot.mockResolvedValue({
    capability: supportedCapability,
    config: null,
    storageAvailable: true,
    subscription: null,
  });
});

const enabledResult = {
  capability: { ...supportedCapability, canRequestPermission: false, canSubscribe: true },
  config: {
    key: "current",
    permissionState: "granted",
    updatedAt: "2026-06-11T12:00:00.000Z",
  },
  deviceId: "device-1",
  registerResponse: {
    canonicalLinkedWalletAddresses: [],
    deviceId: "device-1",
    inboxSyncCursor: "cursor-1",
    notificationSettings: { enabled: true },
    status: "registered",
    subscriptionStatus: "active",
  },
  status: "enabled",
  subscription: {
    endpoint: "https://push.example/subscription",
    expirationTime: null,
    keys: { auth: "auth", p256dh: "p256dh" },
  },
  subscriptionHash: "hash",
  subscriptionWasReused: false,
  vapid: { keyVersion: "v1", publicKey: "public-key" },
};

async function openRow(value: string) {
  fireEvent.click(
    await screen.findByRole("button", { name: new RegExp(`notifications.*${value}`, "i") }),
  );
  return screen.findByRole("dialog");
}

const WALLET = "0x1234567890abcdef1234567890abcdef12345678" as const;

describe("NotificationSettingsSection", () => {
  it("shows Checking… on a static row while the status loads", () => {
    coordinator.readSnapshot.mockReturnValue(new Promise(() => {}));
    render(<NotificationSettingsSection />);

    expect(screen.getByText("Checking…")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("loads status without enabling notifications", async () => {
    render(<NotificationSettingsSection />);

    const sheet = within(await openRow("off"));
    expect(sheet.getByRole("heading", { name: /notifications are off/i })).toBeTruthy();
    expect(coordinator.readSnapshot).toHaveBeenCalledOnce();
    expect(coordinator.enable).not.toHaveBeenCalled();
  });

  it("enables notifications only from the outline button, passes the wallet address and closes on success", async () => {
    coordinator.enable.mockResolvedValue(enabledResult);

    render(<NotificationSettingsSection walletAddress={WALLET} />);

    const sheet = within(await openRow("off"));
    const enable = sheet.getByRole("button", { name: /enable notifications/i });
    expect(enable.dataset.variant).toBe("outline");
    fireEvent.click(enable);

    expect(coordinator.enable).toHaveBeenCalledWith({
      currentWalletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("On").className).toContain("text-primary");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows On on a static row when permission and a current subscription exist", async () => {
    coordinator.readSnapshot.mockResolvedValue({
      capability: {
        ...supportedCapability,
        canRequestPermission: false,
        canSubscribe: true,
        permission: "granted",
      },
      config: null,
      storageAvailable: true,
      subscription: {
        endpoint: "https://push.example/subscription",
        expirationTime: null,
        keys: { auth: "auth", p256dh: "p256dh" },
      },
    });

    render(<NotificationSettingsSection />);

    expect(await screen.findByText("On")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows install guidance for an iOS Safari tab", async () => {
    coordinator.readSnapshot.mockResolvedValue({
      capability: {
        ...supportedCapability,
        canRequestPermission: false,
        platform: "ios-safari-tab",
        reasons: ["ios-safari-tab"],
        status: "install-required",
      },
      config: null,
      storageAvailable: true,
      subscription: null,
    });

    render(<NotificationSettingsSection />);

    const sheet = within(await openRow("off"));
    expect(sheet.getByRole("heading", { name: /install the app first/i })).toBeTruthy();
    expect(sheet.getByText(/home screen/i)).toBeTruthy();
    expect(sheet.queryByRole("button", { name: /enable notifications/i })).toBeNull();
  });

  it("shows Blocked and browser-settings guidance when permission is denied", async () => {
    coordinator.readSnapshot.mockResolvedValue({
      capability: {
        ...supportedCapability,
        canRequestPermission: false,
        permission: "denied",
      },
      config: null,
      storageAvailable: true,
      subscription: null,
    });

    render(<NotificationSettingsSection />);

    const sheet = within(await openRow("blocked"));
    expect(sheet.getByRole("heading", { name: /notification permission denied/i })).toBeTruthy();
    expect(sheet.getByText(/browser or device settings/i)).toBeTruthy();
  });

  it("shows Unavailable on a browser that cannot subscribe", async () => {
    coordinator.readSnapshot.mockResolvedValue({
      capability: { ...supportedCapability, status: "unsupported" },
      config: null,
      storageAvailable: true,
      subscription: null,
    });

    render(<NotificationSettingsSection />);

    const sheet = within(await openRow("unavailable"));
    expect(sheet.getByText(/require chrome on android/i)).toBeTruthy();
  });

  it("allows retry after backend registration failure, with the reason as an alert", async () => {
    coordinator.enable.mockResolvedValue({
      capability: supportedCapability,
      deviceId: "device-1",
      message: "Backend unavailable",
      status: "failed",
    });

    render(<NotificationSettingsSection />);

    const sheet = within(await openRow("off"));
    fireEvent.click(sheet.getByRole("button", { name: /enable notifications/i }));

    expect((await sheet.findByRole("alert")).textContent).toBe("Backend unavailable");
    expect(sheet.getByRole("button", { name: /enable notifications/i })).toBeTruthy();
  });

  it("shows Sound while push is off, and Vibration only when the device can vibrate", async () => {
    render(<NotificationSettingsSection walletAddress={WALLET} />);

    expect(await screen.findByRole("switch", { name: "Sound" })).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Vibration" })).toBeNull();

    Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => true });
    render(<NotificationSettingsSection walletAddress={WALLET} />);
    expect(await screen.findByRole("switch", { name: "Vibration" })).toBeTruthy();
    Reflect.deleteProperty(navigator, "vibrate");
  });
});
