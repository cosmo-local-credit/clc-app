import { updateNotificationConfig } from "../storage/notification-db";
import {
  NOTIFICATION_SERVICE_WORKER_VERSION,
  NOTIFICATION_WORKER_PROTOCOL_VERSION,
  type NotificationPageMessage,
  notificationWorkerMessageSchema,
  type NotificationWorkerMessage,
} from "./protocol";

const REQUEST_TIMEOUT_MS = 5_000;

export const NOTIFICATION_WORKER_EVENT = "clc:notification-worker-event";

export type NotificationPageProtocolResult =
  | {
      dispose: () => void;
      protocolVersion: number;
      status: "ready";
    }
  | {
      status: "incompatible" | "unavailable";
    };

type NotificationPageProtocolDependencies = {
  dispatch: (message: NotificationWorkerMessage) => void;
  getWorker: () => Promise<ServiceWorker | null>;
  post: (worker: ServiceWorker, message: NotificationPageMessage) => void;
  request: (
    worker: ServiceWorker,
    message: NotificationPageMessage,
  ) => Promise<NotificationWorkerMessage>;
  subscribe: (listener: (message: unknown) => void) => () => void;
  updateConfig: typeof updateNotificationConfig;
};

export async function initializeNotificationWorkerProtocol(
  dependencies: NotificationPageProtocolDependencies = createDependencies(),
): Promise<NotificationPageProtocolResult> {
  const worker = await dependencies.getWorker();
  if (!worker) {
    return { status: "unavailable" };
  }

  const compatibility = await dependencies.request(worker, {
    requestId: createRequestId(),
    supportedProtocolVersions: [NOTIFICATION_WORKER_PROTOCOL_VERSION],
    type: "notification:check-compatibility",
  });
  if (compatibility.type !== "notification:compatibility-result" || !compatibility.compatible) {
    return { status: "incompatible" };
  }

  const dispose = dependencies.subscribe((rawMessage) => {
    const result = notificationWorkerMessageSchema.safeParse(rawMessage);
    if (result.success && result.data.type === "notification:event") {
      dependencies.dispatch(result.data);
    }
  });

  await dependencies
    .updateConfig({
      serviceWorkerVersion: NOTIFICATION_SERVICE_WORKER_VERSION,
      workerProtocolVersion: compatibility.protocolVersion,
    })
    .catch(() => undefined);
  dependencies.post(worker, {
    protocolVersion: NOTIFICATION_WORKER_PROTOCOL_VERSION,
    requestId: createRequestId(),
    serviceWorkerVersion: NOTIFICATION_SERVICE_WORKER_VERSION,
    type: "notification:registration-state-updated",
  });

  const [, delayedClicks] = await Promise.allSettled([
    dependencies.request(worker, {
      protocolVersion: NOTIFICATION_WORKER_PROTOCOL_VERSION,
      requestId: createRequestId(),
      type: "notification:flush-ack-queue",
    }),
    dependencies.request(worker, {
      protocolVersion: NOTIFICATION_WORKER_PROTOCOL_VERSION,
      requestId: createRequestId(),
      type: "notification:consume-delayed-clicks",
    }),
  ]);

  if (
    delayedClicks.status === "fulfilled" &&
    delayedClicks.value.type === "notification:delayed-clicks"
  ) {
    for (const event of delayedClicks.value.events) {
      dependencies.dispatch({
        event: "clicked",
        notificationId: event.notificationId,
        protocolVersion: NOTIFICATION_WORKER_PROTOCOL_VERSION,
        targetUrl: event.targetUrl,
        type: "notification:event",
      });
    }
  }

  return {
    dispose,
    protocolVersion: compatibility.protocolVersion,
    status: "ready",
  };
}

function createDependencies(): NotificationPageProtocolDependencies {
  return {
    dispatch: (message) => {
      window.dispatchEvent(
        new CustomEvent<NotificationWorkerMessage>(NOTIFICATION_WORKER_EVENT, {
          detail: message,
        }),
      );
    },
    getWorker: async () => {
      if (!("serviceWorker" in navigator)) {
        return null;
      }
      const registration = await navigator.serviceWorker.ready;
      return registration.active;
    },
    post: (worker, message) => worker.postMessage(message),
    request: requestWorker,
    subscribe: (listener) => {
      const handleMessage = (event: MessageEvent<unknown>) => listener(event.data);
      navigator.serviceWorker.addEventListener("message", handleMessage);
      return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
    },
    updateConfig: updateNotificationConfig,
  };
}

async function requestWorker(
  worker: ServiceWorker,
  message: NotificationPageMessage,
): Promise<NotificationWorkerMessage> {
  const channel = new MessageChannel();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error(`Timed out waiting for ${message.type}.`));
    }, REQUEST_TIMEOUT_MS);

    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const result = notificationWorkerMessageSchema.safeParse(event.data);
      if (
        !result.success ||
        !("requestId" in result.data) ||
        result.data.requestId !== message.requestId
      ) {
        return;
      }

      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(result.data);
    };

    worker.postMessage(message, [channel.port2]);
  });
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
