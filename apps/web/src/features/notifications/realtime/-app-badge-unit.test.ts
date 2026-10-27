import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  readConfig: vi.fn(),
  resetUnseen: vi.fn(),
}));

vi.mock("../storage/notification-db", () => ({
  readNotificationConfig: mocks.readConfig,
  resetUnseenCount: mocks.resetUnseen,
}));

import { clearNavigatorAppBadge, installAppBadgeSync } from "./app-badge";

const clearBadge = vi.fn(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readConfig.mockResolvedValue({ identityEpoch: "epoch-1", unseenCount: 0 });
  mocks.resetUnseen.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clearAppBadge", {
    configurable: true,
    value: clearBadge,
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "clearAppBadge");
  Reflect.deleteProperty(navigator, "setAppBadge");
  Reflect.deleteProperty(navigator, "serviceWorker");
  vi.restoreAllMocks();
});

describe("app badge browser integration", () => {
  it("clears a supported badge and ignores a rejected native call", async () => {
    await expect(clearNavigatorAppBadge()).resolves.toBeUndefined();
    expect(clearBadge).toHaveBeenCalledOnce();

    clearBadge.mockRejectedValueOnce(new Error("Badge permission denied"));
    await expect(clearNavigatorAppBadge()).resolves.toBeUndefined();
  });

  it("falls back to the native clear when stored badge state cannot be read", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    mocks.readConfig.mockRejectedValueOnce(new Error("IndexedDB unavailable"));

    const stop = installAppBadgeSync();
    await vi.waitFor(() => expect(clearBadge).toHaveBeenCalledOnce());
    stop();
  });

  it("reacts only to badge messages while visible and removes worker listeners", async () => {
    let visible = false;
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
      visible ? "visible" : "hidden",
    );
    const worker = new EventTarget();
    const remove = vi.spyOn(worker, "removeEventListener");
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: worker,
    });
    const stop = installAppBadgeSync();

    worker.dispatchEvent(new MessageEvent("message", { data: { type: "other" } }));
    expect(mocks.resetUnseen).not.toHaveBeenCalled();

    visible = true;
    worker.dispatchEvent(new MessageEvent("message", { data: { type: "notification:badge" } }));
    await vi.waitFor(() => expect(mocks.resetUnseen).toHaveBeenCalledWith("epoch-1"));

    stop();
    expect(remove).toHaveBeenCalledWith("message", expect.any(Function));
  });
});
