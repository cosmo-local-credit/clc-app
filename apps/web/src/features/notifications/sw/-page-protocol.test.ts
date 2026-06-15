import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { NotificationPageMessage, NotificationWorkerMessage } from "./protocol";
import { initializeNotificationWorkerProtocol, NOTIFICATION_WORKER_EVENT } from "./page-protocol";

describe("initializeNotificationWorkerProtocol", () => {
  let dependencies: ReturnType<typeof createDependencies>;

  beforeEach(() => {
    dependencies = createDependencies();
  });

  it("discovers a compatible worker, persists its version, and consumes delayed clicks", async () => {
    dependencies.request.mockImplementation(
      async (_worker: ServiceWorker, message: NotificationPageMessage) => {
        if (message.type === "notification:check-compatibility") {
          return {
            compatible: true,
            protocolVersion: 1,
            requestId: message.requestId,
            type: "notification:compatibility-result",
          };
        }
        if (message.type === "notification:consume-delayed-clicks") {
          return {
            events: [
              {
                createdAt: "2026-06-11T12:00:00.000Z",
                eventId: "event-1",
                notificationId: "notification-1",
                targetUrl: "/wallet",
              },
            ],
            protocolVersion: 1,
            requestId: message.requestId,
            type: "notification:delayed-clicks",
          };
        }
        return {
          protocolVersion: 1,
          requestId: message.requestId,
          type: "notification:ack-queue-flushed",
        };
      },
    );

    await expect(initializeNotificationWorkerProtocol(dependencies)).resolves.toMatchObject({
      protocolVersion: 1,
      status: "ready",
    });

    expect(dependencies.updateConfig).toHaveBeenCalledWith({
      serviceWorkerVersion: "notifications-worker-v1",
      workerProtocolVersion: 1,
    });
    expect(dependencies.post).toHaveBeenCalledWith(
      dependencies.worker,
      expect.objectContaining({
        protocolVersion: 1,
        serviceWorkerVersion: "notifications-worker-v1",
        type: "notification:registration-state-updated",
      }),
    );
    expect(dependencies.dispatch).toHaveBeenCalledWith({
      event: "clicked",
      notificationId: "notification-1",
      protocolVersion: 1,
      targetUrl: "/wallet",
      type: "notification:event",
    });
  });

  it("does not send versioned messages to an incompatible worker", async () => {
    dependencies.request.mockResolvedValue({
      compatible: false,
      protocolVersion: 1,
      requestId: "request-1",
      type: "notification:compatibility-result",
    });

    await expect(initializeNotificationWorkerProtocol(dependencies)).resolves.toEqual({
      status: "incompatible",
    });

    expect(dependencies.post).not.toHaveBeenCalled();
    expect(dependencies.updateConfig).not.toHaveBeenCalled();
  });

  it("returns unavailable when no active worker exists", async () => {
    dependencies.getWorker.mockResolvedValue(null);

    await expect(initializeNotificationWorkerProtocol(dependencies)).resolves.toEqual({
      status: "unavailable",
    });
    expect(dependencies.request).not.toHaveBeenCalled();
  });

  it("validates live worker broadcasts before dispatching them", async () => {
    let listener: ((message: unknown) => void) | undefined;
    dependencies.subscribe.mockImplementation((nextListener: (message: unknown) => void) => {
      listener = nextListener;
      return vi.fn();
    });
    dependencies.request.mockImplementation(
      async (_worker: ServiceWorker, message: NotificationPageMessage) => {
        if (message.type === "notification:check-compatibility") {
          return {
            compatible: true,
            protocolVersion: 1,
            requestId: message.requestId,
            type: "notification:compatibility-result",
          };
        }
        if (message.type === "notification:consume-delayed-clicks") {
          return {
            events: [],
            protocolVersion: 1,
            requestId: message.requestId,
            type: "notification:delayed-clicks",
          };
        }
        return {
          protocolVersion: 1,
          requestId: message.requestId,
          type: "notification:ack-queue-flushed",
        };
      },
    );
    await initializeNotificationWorkerProtocol(dependencies);

    listener?.({
      event: "delivered",
      notificationId: "notification-1",
      protocolVersion: 1,
      type: "notification:event",
    });
    listener?.({
      notificationId: "notification-2",
      type: "notification:event",
    });

    expect(dependencies.dispatch).toHaveBeenCalledOnce();
    expect(NOTIFICATION_WORKER_EVENT).toBe("clc:notification-worker-event");
  });
});

function createDependencies() {
  const worker = {} as ServiceWorker;
  return {
    dispatch: vi.fn<(message: NotificationWorkerMessage) => void>(),
    getWorker: vi.fn().mockResolvedValue(worker),
    post: vi.fn(),
    request: vi.fn(),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
    updateConfig: vi.fn().mockResolvedValue({}),
    worker,
  };
}
