import { createFileRoute } from "@tanstack/react-router";
import { NotFoundPage } from "#/features/not-found/not-found-page";

/**
 * Catch-all for unmatched URLs.
 *
 * Under `_shell` on purpose: a mistyped or stale link keeps the sidebar, the
 * session gate and a way back, rather than dropping the operator onto a bare page
 * outside the console. This is the app-owned alternative to a
 * `notFoundComponent`, which this project does not use.
 */
export const Route = createFileRoute("/_shell/$")({
  component: NotFoundPage,
});
