import { fireEvent, render, screen } from "@testing-library/react";
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

describe("NotificationSettingsSection", () => {
  it("loads status without enabling notifications", async () => {
    render(<NotificationSettingsSection />);

    expect(await screen.findByText(/notifications are off/i)).toBeTruthy();
    expect(coordinator.readSnapshot).toHaveBeenCalledOnce();
    expect(coordinator.enable).not.toHaveBeenCalled();
  });

  it("enables notifications only from the button and passes the wallet address", async () => {
    coordinator.enable.mockResolvedValue({
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
    });

    render(
      <NotificationSettingsSection walletAddress="0x1234567890abcdef1234567890abcdef12345678" />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /enable notifications/i }));

    expect(coordinator.enable).toHaveBeenCalledWith({
      currentWalletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    });
    expect(await screen.findByText(/notifications are enabled/i)).toBeTruthy();
  });

  it("shows enabled when permission and a current subscription exist", async () => {
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

    expect(await screen.findByText(/notifications are enabled/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /enable notifications/i })).toBeNull();
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

    expect(await screen.findByText(/install the app first/i)).toBeTruthy();
    expect(screen.getByText(/home screen/i)).toBeTruthy();
  });

  it("shows browser-settings guidance when permission is denied", async () => {
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

    expect(await screen.findByText(/notification permission denied/i)).toBeTruthy();
    expect(screen.getByText(/browser or device settings/i)).toBeTruthy();
  });

  it("allows retry after backend registration failure", async () => {
    coordinator.enable.mockResolvedValue({
      capability: supportedCapability,
      deviceId: "device-1",
      message: "Backend unavailable",
      status: "failed",
    });

    render(<NotificationSettingsSection />);

    fireEvent.click(await screen.findByRole("button", { name: /enable notifications/i }));

    expect(await screen.findByText("Backend unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: /enable notifications/i })).toBeTruthy();
  });
});
