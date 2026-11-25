import type { SupportedLocale } from "@clc/i18n/locales";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { PLATFORM_ABOUT_URL, PLATFORM_TERMS_URL } from "#/lib/legal";

let currentLocale: SupportedLocale = "en";
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
    onClick,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    search: Record<string, string>;
    children: ReactNode;
  }) => (
    <a
      href={`${to}?${new URLSearchParams(search)}`}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));
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

const { AppMenu } = await import("./app-menu");
const { THEME_STORAGE_KEY, useThemeStore } = await import("#/providers/theme");

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
    mockPrefersColorScheme(false);
  });

  it("opens Helpdesk from the final menu action and closes the menu", async () => {
    render(<AppMenu />);
    await openMenu();
    const help = screen.getByRole("link", { name: "Helpdesk" });
    expect(help.getAttribute("href")).toBe("/?tab=activity&section=helpdesk");
    expect(help.previousElementSibling?.textContent).toContain("Terms of Service");
    expect(help.querySelector("svg")).not.toBeNull();
    fireEvent.click(help);
    expect(screen.queryByRole("link", { name: "Helpdesk" })).toBeNull();
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

  it("orders Language before Theme without closing during preference changes", async () => {
    render(<AppMenu />);
    await openMenu();

    const language = screen.getByRole("combobox", { name: "Language" });
    const theme = screen.getByRole("button", { name: "Dark mode" });
    const preferenceRows = ["Language", "Theme"].map(
      (label) => screen.getByText(label).parentElement,
    );
    expect(preferenceRows[0]?.nextElementSibling).toBe(preferenceRows[1]);

    fireEvent.click(theme);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(theme.getAttribute("aria-pressed")).toBe("true");
    expect(theme.textContent).toContain("Dark");
    expect(screen.getByText("About")).toBeTruthy();
    fireEvent.click(language);
    const italian = await screen.findByRole("option", { name: "Italiano" });
    fireEvent.pointerDown(italian, { pointerType: "touch" });
    fireEvent.click(italian);
    expect(setLocale).toHaveBeenCalledWith("it");
    expect(screen.getByText("About")).toBeTruthy();
  });

  it("gives all preference selectors one width", async () => {
    render(<AppMenu />);
    await openMenu();

    const theme = screen.getByRole("button", { name: "Dark mode" });
    const language = screen.getByRole("combobox", { name: "Language" });
    for (const control of [theme, language]) {
      expect(control.className).toContain("w-32");
    }
  });

  it("shows the translate icon with the current language", async () => {
    render(<AppMenu />);
    await openMenu();

    const language = screen.getByRole("combobox", { name: "Language" });
    expect(language.querySelector("svg")).not.toBeNull();
  });

  it("has no saved-location row", async () => {
    render(<AppMenu />);
    await openMenu();

    expect(screen.queryByText(/saved location/i)).toBeNull();
  });
});
