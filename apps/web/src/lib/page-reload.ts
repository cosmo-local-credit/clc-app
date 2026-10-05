/**
 * The one way this app reloads itself.
 *
 * The update banner and stale-chunk recovery can both decide to reload at
 * nearly the same moment — an "Update" click while an old chunk fails to load.
 * The first caller reloads and the other finds a reload already under way.
 *
 * The window closes again after a while because a reload can be cancelled: a
 * page with unsaved work asks the browser to confirm leaving, and a user who
 * chooses to stay must be able to try again.
 */
const RELOAD_SETTLE_MS = 10_000;

let pendingReload: ReturnType<typeof setTimeout> | undefined;

export function isReloadPending(): boolean {
  return pendingReload !== undefined;
}

/** Reloads the page, keeping its path, search and hash, unless a reload is under way. */
export function reloadPage(): void {
  if (pendingReload !== undefined) return;
  pendingReload = setTimeout(() => {
    pendingReload = undefined;
  }, RELOAD_SETTLE_MS);
  window.location.reload();
}
