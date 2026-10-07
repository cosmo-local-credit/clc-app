import { DEFAULT_LOCALE } from "@clc/i18n/index";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Cookies from "js-cookie";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const localeModuleMocks = vi.hoisted(() => ({
  activateLocale: vi.fn<(_locale: string) => Promise<void>>(),
}));

vi.mock("@clc/i18n/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clc/i18n/index")>();
  return { ...actual, activateLocale: localeModuleMocks.activateLocale };
});

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
      <button type="button" onClick={() => setLocale("en")}>
        English
      </button>
      <button type="button" onClick={() => setLocale("ar")}>
        العربية
      </button>
      <button type="button" onClick={() => setLocale("dz")}>
        རྫོང་ཁ
      </button>
      <button type="button" onClick={() => setLocale("de")}>
        Deutsch
      </button>
      <button type="button" onClick={() => setLocale("sw")}>
        Kiswahili
      </button>
      <button type="button" onClick={() => setLocale("es")}>
        Español
      </button>
      <button type="button" onClick={() => setLocale("fr")}>
        Français
      </button>
      <button type="button" onClick={() => setLocale("it")}>
        Italiano
      </button>
      <button type="button" onClick={() => setLocale("pt")}>
        Português
      </button>
      <button type="button" onClick={() => setLocale("sr")}>
        Српски
      </button>
      <button type="button" onClick={() => setLocale("uk")}>
        Українська
      </button>
    </div>
  );
}

function renderProvider(children: ReactNode = <LocaleProbe />) {
  return render(<AppI18nProvider>{children}</AppI18nProvider>);
}

describe("AppI18nProvider", () => {
  beforeEach(() => {
    localeModuleMocks.activateLocale.mockReset();
    localeModuleMocks.activateLocale.mockResolvedValue(undefined);
    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
    });
    localStorage.clear();
    Cookies.remove("clc_locale", { path: "/" });
    document.documentElement.lang = DEFAULT_LOCALE;
    document.documentElement.dir = "ltr";
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

  it("detects Serbian from a region-tagged device language", async () => {
    setNavigatorLanguages(["sr-RS", "en"]);

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe("sr");

    await waitFor(() => {
      expect(localStorage.getItem("clc.locale")).toBe("sr");
    });
  });

  it("detects French from a region-tagged device language", async () => {
    setNavigatorLanguages(["fr-CD", "en"]);

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe("fr");

    await waitFor(() => {
      expect(localStorage.getItem("clc.locale")).toBe("fr");
    });
  });

  it("detects Spanish from a region-tagged device language", async () => {
    setNavigatorLanguages(["es-MX", "en"]);

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe("es");

    await waitFor(() => {
      expect(localStorage.getItem("clc.locale")).toBe("es");
    });
  });

  it("detects Italian from a region-tagged device language", async () => {
    setNavigatorLanguages(["it-CH", "en"]);

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe("it");

    await waitFor(() => {
      expect(localStorage.getItem("clc.locale")).toBe("it");
      expect(document.documentElement.lang).toBe("it");
      expect(document.documentElement.dir).toBe("ltr");
    });
  });

  it("detects Portuguese from a region-tagged device language", async () => {
    setNavigatorLanguages(["pt-MZ", "en"]);

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe("pt");

    await waitFor(() => {
      expect(localStorage.getItem("clc.locale")).toBe("pt");
    });
  });

  it("detects Arabic from a region-tagged device language and applies RTL", async () => {
    setNavigatorLanguages(["ar-EG", "en"]);

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe("ar");
    await waitFor(() => {
      expect(localStorage.getItem("clc.locale")).toBe("ar");
      expect(document.documentElement.lang).toBe("ar");
      expect(document.documentElement.dir).toBe("rtl");
    });
  });

  it("detects Dzongkha from a script-tagged device language and applies LTR", async () => {
    setNavigatorLanguages(["dz-Tibt-BT", "en"]);

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe("dz");
    await waitFor(() => {
      expect(localStorage.getItem("clc.locale")).toBe("dz");
      expect(document.documentElement.lang).toBe("dz");
      expect(document.documentElement.dir).toBe("ltr");
    });
  });

  it("detects German from a region-tagged device language and applies LTR", async () => {
    setNavigatorLanguages(["de-CH", "en"]);

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe("de");
    await waitFor(() => {
      expect(localStorage.getItem("clc.locale")).toBe("de");
      expect(document.documentElement.lang).toBe("de");
      expect(document.documentElement.dir).toBe("ltr");
    });
  });

  it("detects Ukrainian from a script-tagged device language and applies LTR", async () => {
    setNavigatorLanguages(["uk-Cyrl-UA", "en"]);

    renderProvider();

    expect(screen.getByLabelText("locale").textContent).toBe("uk");
    await waitFor(() => {
      expect(localStorage.getItem("clc.locale")).toBe("uk");
      expect(document.documentElement.lang).toBe("uk");
      expect(document.documentElement.dir).toBe("ltr");
    });
  });

  it("falls back to the default locale when the device language is unsupported", () => {
    setNavigatorLanguages(["ja-JP"]);

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

  it("persists a French locale selection", async () => {
    renderProvider();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Français" }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByLabelText("locale").textContent).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(localStorage.getItem("clc.locale")).toBe("fr");
    expect(Cookies.get("clc_locale")).toBe("fr");
  });

  it("persists a German locale selection", async () => {
    renderProvider();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByLabelText("locale").textContent).toBe("de");
    expect(document.documentElement.lang).toBe("de");
    expect(document.documentElement.dir).toBe("ltr");
    expect(localStorage.getItem("clc.locale")).toBe("de");
    expect(Cookies.get("clc_locale")).toBe("de");
  });

  it("persists a Spanish locale selection", async () => {
    renderProvider();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Español" }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByLabelText("locale").textContent).toBe("es");
    expect(document.documentElement.lang).toBe("es");
    expect(localStorage.getItem("clc.locale")).toBe("es");
    expect(Cookies.get("clc_locale")).toBe("es");
  });

  it("persists an Italian locale selection", async () => {
    renderProvider();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Italiano" }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByLabelText("locale").textContent).toBe("it");
    expect(document.documentElement.lang).toBe("it");
    expect(document.documentElement.dir).toBe("ltr");
    expect(localStorage.getItem("clc.locale")).toBe("it");
    expect(Cookies.get("clc_locale")).toBe("it");
  });

  it("persists a Dzongkha locale selection", async () => {
    renderProvider();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "རྫོང་ཁ" }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByLabelText("locale").textContent).toBe("dz");
    expect(document.documentElement.lang).toBe("dz");
    expect(document.documentElement.dir).toBe("ltr");
    expect(localStorage.getItem("clc.locale")).toBe("dz");
    expect(Cookies.get("clc_locale")).toBe("dz");
  });

  it("persists a Portuguese locale selection", async () => {
    renderProvider();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Português" }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByLabelText("locale").textContent).toBe("pt");
    expect(document.documentElement.lang).toBe("pt");
    expect(localStorage.getItem("clc.locale")).toBe("pt");
    expect(Cookies.get("clc_locale")).toBe("pt");
  });

  it("persists Arabic and restores LTR when English is selected", async () => {
    renderProvider();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "العربية" }));
    });
    await waitFor(() => {
      expect(screen.getByLabelText("locale").textContent).toBe("ar");
      expect(document.documentElement.lang).toBe("ar");
      expect(document.documentElement.dir).toBe("rtl");
      expect(localStorage.getItem("clc.locale")).toBe("ar");
      expect(Cookies.get("clc_locale")).toBe("ar");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "English" }));
    });
    await waitFor(() => {
      expect(document.documentElement.lang).toBe("en");
      expect(document.documentElement.dir).toBe("ltr");
    });
  });

  it("keeps the previous language and direction when Arabic activation fails", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByLabelText("loading").textContent).toBe("idle"));

    localeModuleMocks.activateLocale.mockRejectedValueOnce(new Error("catalog unavailable"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "العربية" }));
    });

    await waitFor(() => {
      expect(screen.getByLabelText("locale").textContent).toBe("en");
      expect(screen.getByLabelText("error").textContent).toBe(
        "Unable to load language. Reverted to English.",
      );
      expect(document.documentElement.lang).toBe("en");
      expect(document.documentElement.dir).toBe("ltr");
      expect(localStorage.getItem("clc.locale")).toBe("en");
    });
  });

  it("persists a Serbian locale selection", async () => {
    renderProvider();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Српски" }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByLabelText("locale").textContent).toBe("sr");
    expect(document.documentElement.lang).toBe("sr");
    expect(localStorage.getItem("clc.locale")).toBe("sr");
  });

  it("persists a Ukrainian locale selection", async () => {
    renderProvider();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Українська" }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByLabelText("locale").textContent).toBe("uk");
    expect(document.documentElement.lang).toBe("uk");
    expect(document.documentElement.dir).toBe("ltr");
    expect(localStorage.getItem("clc.locale")).toBe("uk");
    expect(Cookies.get("clc_locale")).toBe("uk");
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
