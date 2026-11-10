/**
 * Messaging and the Activity inbox. Enable only after clc-core's messaging
 * routes and the notification service's MESSAGING intake are deployed to that
 * environment (docs/MESSAGING.md, Rollout).
 */
export const MESSAGING_ENABLED = import.meta.env.VITE_MESSAGING_ENABLED === "true";
