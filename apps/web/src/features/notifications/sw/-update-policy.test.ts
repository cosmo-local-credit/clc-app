import { describe, expect, it, vi } from "vite-plus/test";
import {
  initializeServiceWorkerUpdatePolicy,
  SERVICE_WORKER_UPDATE_INTERVAL_MS,
} from "./update-policy";

describe("initializeServiceWorkerUpdatePolicy", () => {
  it("registers the stable worker URL without consulting HTTP caches", async () => {
    const registration = { update: vi.fn() } as unknown as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registration);
    const createRegistrar = vi.fn(() => ({ register }));

    await initializeServiceWorkerUpdatePolicy({
      createRegistrar,
      documentTarget: new EventTarget(),
      windowTarget: new EventTarget(),
    });

    expect(createRegistrar).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      type: "module",
      updateViaCache: "none",
    });
    expect(register).toHaveBeenCalledOnce();
  });

  it("checks for an update when a long-running app becomes active", async () => {
    let now = 1_000;
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    const update = vi.fn().mockResolvedValue(undefined);

    const handle = await initializeServiceWorkerUpdatePolicy({
      createRegistrar: () => ({
        register: vi.fn().mockResolvedValue({ update } as unknown as ServiceWorkerRegistration),
      }),
      documentTarget,
      isDocumentVisible: () => true,
      now: () => now,
      windowTarget,
    });

    windowTarget.dispatchEvent(new Event("focus"));
    expect(update).not.toHaveBeenCalled();

    now += SERVICE_WORKER_UPDATE_INTERVAL_MS;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledOnce();

    handle.dispose();
    now += SERVICE_WORKER_UPDATE_INTERVAL_MS;
    windowTarget.dispatchEvent(new Event("focus"));
    expect(update).toHaveBeenCalledOnce();
  });

  it("does not check while the document is hidden", async () => {
    const documentTarget = new EventTarget();
    const update = vi.fn().mockResolvedValue(undefined);

    await initializeServiceWorkerUpdatePolicy({
      createRegistrar: () => ({
        register: vi.fn().mockResolvedValue({ update } as unknown as ServiceWorkerRegistration),
      }),
      documentTarget,
      isDocumentVisible: () => false,
      now: () => SERVICE_WORKER_UPDATE_INTERVAL_MS,
      windowTarget: new EventTarget(),
    });

    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(update).not.toHaveBeenCalled();
  });

  it("reports update failures without rejecting an event handler", async () => {
    let now = 0;
    const onUpdateError = vi.fn();
    const windowTarget = new EventTarget();
    const error = new Error("offline");

    await initializeServiceWorkerUpdatePolicy({
      createRegistrar: () => ({
        register: vi.fn().mockResolvedValue({
          update: vi.fn().mockRejectedValue(error),
        } as unknown as ServiceWorkerRegistration),
      }),
      documentTarget: new EventTarget(),
      isDocumentVisible: () => true,
      now: () => now,
      onUpdateError,
      windowTarget,
    });

    now = SERVICE_WORKER_UPDATE_INTERVAL_MS;
    windowTarget.dispatchEvent(new Event("focus"));
    await Promise.resolve();

    expect(onUpdateError).toHaveBeenCalledWith(error);
  });
});
