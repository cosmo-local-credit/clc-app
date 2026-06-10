import { cleanup } from "@testing-library/react";
import type * as LinguiReact from "@lingui/react";
import type * as I18nProviderModule from "#/providers/i18n";
import type { ReactNode } from "react";
import { afterEach, vi } from "vite-plus/test";

type TestTransProps = {
  id: string;
  message?: string;
  values?: Record<string, unknown>;
  children?: ReactNode;
};

vi.mock("#/providers/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof I18nProviderModule>();

  return {
    ...actual,
    useLocale: () => ({ locale: "en", setLocale: vi.fn(), loading: false }),
  };
});

vi.mock("@lingui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof LinguiReact>();
  const { i18n } = await import("@clc/i18n/index");
  const translate = i18n._.bind(i18n);

  return {
    ...actual,
    useLingui: () => ({ i18n, _: translate }),
    Trans: ({ id, message, values, children }: TestTransProps) =>
      translate({ id, message: message ?? String(children ?? id), values }),
  };
});

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
  key: (index: number) => {
    const keys = Array.from(store.keys());
    return keys[index] ?? null;
  },
};

vi.stubGlobal("localStorage", localStorageMock);

afterEach(() => {
  cleanup();
});
