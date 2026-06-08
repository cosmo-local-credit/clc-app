import { DEFAULT_LOCALE } from "@clc/i18n/index";
import { act, fireEvent, render, screen } from "@testing-library/react";
import Cookies from "js-cookie";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.unmock("#/providers/i18n");

const { AppI18nProvider, useLocale } = await import("#/providers/i18n");

const originalLocalStorage = window.localStorage;

function LocaleProbe() {
  const { locale, loading, error, setLocale } = useLocale();
  return (
    <div>
      <output aria-label="locale">{locale}</output>
      <output aria-label="loading">{loading ? "loading" : "idle"}</output>
      <output aria-label="error">{error ?? "none"}</output>
      <button type="button" onClick={() => setLocale("sw")}>
        Kiswahili
      </button>
    </div>
  );
}

function renderProvider(children: ReactNode = <LocaleProbe />) {
  return render(<AppI18nProvider>{children}</AppI18nProvider>);
}

describe("AppI18nProvider", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
    });
    localStorage.clear();
    Cookies.remove("clc_locale", { path: "/" });
    document.documentElement.lang = DEFAULT_LOCALE;
  });

  afterEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
    });
    localStorage.clear();
    Cookies.remove("clc_locale", { path: "/" });
  });

  it("prefers localStorage over the locale cookie", () => {
    localStorage.setItem("clc.locale", "sw");
    Cookies.set("clc_locale", "en", { path: "/" });

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe("sw");
  });

  it("uses the locale cookie when localStorage has no supported locale", () => {
    localStorage.setItem("clc.locale", "zz");
    Cookies.set("clc_locale", "sw", { path: "/" });

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe("sw");
  });

  it("falls back to the default locale when stored values are unsupported", () => {
    localStorage.setItem("clc.locale", "zz");
    Cookies.set("clc_locale", "yy", { path: "/" });

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe(DEFAULT_LOCALE);
  });

  it("persists locale changes to the document and localStorage", async () => {
    renderProvider();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kiswahili" }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByLabelText("locale").textContent).toBe("sw");
    expect(document.documentElement.lang).toBe("sw");
    expect(localStorage.getItem("clc.locale")).toBe("sw");
  });

  it("ignores localStorage security errors and still renders", () => {
    const throwingStorage: Storage = {
      getItem: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: () => null,
      length: 0,
    };
    Object.defineProperty(window, "localStorage", {
      value: throwingStorage,
      configurable: true,
    });

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe(DEFAULT_LOCALE);
  });

  it("throws when useLocale is rendered outside AppI18nProvider", () => {
    function MissingProvider() {
      useLocale();
      return null;
    }

    expect(() => render(<MissingProvider />)).toThrow(
      "useLocale must be used within AppI18nProvider",
    );
  });
});
