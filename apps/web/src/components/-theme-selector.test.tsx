import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

const { ThemeToggle, ThemeSettingsRow, ThemeSettingsButton } = await import("./theme-selector");
const { useThemeStore, THEME_STORAGE_KEY } = await import("#/providers/theme");

function mockPrefersColorScheme(dark: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  useThemeStore.setState({ theme: "light" });
  mockPrefersColorScheme(false);
});

describe.each([
  ["compact toggle", ThemeToggle, true],
  ["settings row", ThemeSettingsRow, true],
  ["icon button", ThemeSettingsButton, false],
] as const)("Theme %s", (_variant, Control, showsLabel) => {
  it("shows the active light theme and toggles directly to dark and back", () => {
    render(<Control />);
    const button = screen.getByRole("button", { name: "Dark mode" });
    const lightIcon = button.innerHTML;

    expect(button.getAttribute("aria-pressed")).toBe("false");
    if (showsLabel) expect(button.textContent).toContain("Light");

    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.innerHTML).not.toBe(lightIcon);
    if (showsLabel) expect(button.textContent).toContain("Dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    if (showsLabel) expect(button.textContent).toContain("Light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});

it("hydrates a system-derived dark theme into the initial icon and label", async () => {
  mockPrefersColorScheme(true);
  render(<ThemeToggle />);

  const button = screen.getByRole("button", { name: "Dark mode" });
  await waitFor(() => expect(button.getAttribute("aria-pressed")).toBe("true"));
  expect(button.textContent).toContain("Dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});

it("renders the settings action without a navigation chevron", () => {
  render(<ThemeSettingsRow />);
  const button = screen.getByRole("button", { name: "Dark mode" });
  expect(button.querySelectorAll("svg")).toHaveLength(1);
});
