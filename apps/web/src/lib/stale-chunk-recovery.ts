// Recovery for stale code-split chunks after a deploy ("version skew").
//
// The app loads several chunks via React `lazy(() => import(...))` (e.g.
// routes/index.tsx -> #/features/home/ui/home-page, the *.lazy.tsx map wrappers)
// rather than TanStack Router's `lazyRouteComponent`. Router's built-in
// stale-deploy auto-reload lives *only* inside `lazyRouteComponent`, so these
// React.lazy imports get no recovery: after a deploy an outdated tab tries to
// import a chunk hash the server no longer serves, the rejection bubbles to the
// root error boundary, and the user is stuck on "Something went wrong!".
//
// Vite emits `vite:preloadError` on such failures and recommends reloading the
// page (https://vite.dev/guide/build#load-error-handling). We reload at most
// once per failing chunk (keyed on the error message, which includes the chunk
// URL) so a fresh deploy can always recover, but a genuinely persistent failure
// surfaces the error instead of looping.

import { isReloadPending, reloadPage } from "#/lib/page-reload";

const MODULE_LOAD_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/;

export function isModuleLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return MODULE_LOAD_ERROR.test(message);
}

const RELOAD_MARKER_PREFIX = "clc:stale-chunk-reload:";

// One-shot "already reloaded for this chunk" marker. Prefer sessionStorage, but
// fall back to window.name when storage is unavailable (blocked / some private
// modes) — window.name survives a same-tab reload without any storage
// permission, so the guard still holds and we can't boot-loop.
function hasReloadMarker(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return true;
  } catch {
    // storage blocked; fall through to the window.name marker
  }
  return window.name.includes(key);
}

function setReloadMarker(key: string): void {
  try {
    sessionStorage.setItem(key, "1");
    return;
  } catch {
    // storage blocked; record in window.name instead
  }
  if (!window.name.includes(key)) {
    window.name = window.name ? `${window.name}\n${key}` : key;
  }
}

/**
 * Reload the page once per failing chunk. Returns `true` if a reload was
 * triggered (the caller should suppress the error / render a neutral
 * placeholder while the navigation happens), `false` if this chunk already
 * triggered a reload in this tab session and the error should surface instead.
 */
export function reloadOnceForStaleChunk(error: unknown): boolean {
  if (typeof window === "undefined") return false;

  // Another reload — the update banner's, or another chunk's — is already
  // replacing this page. Join it without spending this chunk's one shot, which
  // a cancelled reload would otherwise have used up.
  if (isReloadPending()) return true;

  const message = error instanceof Error ? error.message : String(error);
  const key = `${RELOAD_MARKER_PREFIX}${message}`;
  if (hasReloadMarker(key)) return false;
  setReloadMarker(key);

  reloadPage();
  return true;
}
