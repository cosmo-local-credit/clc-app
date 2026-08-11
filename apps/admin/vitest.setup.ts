import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vite-plus/test";

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

afterEach(() => {
  cleanup();
  store.clear();
});
