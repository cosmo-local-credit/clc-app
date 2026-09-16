import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vite-plus/test";

// Same reason as apps/web: query-backed screens can cross Testing Library's 1s
// default while the full multi-project suite is contending for workers, which is
// why the pool publish flow passed on its own and failed in a full run. Still
// well under Vitest's 5s per-test limit.
configure({ asyncUtilTimeout: 3_000 });

// jsdom has no localStorage that survives between files; the theme store reads
// and writes it on every setTheme.
const store = new Map<string, string>();

const localStorageMock: Storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  },
  get length() {
    return store.size;
  },
  key: (index: number) => Array.from(store.keys())[index] ?? null,
};

vi.stubGlobal("localStorage", localStorageMock);

// jsdom implements neither of these, and the crop frame needs both: it measures
// the frame it encodes from, and it reads the chosen image's intrinsic size.
// Images are reported as 1600x900 so a crop has something to crop.
class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

class ImageStub {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 1600;
  height = 900;
  naturalWidth = 1600;
  naturalHeight = 900;

  set src(_value: string) {
    // Asynchronous, like a real decode, so a component that sets state in onload
    // is not doing it during its own render.
    setTimeout(() => this.onload?.(), 0);
  }
}

vi.stubGlobal("Image", ImageStub);

afterEach(() => {
  cleanup();
  store.clear();
});
