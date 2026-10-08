import type { SupportedLocale } from "@clc/i18n/locales";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { PLATFORM_ABOUT_URL, PLATFORM_TERMS_URL } from "#/lib/legal";

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
    onValueChange?: (value: string) => void;
    children: ReactNode;
    items?: Record<string, string>;
  }) => (
    <select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({
    children,
    className,
    "aria-label": ariaLabel,
  }: {
    children: ReactNode;
    className?: string;
    "aria-label"?: string;
  }) => (
    <span aria-label={ariaLabel} className={className}>
      {children}
    </span>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const { AppMenu } = await import("./app-menu");
const { THEME_STORAGE_KEY, useThemeStore } = await import("#/providers/theme");
const { DEFAULT_CATALOG_VISIBILITY, useCatalogVisibilityStore } =
  await import("#/features/home/state/catalog-visibility");

function mockPrefersColorScheme(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
  await screen.findByText("About");
}

describe("AppMenu", () => {
  beforeEach(() => {
    currentLocale = "en";
    setLocale.mockClear();
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    useThemeStore.setState({ theme: "light" });
    useCatalogVisibilityStore.setState({ visibility: DEFAULT_CATALOG_VISIBILITY });
    mockPrefersColorScheme(false);
  });

  it("opens from a square 44px trigger and links to the platform pages securely", async () => {
    render(<AppMenu />);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    expect(trigger.className).toContain("size-11");

    await openMenu();

    const about = screen.getByRole("link", { name: "About" });
    const terms = screen.getByRole("link", { name: "Terms of Service" });
    expect(about.getAttribute("href")).toBe(PLATFORM_ABOUT_URL);
    expect(terms.getAttribute("href")).toBe(PLATFORM_TERMS_URL);
    for (const link of [about, terms]) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("reuses theme and language controls without closing during preference changes", async () => {
    render(<AppMenu />);
    await openMenu();

    const [theme, language, visibility] = screen.getAllByRole("combobox") as HTMLSelectElement[];
    fireEvent.change(theme!, { target: { value: "dark" } });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByText("About")).toBeTruthy();

    fireEvent.change(language!, { target: { value: "it" } });
    expect(setLocale).toHaveBeenCalledWith("it");
    expect(screen.getByText("About")).toBeTruthy();

    fireEvent.change(visibility!, { target: { value: "global" } });
    expect(useCatalogVisibilityStore.getState().visibility).toBe("global");
    expect(screen.getByText("About")).toBeTruthy();
  });

  it("gives all preference selectors one width", async () => {
    render(<AppMenu />);
    await openMenu();

    const theme = screen.getByLabelText("Theme", { selector: "span" });
    const language = screen.getByLabelText("Language", { selector: "span" });
    const visibility = screen.getByLabelText("Visibility", { selector: "span" });
    expect(theme.className).toContain("w-32");
    expect(language.className).toBe(theme.className);
    expect(visibility.className).toBe(theme.className);
  });

  it("has no saved-location row", async () => {
    render(<AppMenu />);
    await openMenu();

    expect(screen.queryByText(/saved location/i)).toBeNull();
  });
});
