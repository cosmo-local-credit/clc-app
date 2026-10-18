import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  session: vi.fn().mockResolvedValue(null),
  isStorageAvailable: vi.fn(() => true),
  readDeviceId: vi.fn(async () => "device-1" as string | null),
  clearStores: vi.fn(async () => {}),
  unlinkWallet: vi.fn(async () => ({ linkedWalletAddresses: [] })),
}));

vi.mock("#/lib/api/auth", () => ({ authClient: { getSession: mocks.session } }));

vi.mock("../storage/notification-db", () => ({
  readNotificationConfig: vi.fn().mockResolvedValue({ registrationId: "registration-1" }),
  clearNotificationIdentityStores: mocks.clearStores,
  isNotificationStorageAvailable: mocks.isStorageAvailable,
  readNotificationDeviceId: mocks.readDeviceId,
}));

vi.mock("../api/notification-client", () => ({
  unlinkNotificationWallet: mocks.unlinkWallet,
}));

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
  mocks.clearStores.mockClear();
  mocks.clearStores.mockResolvedValue(undefined);
  mocks.unlinkWallet.mockClear();
  mocks.unlinkWallet.mockResolvedValue({ linkedWalletAddresses: [] });
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

  it("clears persisted residue on a confirmed signed-out page load", async () => {
    await resetNotificationIdentity({ onlyIfSessionEnded: true });
    expect(mocks.clearStores).toHaveBeenCalledOnce();
  });

  it("skips everything when the store is unavailable", async () => {
    mocks.isStorageAvailable.mockReturnValue(false);

    await resetNotificationIdentity({ previousWalletAddress: ALICE });

    expect(mocks.clearStores).not.toHaveBeenCalled();
    expect(mocks.unlinkWallet).not.toHaveBeenCalled();
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
