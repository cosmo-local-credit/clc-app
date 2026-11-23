import { render, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import type {
  NotificationActivityContext,
  NotificationActivitySource,
} from "../logic/activity-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { dismiss: vi.fn() }),
  readConfig: vi.fn(),
  current: vi.fn(),
  delivery: vi.fn(),
  enqueue: vi.fn(),
  flush: vi.fn(),
  cue: vi.fn(),
  readDevice: vi.fn(),
  display: vi.fn(),
  markRead: vi.fn(),
  assign: vi.fn(),
  save: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("./alert-cue", () => ({ playNotificationCue: mocks.cue }));
vi.mock("../api/notification-client", () => ({ sendNotificationDeliveryAck: mocks.delivery }));
vi.mock("../recovery/recovery", () => ({ flushQueuedNotificationAcks: mocks.flush }));
vi.mock("../storage/notification-db", () => ({
  readNotificationConfig: mocks.readConfig,
  readNotificationDeviceId: mocks.readDevice,
  isNotificationIdentityCurrent: mocks.current,
  enqueueNotificationAck: mocks.enqueue,
  markNotificationInboxMessageRead: mocks.markRead,
  markNotificationInboxMessageShown: vi.fn().mockResolvedValue(undefined),
  readNotificationDisplayState: mocks.display,
  saveNotificationInboxMessage: mocks.save,
}));
import { ForegroundNotificationContent, showForegroundNotification } from "./foreground-toast";

const payload = {
  notificationId: "n1",
  revision: 1,
  kind: "voucher.received",
  title: "Voucher received",
  body: "New voucher",
  createdAt: "2026-10-18T10:00:00Z",
  targetUrl: "/wallet",
  priority: "high",
  deliveryExpiresAt: "2026-10-18T11:00:00Z",
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-10-18T10:30:00Z"));
  mocks.readConfig.mockResolvedValue({
    identityEpoch: "epoch-1",
    identityWallet: "0xaaa",
    userId: "user-1",
    registrationId: "registration-1",
  });
  mocks.readDevice.mockResolvedValue("device-1");
  mocks.display.mockResolvedValue({ message: null, deleted: false });
  mocks.current.mockResolvedValue(true);
  mocks.delivery.mockResolvedValue({ accepted: true });
  mocks.enqueue.mockResolvedValue(undefined);
  mocks.markRead.mockResolvedValue(undefined);
  mocks.flush.mockResolvedValue(undefined);
  mocks.save.mockResolvedValue(undefined);
  vi.stubGlobal("location", { origin: "http://localhost:3000", assign: mocks.assign });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});

function activity(initial: NotificationActivityContext) {
  let context = initial;
  const listeners = new Set<() => void>();
  const unsubscribe = vi.fn();
  const source: NotificationActivitySource = {
    current: () => context,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    },
  };
  return {
    source,
    unsubscribe,
    navigate: (next: NotificationActivityContext) => {
      context = next;
      for (const listener of listeners) listener();
    },
  };
}

function toastContent() {
  return mocks.toast.mock.calls.at(-1)?.[0] as ReactElement<{ onShown: () => void }>;
}

describe("alerts while viewing their Activity destination", () => {
  it("abandons a pending notification when its authenticated identity is no longer current", async () => {
    mocks.current.mockResolvedValueOnce(false);
    const dismiss = await showForegroundNotification(
      payload,
      "epoch-1",
      "user-1",
      undefined,
      activity({ section: "transactions" }).source,
    );
    dismiss();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.delivery).not.toHaveBeenCalled();
  });

  it("handles navigation during the final asynchronous ownership check before creating the toast", async () => {
    const route = activity(null);
    mocks.current
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(async () => {
        route.navigate({ section: "transactions" });
        return true;
      });
    await showForegroundNotification(payload, "epoch-1", "user-1", undefined, route.source);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.delivery).toHaveBeenCalledOnce();
    expect(mocks.delivery.mock.calls[0]?.[0]).toHaveProperty("handledInApp", true);
    expect(mocks.cue).not.toHaveBeenCalled();
  });

  it("handles an incoming event silently without changing its read/display state", async () => {
    const route = activity({ section: "transactions" });
    await showForegroundNotification(payload, "epoch-1", "user-1", undefined, route.source);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.cue).not.toHaveBeenCalled();
    expect(mocks.markRead).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ handledInAppAt: expect.any(String) }),
      "epoch-1",
    );
    expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty("shownAt");
    expect(mocks.delivery).toHaveBeenCalledWith(expect.objectContaining({ handledInApp: true }), {
      identityEpoch: "epoch-1",
    });
    expect(mocks.delivery.mock.calls[0]?.[0]).not.toHaveProperty("shownAt");
    route.navigate(null);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(route.unsubscribe).toHaveBeenCalled();
  });

  it("continues alerting for a different Activity section and outside Activity", async () => {
    for (const context of [{ section: "messages" } as const, null]) {
      const route = activity(context);
      const dismiss = await showForegroundNotification(
        payload,
        "epoch-1",
        "user-1",
        undefined,
        route.source,
      );
      toastContent().props.onShown();
      await waitFor(() => expect(mocks.delivery).toHaveBeenCalledTimes(context ? 1 : 2));
      expect(mocks.delivery.mock.calls.at(-1)?.[0]).not.toHaveProperty("handledInApp");
      dismiss();
    }
    expect(mocks.cue).toHaveBeenCalledTimes(2);
  });

  it("dismisses only this incoming toast when navigation reaches its section before display", async () => {
    const route = activity(null);
    await showForegroundNotification(payload, "epoch-1", "user-1", undefined, route.source);
    route.navigate({ section: "messages" });
    expect(mocks.toast.dismiss).not.toHaveBeenCalled();
    route.navigate({ section: "transactions" });
    toastContent().props.onShown();
    await waitFor(() => expect(mocks.delivery).toHaveBeenCalledOnce());
    expect(mocks.toast.dismiss).toHaveBeenCalledWith("clc:epoch-1:n1");
    expect(mocks.cue).not.toHaveBeenCalled();
    expect(mocks.delivery.mock.calls[0]?.[0]).toHaveProperty("handledInApp", true);
    route.navigate(null);
    expect(mocks.toast).toHaveBeenCalledOnce();
  });

  it("dismisses an already shown incoming toast without sending a second receipt", async () => {
    const route = activity(null);
    await showForegroundNotification(payload, "epoch-1", "user-1", undefined, route.source);
    toastContent().props.onShown();
    await waitFor(() => expect(mocks.delivery).toHaveBeenCalledOnce());
    route.navigate({ section: "transactions" });
    expect(mocks.toast.dismiss).toHaveBeenCalledWith("clc:epoch-1:n1");
    expect(mocks.delivery).toHaveBeenCalledOnce();
  });

  it("queues a failed or unaccepted quiet receipt with its identity for recovery", async () => {
    for (const result of [new Error("offline"), { accepted: false }]) {
      if (result instanceof Error) mocks.delivery.mockRejectedValueOnce(result);
      else mocks.delivery.mockResolvedValueOnce(result);
      await showForegroundNotification(
        payload,
        "epoch-1",
        "user-1",
        undefined,
        activity({ section: "transactions" }).source,
      );
    }
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        identityEpoch: "epoch-1",
        registrationId: "registration-1",
        kind: "delivery",
        payload: expect.objectContaining({ handledInApp: true }),
      }),
    );
    expect(mocks.cue).not.toHaveBeenCalled();
  });

  it("rechecks the live destination after an asynchronous inbox read", async () => {
    const route = activity(null);
    mocks.display.mockImplementationOnce(async () => {
      route.navigate({ section: "transactions" });
      return { message: null, deleted: false };
    });
    await showForegroundNotification(payload, "epoch-1", "user-1", undefined, route.source);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.delivery.mock.calls[0]?.[0]).toHaveProperty("handledInApp", true);
  });

  it("does not replay a previously handled event, or suppress a background event", async () => {
    mocks.display.mockResolvedValueOnce({
      message: { ...payload, handledInAppAt: "2026-10-18T10:20:00Z" },
      deleted: false,
    });
    await showForegroundNotification(
      payload,
      "epoch-1",
      "user-1",
      undefined,
      activity(null).source,
    );
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await showForegroundNotification(
      payload,
      "epoch-1",
      "user-1",
      undefined,
      activity({ section: "transactions" }).source,
    );
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.delivery).not.toHaveBeenCalled();
  });

  it("keeps background delivery available when the page hides before handling", async () => {
    const route = activity(null);
    const dismiss = await showForegroundNotification(
      payload,
      "epoch-1",
      "user-1",
      undefined,
      route.source,
    );
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    route.navigate({ section: "transactions" });
    toastContent().props.onShown();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.delivery).not.toHaveBeenCalled();
    dismiss();
    expect(route.unsubscribe).toHaveBeenCalled();
  });
});

describe("foreground notification display receipts", () => {
  it("waits until Sonner marks the mounted toast visible before acknowledging display", async () => {
    const dismiss = await showForegroundNotification(payload, "epoch-1", "user-1");
    expect(mocks.delivery).not.toHaveBeenCalled();
    const content = mocks.toast.mock.calls[0]?.[0] as ReactElement;
    const view = render(
      <div data-sonner-toast="" data-mounted="true" data-visible="false">
        {content}
      </div>,
    );
    await Promise.resolve();
    expect(mocks.delivery).not.toHaveBeenCalled();
    const container = view.container.firstElementChild as HTMLElement;
    container.dataset.visible = "true";
    await waitFor(() => expect(mocks.delivery).toHaveBeenCalledOnce());
    expect(mocks.cue).toHaveBeenCalledOnce();
    expect(mocks.cue.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.delivery.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.delivery).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId: "registration-1",
        deviceId: "device-1",
        notificationId: "n1",
        shownAt: expect.any(String),
      }),
      { identityEpoch: "epoch-1" },
    );
    dismiss();
    expect(mocks.toast.dismiss).toHaveBeenCalledOnce();
  });
  it("ignores expired, hidden, or outgoing-account publications", async () => {
    await showForegroundNotification(
      { ...payload, deliveryExpiresAt: "2026-10-18T10:00:00Z" },
      "epoch-1",
      "user-1",
    );
    await showForegroundNotification(payload, "outgoing-epoch", "user-1");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await showForegroundNotification(payload, "epoch-1", "user-1");
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.delivery).not.toHaveBeenCalled();
    expect(mocks.cue).not.toHaveBeenCalled();
  });
  it("does not acknowledge a toast whose owner changed before rendering", async () => {
    await showForegroundNotification(payload, "epoch-1", "user-1");
    mocks.current.mockResolvedValue(false);
    const content = mocks.toast.mock.calls[0]?.[0] as ReactElement;
    render(
      <div data-sonner-toast="" data-mounted="true" data-visible="true">
        {content}
      </div>,
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(mocks.delivery).not.toHaveBeenCalled();
    expect(mocks.cue).not.toHaveBeenCalled();
  });
  it("does not acknowledge an unmounted toast", () => {
    const onShown = vi.fn();
    const { unmount } = render(
      <div data-sonner-toast="" data-mounted="true" data-visible="true">
        <ForegroundNotificationContent payload={payload} onShown={onShown} onClick={() => {}} />
      </div>,
    );
    unmount();
    expect(onShown).not.toHaveBeenCalled();
  });

  it("rejects another wallet, an incomplete registration, and an already displayed message", async () => {
    await showForegroundNotification(
      { ...payload, walletAddressTarget: "0xbbb" },
      "epoch-1",
      "user-1",
    );
    mocks.readDevice.mockResolvedValueOnce(null);
    await showForegroundNotification(payload, "epoch-1", "user-1");
    mocks.display.mockResolvedValueOnce({
      deleted: false,
      message: { ...payload, readAt: "2026-10-18T10:10:00Z" },
    });
    await showForegroundNotification(payload, "epoch-1", "user-1");

    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("queues a failed display receipt and processes a click before navigation", async () => {
    mocks.delivery.mockRejectedValueOnce(new Error("offline"));
    await showForegroundNotification(payload, "epoch-1", "user-1");
    const content = mocks.toast.mock.calls[0]?.[0] as ReactElement<{
      onClick: (event: { preventDefault: () => void }) => void;
      onShown: () => void;
    }>;

    content.props.onShown();
    await waitFor(() =>
      expect(mocks.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Error: offline", kind: "delivery" }),
      ),
    );

    const preventDefault = vi.fn();
    content.props.onClick({ preventDefault });
    await waitFor(() => expect(mocks.markRead).toHaveBeenCalledOnce());
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: "click" }));
    expect(mocks.flush).toHaveBeenCalledOnce();
    expect(mocks.toast.dismiss).toHaveBeenCalledWith("clc:epoch-1:n1");
    expect(mocks.assign).toHaveBeenCalledWith("/wallet");
  });

  it("does not display or act after Sonner dismisses or auto-closes the toast", async () => {
    await showForegroundNotification(payload, "epoch-1", "user-1");
    const [content, options] = mocks.toast.mock.calls[0] as [
      ReactElement<{
        onClick: (event: { preventDefault: () => void }) => void;
        onShown: () => void;
      }>,
      { onAutoClose: () => void; onDismiss: () => void },
    ];
    options.onDismiss();
    options.onAutoClose();
    content.props.onShown();
    content.props.onClick({ preventDefault: vi.fn() });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.delivery).not.toHaveBeenCalled();
    expect(mocks.markRead).not.toHaveBeenCalled();
  });
});
