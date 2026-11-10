/**
 * The helpdesk and abuse-report queues. Enable only after clc-core's messaging
 * routes are deployed to that environment (docs/MESSAGING.md, Rollout), and
 * together with apps/web's flag of the same name.
 */
export const MESSAGING_ENABLED = import.meta.env.VITE_MESSAGING_ENABLED === "true";
