import { NOTIFICATION_KINDS, type NotificationKind } from "./payload-schema";

/**
 * The kinds this page declares to the notification service, or undefined to
 * declare nothing and get the v1 set.
 *
 * The full set is declared only once this build's own worker is active, which
 * is when the kinds the worker recorded (`workerKinds`, written by the worker
 * itself) are exactly this page's. Every call replaces the device's stored set,
 * and the worker's `refresh-subscription` declares its own set, so a page and a
 * worker from different builds declaring different sets would reset the inbox
 * back and forth. An empty list would mean "no notifications", so it is never
 * sent.
 */
export function declaredNotificationKinds(
  config: { workerKinds?: readonly string[] } | null | undefined,
): NotificationKind[] | undefined {
  const workerKinds = config?.workerKinds;
  if (!workerKinds || !sameDeclaredKinds(workerKinds, NOTIFICATION_KINDS)) return undefined;
  return [...NOTIFICATION_KINDS];
}

export function sameDeclaredKinds(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((kind) => right.includes(kind));
}
