/** Minimal history surface from TanStack Router (avoids a direct @tanstack/history import). */
export type FlowHistory = {
  location: {
    state: { __TSR_index?: number };
  };
  go: (delta: number) => void;
  flush: () => void;
  subscribe: (callback: () => void) => () => void;
  /** Low-level history ops — used for land/truncate (not router.navigate). */
  push: (path: string, state?: unknown) => void;
  replace: (path: string, state?: unknown) => void;
};

function readHistoryIndex(history: FlowHistory): number | null {
  const index = history.location.state.__TSR_index;
  return typeof index === "number" ? index : null;
}

/**
 * Wait until the history index is at or before `targetIndex`, then run `onReady`.
 * Never invokes `onReady` until the index check passes. If the target cannot be
 * reached after retries, calls `onAbort` instead.
 */
function settleToIndex(
  history: FlowHistory,
  targetIndex: number,
  initialDelta: number,
  onReady: () => void,
  onAbort: () => void,
): void {
  if (initialDelta <= 0) {
    onReady();
    return;
  }

  let settled = false;
  let retries = 0;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const cleanup = () => {
    unsubscribe();
    if (pollTimer !== undefined) clearInterval(pollTimer);
  };

  const tryFinish = (): boolean => {
    if (settled) return true;
    const index = readHistoryIndex(history);
    if (index === null || index > targetIndex) return false;
    settled = true;
    cleanup();
    onReady();
    return true;
  };

  const unsubscribe = history.subscribe(() => {
    tryFinish();
  });

  history.go(-initialDelta);
  history.flush();
  if (tryFinish()) return;

  // Poll: re-issue the remaining delta while still above target. Never land early.
  pollTimer = setInterval(() => {
    if (tryFinish()) return;
    retries += 1;
    const index = readHistoryIndex(history);
    if (index !== null && index > targetIndex) {
      history.go(-(index - targetIndex));
      history.flush();
      tryFinish();
    }
    // Cap retries (~1s). Abort rather than landing from the wrong entry.
    if (retries < 50) return;
    if (tryFinish()) return;
    settled = true;
    cleanup();
    onAbort();
  }, 20);
}

/**
 * Exit helper for a pushed multi-step flow (onboarding signup, voucher
 * creation): leaves for `destination` while discarding the flow's intermediate
 * **and forward** history entries, so Back cannot re-enter a finished flow.
 *
 * Landing uses **history.push/replace** (not router.navigate) so truncation works
 * even when the destination URL matches the current path after replace — TanStack
 * Router would dedupe a second navigate() to the same location.
 *
 * Strategy:
 * - Prefer: go back to the entry *before* the flow root, then history.push(dest).
 * - Deep-link (root index 0): go to root, history.replace(dest), history.push(dest)
 *   so forward flow slots are spliced away.
 *
 * Settlement waits until the history index actually reaches the target; if it
 * cannot, the exit aborts (latch cleared) so the user stays put and can retry.
 *
 * @param reentrant Release the latch once the exit lands. Flows whose terminal
 * screen exits again (a receipt continuing to a detail page) need this; a
 * one-shot flow keeps the latch set so a late duplicate call is ignored.
 */
export function createFlowExit({ reentrant }: { reentrant: boolean }) {
  /**
   * Index of the first flow history entry for the current visit. Used to pop
   * intermediate steps on exit.
   */
  let rootIndex: number | null = null;
  /** Prevents concurrent / duplicate exit traversals from racing. */
  let exitInProgress = false;

  return {
    /** Call while mounted on the flow's first screen so this visit's root is remembered. */
    noteRoot: (history: FlowHistory): void => {
      if (rootIndex !== null) return;
      rootIndex = readHistoryIndex(history);
    },

    getRootIndex: (): number | null => rootIndex,

    isExitInProgress: (): boolean => exitInProgress,

    /** Reset flow state — on re-entry from the flow's launch screen, and between tests. */
    reset: (): void => {
      rootIndex = null;
      exitInProgress = false;
    },

    exit: ({ history, destination }: { history: FlowHistory; destination: string }): void => {
      if (exitInProgress) return;

      const currentIndex = readHistoryIndex(history);
      const flowRootIndex = rootIndex;
      exitInProgress = true;

      const land = (mode: "push-after-root" | "replace-from-root" | "replace-only") => {
        rootIndex = null;
        if (mode === "push-after-root") {
          history.push(destination);
          history.flush();
        } else {
          history.replace(destination);
          history.flush();
          if (mode === "replace-from-root") {
            history.push(destination);
            history.flush();
          }
        }
        if (reentrant) exitInProgress = false;
      };
      const abort = () => {
        exitInProgress = false;
      };

      if (flowRootIndex === null || currentIndex === null) {
        land("replace-only");
        return;
      }

      if (flowRootIndex === 0) {
        settleToIndex(history, 0, currentIndex, () => land("replace-from-root"), abort);
        return;
      }

      const targetIndex = flowRootIndex - 1;
      const delta = currentIndex - targetIndex;
      if (delta <= 0) {
        land("replace-only");
        return;
      }
      settleToIndex(history, targetIndex, delta, () => land("push-after-root"), abort);
    },
  };
}
