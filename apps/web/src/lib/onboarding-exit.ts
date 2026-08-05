/** Minimal history surface from TanStack Router (avoids a direct @tanstack/history import). */
export type OnboardingRouterHistory = {
  location: {
    state: { __TSR_index?: number };
    pathname: string;
    href: string;
  };
  go: (delta: number) => void;
  flush: () => void;
  subscribe: (cb: () => void) => () => void;
  /** Low-level history ops — used for land/truncate (not router.navigate). */
  push: (path: string, state?: unknown) => void;
  replace: (path: string, state?: unknown) => void;
};

/**
 * Index of the first onboarding history entry for the current visit.
 * Used to pop intermediate steps on successful exit so Back does not re-enter
 * authenticated onboarding.
 */
let onboardingRootIndex: number | null = null;

/** Prevents concurrent / duplicate exit traversals from racing. */
let exitInProgress = false;

function readHistoryIndex(history: OnboardingRouterHistory): number | null {
  const index = history.location.state.__TSR_index;
  return typeof index === "number" ? index : null;
}

/** Call while mounted on `/onboarding` so the first entry of this visit is remembered. */
export function noteOnboardingHistoryRoot(history: OnboardingRouterHistory): void {
  if (onboardingRootIndex !== null) return;
  onboardingRootIndex = readHistoryIndex(history);
}

function clearOnboardingHistoryRoot(): void {
  onboardingRootIndex = null;
}

export function getOnboardingHistoryRootIndex(): number | null {
  return onboardingRootIndex;
}

/** Test helper — reset global exit latch between cases. */
export function resetOnboardingExitState(): void {
  onboardingRootIndex = null;
  exitInProgress = false;
}

export function isOnboardingExitInProgress(): boolean {
  return exitInProgress;
}

/**
 * Leave onboarding for `dest`, discarding intermediate **and forward** onboarding
 * history entries.
 *
 * Settlement waits until the history index actually reaches the target. It never
 * lands from a mid-stack onboarding entry. If the target cannot be reached, the
 * exit aborts (latch cleared) so the user stays on onboarding and can retry.
 *
 * Landing uses **history.push/replace** (not router.navigate) so truncation works
 * even when the destination URL matches the current path after replace — TanStack
 * Router would dedupe a second navigate() to the same location.
 *
 * Strategy:
 * - Prefer: go back to the entry *before* the onboarding root, then history.push(dest).
 * - Deep-link (root index 0): go to root, history.replace(dest), history.push(dest)
 *   so forward onboarding slots are spliced away.
 *
 * Idempotent: concurrent callers share a single in-progress exit.
 */
export function exitOnboarding(opts: { history: OnboardingRouterHistory; dest: string }): void {
  if (exitInProgress) return;

  const { history, dest } = opts;
  const currentIndex = readHistoryIndex(history);
  const rootIndex = onboardingRootIndex;

  exitInProgress = true;

  const landAfterBeforeRoot = () => {
    clearOnboardingHistoryRoot();
    // Push from the pre-onboarding entry — truncates any forward onboarding slots.
    history.push(dest);
    history.flush();
  };

  /**
   * Deep-link / first-entry: replace root with dest, then push dest so the
   * history engine splices entries ahead of the root (Forward cannot revive them).
   * Uses history.push/replace, not router.navigate (same-URL navigate is a no-op).
   */
  const landFromRootZero = () => {
    clearOnboardingHistoryRoot();
    history.replace(dest);
    history.flush();
    history.push(dest);
    history.flush();
  };

  const landReplaceOnly = () => {
    clearOnboardingHistoryRoot();
    history.replace(dest);
    history.flush();
  };

  const abortExit = () => {
    exitInProgress = false;
  };

  // Steps back to the entry *before* onboarding (include the root itself).
  const deltaToBeforeRoot =
    currentIndex !== null && rootIndex !== null ? Math.max(0, currentIndex - rootIndex + 1) : 0;

  if (rootIndex === 0 && currentIndex !== null) {
    if (currentIndex > 0) {
      settleToIndex(history, 0, currentIndex, landFromRootZero, abortExit);
      return;
    }
    landFromRootZero();
    return;
  }

  if (deltaToBeforeRoot <= 0 || rootIndex === null) {
    landReplaceOnly();
    return;
  }

  const targetIndex = rootIndex - 1;
  settleToIndex(history, targetIndex, deltaToBeforeRoot, landAfterBeforeRoot, abortExit);
}

/**
 * Wait until history index is at or before `targetIndex`, then run `onReady`.
 * Never invokes `onReady` until the index check passes.
 * If the target cannot be reached after retries, calls `onAbort` instead.
 */
function settleToIndex(
  history: OnboardingRouterHistory,
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
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let retries = 0;

  const cleanup = () => {
    unsub();
    if (pollTimer !== undefined) clearInterval(pollTimer);
  };

  const tryFinish = (): boolean => {
    if (settled) return true;
    const idx = readHistoryIndex(history);
    if (idx !== null && idx <= targetIndex) {
      settled = true;
      cleanup();
      onReady();
      return true;
    }
    return false;
  };

  const unsub = history.subscribe(() => {
    tryFinish();
  });

  history.go(-initialDelta);
  history.flush();
  if (tryFinish()) return;

  // Poll: re-issue remaining delta if still above target. Never land early.
  pollTimer = setInterval(() => {
    if (tryFinish()) return;
    retries += 1;
    const idx = readHistoryIndex(history);
    if (idx !== null && idx > targetIndex) {
      history.go(-(idx - targetIndex));
      history.flush();
      tryFinish();
    }
    // Cap retries (~1s). Abort rather than landing from the wrong entry.
    if (retries >= 50) {
      const latest = readHistoryIndex(history);
      if (latest !== null && latest > targetIndex) {
        history.go(-(latest - targetIndex));
        history.flush();
      }
      if (!tryFinish()) {
        settled = true;
        cleanup();
        onAbort();
      }
    }
  }, 20);
}
