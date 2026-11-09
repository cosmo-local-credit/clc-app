import { NOTIFICATION_KINDS, type NotificationKind } from "./payload-schema";

/**
 * The kinds this page declares to the notification service, or undefined to
 * declare nothing and get the v1 set.
 *
 * A kind is declared only once the active worker says it parses it too: the
 * service pushes declared kinds to the device, and a worker from an older build
 * would drop them. `workerKinds` is written by the worker itself, so it is absent
 * until this build's worker (or a later one) is active.
 */
export function declaredNotificationKinds(
  config: { workerKinds?: readonly string[] } | null | undefined,
): NotificationKind[] | undefined {
  const workerKinds = config?.workerKinds;
  if (!workerKinds) return undefined;
  return NOTIFICATION_KINDS.filter((kind) => workerKinds.includes(kind));
}

export function sameDeclaredKinds(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((kind) => right.includes(kind));
}
