import type { SupportedLocale } from "@clc/i18n/locales";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

let currentLocale: SupportedLocale = "en";
const setLocale = vi.fn((locale: SupportedLocale) => {
  currentLocale = locale;
});

vi.mock("#/providers/i18n", () => ({
  useLocale: () => ({
    locale: currentLocale,
    setLocale,
    loading: false,
    error: null,
  }),
}));

vi.mock("#/components/ui/select", () => ({
  SelectRoot: ({
    value,
    onValueChange,
    children,
    items: _items,
  }: {
    value: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
    items?: Record<string, string>;
  }) => (
    <select value={value} aria-label="Language" onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    children,
    dir,
  }: {
    value: string;
    children: React.ReactNode;
    dir?: "ltr" | "rtl";
  }) => (
    <option value={value} dir={dir}>
      {children}
    </option>
  ),
}));

const { LanguageSelector } = await import("./language-selector");

function renderSelector() {
  return render(<LanguageSelector />);
}

describe("LanguageSelector", () => {
  beforeEach(() => {
    currentLocale = "en";
    setLocale.mockClear();
  });

  it("shows every locale choice in the intended order", () => {
    renderSelector();
    const select = screen.getByRole("combobox", {
      name: /language/i,
    }) as HTMLSelectElement;
    expect(select.value).toBe("en");
    expect(select.selectedOptions[0]?.text).toBe("English");
    expect(screen.getByRole("option", { name: "English" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "العربية" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "中文（简体）" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "中文（繁體）" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "རྫོང་ཁ" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Deutsch" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Español" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Filipino" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Français" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "हिन्दी" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Italiano" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Nederlands" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Vlaams" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Português" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Српски" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Українська" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Kiswahili" })).toBeTruthy();
    expect([...select.options].map((option) => option.text)).toEqual([
      "English",
      "العربية",
      "中文（简体）",
      "中文（繁體）",
      "རྫོང་ཁ",
      "Deutsch",
      "Español",
      "Filipino",
      "Français",
      "हिन्दी",
      "Italiano",
      "Nederlands",
      "Vlaams",
      "Português",
      "Српски",
      "Українська",
      "Kiswahili",
    ]);
    expect(screen.getByRole("option", { name: "العربية" }).getAttribute("dir")).toBe("rtl");
  });

  it("requests a locale change when the user selects Arabic", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "ar" },
    });
    expect(setLocale).toHaveBeenCalledWith("ar");
  });

  it("requests a locale change when the user selects Simplified Chinese", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "zh" },
    });
    expect(setLocale).toHaveBeenCalledWith("zh");
  });

  it("requests a locale change when the user selects Traditional Chinese", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "zh-Hant" },
    });
    expect(setLocale).toHaveBeenCalledWith("zh-Hant");
  });

  it("requests a locale change when the user selects Dzongkha", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "dz" },
    });
    expect(setLocale).toHaveBeenCalledWith("dz");
  });

  it("requests a locale change when the user selects Filipino", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "fil" },
    });
    expect(setLocale).toHaveBeenCalledWith("fil");
  });

  it("requests a locale change when the user selects German", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "de" },
    });
    expect(setLocale).toHaveBeenCalledWith("de");
  });

  it("requests a locale change when the user selects Spanish", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "es" },
    });
    expect(setLocale).toHaveBeenCalledWith("es");
  });

  it("requests a locale change when the user selects French", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "fr" },
    });
    expect(setLocale).toHaveBeenCalledWith("fr");
  });

  it("requests a locale change when the user selects Hindi", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "hi" },
    });
    expect(setLocale).toHaveBeenCalledWith("hi");
  });

  it("requests a locale change when the user selects Italian", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "it" },
    });
    expect(setLocale).toHaveBeenCalledWith("it");
  });

  it("requests a locale change when the user selects Dutch", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "nl" },
    });
    expect(setLocale).toHaveBeenCalledWith("nl");
  });

  it("requests a locale change when the user selects Flemish", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "nl-BE" },
    });
    expect(setLocale).toHaveBeenCalledWith("nl-BE");
  });

  it("requests a locale change when the user selects Portuguese", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "pt" },
    });
    expect(setLocale).toHaveBeenCalledWith("pt");
  });

  it("requests a locale change when the user selects Kiswahili", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "sw" },
    });
    expect(setLocale).toHaveBeenCalledWith("sw");
  });

  it("requests a locale change when the user selects Serbian", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "sr" },
    });
    expect(setLocale).toHaveBeenCalledWith("sr");
  });

  it("requests a locale change when the user selects Ukrainian", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "uk" },
    });
    expect(setLocale).toHaveBeenCalledWith("uk");
  });
});
