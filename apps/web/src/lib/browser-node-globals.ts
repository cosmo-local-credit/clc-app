import { Buffer } from "buffer";

type BrowserProcess = {
  browser: true;
  env: Record<string, string | undefined>;
  version: string;
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => void;
};

const globalScope = globalThis as unknown as {
  Buffer?: typeof Buffer;
  clearImmediate?: (handle: ReturnType<typeof setTimeout>) => void;
  process?: Partial<BrowserProcess>;
  setImmediate?: (
    callback: (...args: unknown[]) => void,
    ...args: unknown[]
  ) => ReturnType<typeof setTimeout>;
};
const currentProcess = globalScope.process;
const existingNextTick = currentProcess?.nextTick?.bind(currentProcess);

globalScope.Buffer ??= Buffer;
globalScope.setImmediate ??= (callback: (...args: unknown[]) => void, ...args: unknown[]) =>
  setTimeout(() => callback(...args), 0);
globalScope.clearImmediate ??= (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle);
globalScope.process = {
  ...currentProcess,
  browser: true,
  env: currentProcess?.env ?? {},
  version: currentProcess?.version ?? "v24.0.0",
  nextTick:
    existingNextTick ??
    ((callback: (...args: unknown[]) => void, ...args: unknown[]) => {
      queueMicrotask(() => callback(...args));
    }),
};
