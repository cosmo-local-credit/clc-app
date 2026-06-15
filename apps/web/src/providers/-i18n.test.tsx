import { DEFAULT_LOCALE } from "@clc/i18n/index";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Cookies from "js-cookie";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.unmock("#/providers/i18n");

const { AppI18nProvider, useLocale } = await import("#/providers/i18n");

const originalLocalStorage = window.localStorage;
const originalLanguagesDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "languages");

function setNavigatorLanguages(languages: readonly string[]) {
  Object.defineProperty(window.navigator, "languages", {
    value: languages,
    configurable: true,
  });
}

function restoreNavigatorLanguages() {
  if (originalLanguagesDescriptor) {
    Object.defineProperty(window.navigator, "languages", originalLanguagesDescriptor);
  } else {
    // `languages` is a prototype getter in jsdom, so there is no own descriptor
    // to restore — delete the stubbed own property to fall back to the default.
    delete (window.navigator as { languages?: readonly string[] }).languages;
  }
}

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
    restoreNavigatorLanguages();
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

  it("detects the device language and persists it when nothing is stored", async () => {
    setNavigatorLanguages(["sw-KE", "en"]);

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe("sw");

    await waitFor(() => {
      expect(localStorage.getItem("clc.locale")).toBe("sw");
    });
  });

  it("falls back to the default locale when the device language is unsupported", () => {
    setNavigatorLanguages(["fr-FR"]);

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe(DEFAULT_LOCALE);
  });

  it("prefers a stored locale over the device language", () => {
    localStorage.setItem("clc.locale", "en");
    setNavigatorLanguages(["sw-KE"]);

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe("en");
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
