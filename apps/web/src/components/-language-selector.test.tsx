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
  }: {
    value: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select value={value} aria-label="Language" onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
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

  it("shows English, French, Serbian, and Kiswahili locale choices", () => {
    renderSelector();
    const select = screen.getByRole("combobox", {
      name: /language/i,
    }) as HTMLSelectElement;
    expect(select.value).toBe("en");
    expect(screen.getByRole("option", { name: "English" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Français" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Српски" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Kiswahili" })).toBeTruthy();
  });

  it("requests a locale change when the user selects French", () => {
    renderSelector();
    fireEvent.change(screen.getByRole("combobox", { name: /language/i }), {
      target: { value: "fr" },
    });
    expect(setLocale).toHaveBeenCalledWith("fr");
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
});
