import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  resetNotificationIdentity,
  resetNotificationIdentityBarrierForTests,
} from "../recovery/identity-reset";
import {
  beginNotificationIdentity,
  incrementUnseenCount,
  isNotificationIdentityCurrent,
  readNotificationConfig,
  resetNotificationDatabaseForTests,
  updateNotificationConfig,
} from "../storage/notification-db";
import { handleNotificationPush, type NotificationServiceWorkerDependencies } from "../sw/handlers";
import { installAppBadgeSync, syncNavigatorAppBadge } from "./app-badge";

vi.mock("#/lib/api/auth", () => ({ authClient: { getSession: vi.fn() } }));
vi.mock("../api/notification-client", () => ({ unlinkNotificationWallet: vi.fn() }));

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";
const NOW = "2026-06-10T12:00:00Z";
const payload = {
  registrationId: "registration-1",
  deliveryExpiresAt: "2026-06-10T12:10:00Z",
  body: "You received a voucher.",
  createdAt: "2026-06-10T11:59:00Z",
  kind: "voucher.received",
  notificationId: "notification-1",
  priority: "high",
  targetUrl: "/wallet",
  title: "Voucher received",
  walletAddressTarget: WALLET,
};

let badge = 0;
let stopBadge: (() => void) | undefined;
const setBadge = vi.fn(async (count: number) => {
  badge = count;
});
const clearBadge = vi.fn(async () => {
  badge = 0;
});

beforeEach(async () => {
  await resetNotificationDatabaseForTests();
  resetNotificationIdentityBarrierForTests();
  vi.stubGlobal("indexedDB", new IDBFactory());
  badge = 0;
  setBadge.mockReset().mockImplementation(async (count) => {
    badge = count;
  });
  clearBadge.mockReset().mockImplementation(async () => {
    badge = 0;
  });
  Object.defineProperty(navigator, "setAppBadge", { configurable: true, value: setBadge });
  Object.defineProperty(navigator, "clearAppBadge", { configurable: true, value: clearBadge });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await beginNotificationIdentity(WALLET, "user-1");
  await updateNotificationConfig({ userId: "user-1", registrationId: "registration-1" });
});

afterEach(async () => {
  stopBadge?.();
  stopBadge = undefined;
  Reflect.deleteProperty(navigator, "setAppBadge");
  Reflect.deleteProperty(navigator, "clearAppBadge");
  await resetNotificationDatabaseForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("app badge races", () => {
  it.each([false, true])(
    "reconciles a push after sign-out (switch account: %s)",
    async (switchAccount) => {
      const setting = deferred();
      const release = deferred();
      setBadge.mockImplementationOnce(async (count) => {
        setting.resolve();
        await release.promise;
        badge = count;
      });
      const push = handleNotificationPush(payload, dependencies());
      try {
        await setting.promise;
        await resetNotificationIdentity({ previousWalletAddress: WALLET });
        if (switchAccount) {
          const next = await beginNotificationIdentity("0xbbb", "user-2");
          await incrementUnseenCount(next.identityEpoch);
          await incrementUnseenCount(next.identityEpoch);
          await syncNavigatorAppBadge();
        }
      } finally {
        release.resolve();
        await push;
      }

      expect((await readNotificationConfig())?.unseenCount).toBe(switchAccount ? 2 : 0);
      expect(badge).toBe(switchAccount ? 2 : 0);
    },
  );

  it("preserves a newer background push when an app-open clear finishes late", async () => {
    const identity = await readNotificationConfig();
    await incrementUnseenCount(identity!.identityEpoch!);
    badge = 1;
    const clearing = deferred();
    const cleared = deferred();
    const release = deferred();
    clearBadge.mockImplementationOnce(async () => {
      clearing.resolve();
      await release.promise;
      badge = 0;
      cleared.resolve();
    });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    stopBadge = installAppBadgeSync();
    try {
      await clearing.promise;
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      await handleNotificationPush(payload, dependencies());
    } finally {
      release.resolve();
      await cleared.promise;
    }

    expect((await readNotificationConfig())?.unseenCount).toBe(1);
    await vi.waitFor(() => expect(badge).toBe(1));
  });

  it("keeps both payments when native badge writes finish out of order", async () => {
    const setting = deferred();
    const release = deferred();
    setBadge.mockImplementationOnce(async (count) => {
      setting.resolve();
      await release.promise;
      badge = count;
    });
    const first = handleNotificationPush(payload, dependencies());
    try {
      await setting.promise;
      await handleNotificationPush(
        { ...payload, notificationId: "notification-2" },
        dependencies(),
      );
    } finally {
      release.resolve();
      await first;
    }

    expect((await readNotificationConfig())?.unseenCount).toBe(2);
    expect(badge).toBe(2);
  });
});

describe("optional badge APIs", () => {
  it("still delivers a push when the browser has no badge API", async () => {
    Reflect.deleteProperty(navigator, "setAppBadge");
    Reflect.deleteProperty(navigator, "clearAppBadge");

    await expect(handleNotificationPush(payload, dependencies())).resolves.toMatchObject({
      status: "displayed",
    });
    await expect(
      resetNotificationIdentity({ previousWalletAddress: WALLET }),
    ).resolves.toBeUndefined();
  });

  it("ignores rejected badge calls during delivery and sign-out", async () => {
    setBadge.mockRejectedValue(new Error("Badge blocked"));
    clearBadge.mockRejectedValue(new Error("Badge blocked"));

    await expect(handleNotificationPush(payload, dependencies())).resolves.toMatchObject({
      status: "displayed",
    });
    await expect(
      resetNotificationIdentity({ previousWalletAddress: WALLET }),
    ).resolves.toBeUndefined();
    expect((await readNotificationConfig())?.unseenCount).toBe(0);
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function dependencies(): NotificationServiceWorkerDependencies {
  const noop = async () => undefined;
  return {
    appOrigin: "https://app.cosmolocal.credit",
    broadcast: noop,
    enqueueAck: noop,
    flushQueuedAcks: noop,
    focusOrOpen: noop,
    getDeviceId: async () => "device-1",
    readConfig: readNotificationConfig,
    readDisplayState: async () => ({ message: null, deleted: false }),
    markInboxMessageShown: noop,
    dismissNotification: noop,
    isIdentityCurrent: isNotificationIdentityCurrent,
    markInboxMessageActioned: noop,
    markInboxMessageRead: noop,
    now: () => NOW,
    saveInboxMessage: noop,
    savePendingClickEvent: noop,
    sendClickAck: noop,
    sendDeliveryAck: noop,
    showNotification: noop,
    matchWindowClients: async () => [],
    incrementUnseenCount,
    syncAppBadge: syncNavigatorAppBadge,
  };
}
