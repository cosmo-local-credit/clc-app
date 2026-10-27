import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  session: vi.fn().mockResolvedValue(null),
  isStorageAvailable: vi.fn(() => true),
  readDeviceId: vi.fn(async () => "device-1" as string | null),
  readConfig: vi.fn(),
  clearStores: vi.fn(async () => {}),
  unlinkWallet: vi.fn(async () => ({ linkedWalletAddresses: [] })),
  clearBadge: vi.fn(async () => {}),
  syncBadge: vi.fn(async () => {}),
}));

vi.mock("#/lib/api/auth", () => ({ authClient: { getSession: mocks.session } }));

vi.mock("../storage/notification-db", () => ({
  readNotificationConfig: mocks.readConfig,
  clearNotificationIdentityStores: mocks.clearStores,
  isNotificationStorageAvailable: mocks.isStorageAvailable,
  readNotificationDeviceId: mocks.readDeviceId,
}));

vi.mock("../api/notification-client", () => ({
  unlinkNotificationWallet: mocks.unlinkWallet,
}));
vi.mock("../realtime/app-badge", () => ({
  clearNavigatorAppBadge: mocks.clearBadge,
  syncNavigatorAppBadge: mocks.syncBadge,
}));

import { BackendApiError } from "@clc/api/client/errors";
import {
  resetNotificationIdentity,
  resetNotificationIdentityBarrierForTests,
  whenNotificationIdentitySettled,
} from "./identity-reset";

const ALICE = "0xa316408425cf17f1827483dee621c6c3a9b5fad4";

beforeEach(() => {
  resetNotificationIdentityBarrierForTests();
  mocks.session.mockResolvedValue(null);
  mocks.isStorageAvailable.mockReturnValue(true);
  mocks.readDeviceId.mockResolvedValue("device-1");
  mocks.readConfig.mockResolvedValue({
    registrationId: "registration-1",
    identityWallet: ALICE,
  });
  mocks.clearStores.mockClear();
  mocks.clearStores.mockResolvedValue(undefined);
  mocks.unlinkWallet.mockClear();
  mocks.unlinkWallet.mockResolvedValue({ linkedWalletAddresses: [] });
  mocks.clearBadge.mockClear();
  mocks.syncBadge.mockClear();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("resetNotificationIdentity", () => {
  it("clears the per-user stores and unlinks the outgoing wallet", async () => {
    await resetNotificationIdentity({ previousWalletAddress: ALICE });

    expect(mocks.clearStores).toHaveBeenCalledTimes(1);
    expect(mocks.unlinkWallet).toHaveBeenCalledWith(
      { deviceId: "device-1", registrationId: "registration-1", walletAddress: ALICE },
      undefined,
    );
  });

  it("does not unlink when the outgoing owner was a guest", async () => {
    mocks.readConfig.mockResolvedValue({ registrationId: "registration-1" });
    await resetNotificationIdentity({});

    expect(mocks.clearStores).toHaveBeenCalledTimes(1);
    expect(mocks.unlinkWallet).not.toHaveBeenCalled();
  });

  // It reacts to a boundary that has already happened, so it can neither undo
  // it nor be allowed to block it.
  it("does not reject when the unlink fails", async () => {
    mocks.unlinkWallet.mockRejectedValue(new Error("offline"));

    await expect(
      resetNotificationIdentity({ previousWalletAddress: ALICE }),
    ).resolves.toBeUndefined();
  });

  it("does not reject when clearing the stores fails", async () => {
    mocks.clearStores.mockRejectedValue(new Error("idb gone"));

    await expect(
      resetNotificationIdentity({ previousWalletAddress: ALICE }),
    ).resolves.toBeUndefined();
  });

  it("preserves another tab's inbox when a guest tab still has a live cookie session", async () => {
    mocks.session.mockResolvedValue({ address: "0xbbb" });
    await resetNotificationIdentity({ onlyIfSessionEnded: true });
    expect(mocks.clearStores).not.toHaveBeenCalled();
    expect(mocks.unlinkWallet).not.toHaveBeenCalled();
  });

  it("also preserves the inbox when session status cannot be verified", async () => {
    mocks.session.mockRejectedValue(new Error("offline"));

    await resetNotificationIdentity({ onlyIfSessionEnded: true });

    expect(mocks.clearStores).not.toHaveBeenCalled();
  });

  it("continues clearing after an explicit unauthenticated session response", async () => {
    mocks.session.mockRejectedValue(new BackendApiError(401, "Signed out"));

    await resetNotificationIdentity({ onlyIfSessionEnded: true });

    expect(mocks.clearStores).toHaveBeenCalledOnce();
  });

  it("clears persisted residue on a confirmed signed-out page load", async () => {
    await resetNotificationIdentity({ onlyIfSessionEnded: true });
    expect(mocks.clearStores).toHaveBeenCalledOnce();
  });

  it("skips everything when the store is unavailable", async () => {
    mocks.isStorageAvailable.mockReturnValue(false);

    await resetNotificationIdentity({ previousWalletAddress: ALICE });

    expect(mocks.clearStores).not.toHaveBeenCalled();
    expect(mocks.unlinkWallet).not.toHaveBeenCalled();
    expect(mocks.clearBadge).toHaveBeenCalledOnce();
  });

  it("ignores failed identity reads and clears local stores without unlinking", async () => {
    mocks.readDeviceId.mockRejectedValue(new Error("IndexedDB unavailable"));
    mocks.readConfig.mockRejectedValue(new Error("IndexedDB unavailable"));

    await resetNotificationIdentity({ previousWalletAddress: ALICE });

    expect(mocks.clearStores).toHaveBeenCalledWith(ALICE);
    expect(mocks.unlinkWallet).not.toHaveBeenCalled();
  });

  it("does not let a stale sign-out clear a newer wallet identity", async () => {
    mocks.readConfig.mockResolvedValue({
      registrationId: "registration-2",
      identityWallet: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });

    await resetNotificationIdentity({ previousWalletAddress: ALICE });

    expect(mocks.clearStores).not.toHaveBeenCalled();
    expect(mocks.unlinkWallet).not.toHaveBeenCalled();
  });

  it("synchronizes the badge after clearing and clears it when storage cleanup fails", async () => {
    await resetNotificationIdentity({ previousWalletAddress: ALICE });
    expect(mocks.syncBadge).toHaveBeenCalledOnce();

    mocks.clearStores.mockRejectedValue(new Error("IndexedDB unavailable"));
    await resetNotificationIdentity({ previousWalletAddress: ALICE });
    expect(mocks.clearBadge).toHaveBeenCalledOnce();
  });

  it("closes only service-worker notifications from the outgoing registration", async () => {
    const matching = { data: { registrationId: "registration-1" }, close: vi.fn() };
    const unrelated = { data: { registrationId: "registration-2" }, close: vi.fn() };
    const getRegistration = vi.fn(async () => ({
      getNotifications: vi.fn(async () => [matching, unrelated]),
    }));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration },
    });

    await resetNotificationIdentity({ previousWalletAddress: ALICE });
    await vi.waitFor(() => expect(matching.close).toHaveBeenCalledOnce());

    expect(unrelated.close).not.toHaveBeenCalled();
  });
});

describe("whenNotificationIdentitySettled", () => {
  it("is already settled before any reset", async () => {
    await expect(whenNotificationIdentitySettled()).resolves.toBeUndefined();
  });

  // The race this exists for: the recovery pass reads `syncCursor` and rewrites
  // it, so it must not start until teardown has finished clearing. Declaring the
  // teardown hook first orders only the starts, not the completions.
  it("does not resolve until an in-flight reset has finished clearing", async () => {
    // Built eagerly, so the release handle exists before the reset reaches the
    // mock — the reset awaits `readNotificationDeviceId` first, so a handle
    // captured inside the executor is still undefined at that point.
    let releaseClear: (() => void) | undefined;
    const clearing = new Promise<void>((resolve) => {
      releaseClear = resolve;
    });
    mocks.clearStores.mockImplementation(() => clearing);

    // Synchronous assignment, so the barrier is armed before a sibling effect
    // body runs — that is what makes declaration order sufficient to arm it.
    const reset = resetNotificationIdentity({ previousWalletAddress: ALICE });

    let settled = false;
    void whenNotificationIdentitySettled().then(() => {
      settled = true;
    });
    // Several turns, so this is not just observing a promise that had no chance
    // to settle: the reset is genuinely parked on the clear.
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    expect(settled).toBe(false);
    expect(mocks.clearStores).toHaveBeenCalledTimes(1);

    releaseClear?.();
    await reset;
    await whenNotificationIdentitySettled();
    expect(settled).toBe(true);
  });
});
