export type VoucherCreateHistory = {
  location: {
    state: { __TSR_index?: number };
  };
  go: (delta: number) => void;
  flush: () => void;
  subscribe: (callback: () => void) => () => void;
  push: (path: string, state?: unknown) => void;
  replace: (path: string, state?: unknown) => void;
};

let voucherCreateRootIndex: number | null = null;
let exitInProgress = false;

function historyIndex(history: VoucherCreateHistory): number | null {
  const index = history.location.state.__TSR_index;
  return typeof index === "number" ? index : null;
}

export function beginVoucherCreateHistory(history: VoucherCreateHistory): void {
  voucherCreateRootIndex = historyIndex(history);
  exitInProgress = false;
}

export function resetVoucherCreateHistory(): void {
  voucherCreateRootIndex = null;
  exitInProgress = false;
}

export function exitVoucherCreateHistory(options: {
  history: VoucherCreateHistory;
  destination: string;
}): void {
  if (exitInProgress) return;

  const { history, destination } = options;
  const currentIndex = historyIndex(history);
  const rootIndex = voucherCreateRootIndex;
  exitInProgress = true;

  const pushAfterRoot = () => {
    voucherCreateRootIndex = null;
    history.push(destination);
    history.flush();
    exitInProgress = false;
  };
  const replaceFromRoot = () => {
    voucherCreateRootIndex = null;
    history.replace(destination);
    history.flush();
    history.push(destination);
    history.flush();
    exitInProgress = false;
  };
  const replaceOnly = () => {
    voucherCreateRootIndex = null;
    history.replace(destination);
    history.flush();
    exitInProgress = false;
  };
  const abort = () => {
    exitInProgress = false;
  };

  if (rootIndex === null || currentIndex === null) {
    replaceOnly();
    return;
  }
  if (rootIndex === 0) {
    if (currentIndex === 0) {
      replaceFromRoot();
      return;
    }
    settleAtIndex(history, 0, currentIndex, replaceFromRoot, abort);
    return;
  }

  const targetIndex = rootIndex - 1;
  const delta = currentIndex - targetIndex;
  if (delta <= 0) {
    replaceOnly();
    return;
  }
  settleAtIndex(history, targetIndex, delta, pushAfterRoot, abort);
}

function settleAtIndex(
  history: VoucherCreateHistory,
  targetIndex: number,
  initialDelta: number,
  onReady: () => void,
  onAbort: () => void,
): void {
  let settled = false;
  let retries = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const cleanup = () => {
    unsubscribe();
    if (timer !== undefined) clearInterval(timer);
  };
  const finishIfReady = () => {
    if (settled) return true;
    const index = historyIndex(history);
    if (index === null || index > targetIndex) return false;
    settled = true;
    cleanup();
    onReady();
    return true;
  };
  const unsubscribe = history.subscribe(finishIfReady);

  history.go(-initialDelta);
  history.flush();
  if (finishIfReady()) return;

  timer = setInterval(() => {
    if (finishIfReady()) return;
    retries += 1;
    const index = historyIndex(history);
    if (index !== null && index > targetIndex) {
      history.go(-(index - targetIndex));
      history.flush();
    }
    if (retries < 50) return;
    if (finishIfReady()) return;
    settled = true;
    cleanup();
    onAbort();
  }, 20);
}
