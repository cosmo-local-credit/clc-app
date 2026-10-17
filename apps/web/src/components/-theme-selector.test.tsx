import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

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
    <select value={value} aria-label="Theme" onChange={(e) => onValueChange?.(e.target.value)}>
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

const { ThemeSelector, ThemeSettingsRow, ThemeSettingsButton } = await import("./theme-selector");
const { useThemeStore, THEME_STORAGE_KEY } = await import("#/providers/theme");

function mockPrefersColorScheme(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("ThemeSelector", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    useThemeStore.setState({ theme: "light" });
    mockPrefersColorScheme(false);
  });

  it("offers Light and Dark choices", () => {
    render(<ThemeSelector />);
    expect(screen.getByRole("option", { name: "Light" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Dark" })).toBeTruthy();
  });

  it("autodetects the device preference on first render", () => {
    mockPrefersColorScheme(true);
    render(<ThemeSelector />);
    const select = screen.getByRole("combobox", { name: /theme/i }) as HTMLSelectElement;
    expect(select.value).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("applies and persists the chosen theme", () => {
    render(<ThemeSelector />);
    fireEvent.change(screen.getByRole("combobox", { name: /theme/i }), {
      target: { value: "dark" },
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});

describe.each([
  ["row", ThemeSettingsRow],
  ["icon button", ThemeSettingsButton],
] as const)("Theme settings %s", (variant, Control) => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    useThemeStore.setState({ theme: "light" });
    mockPrefersColorScheme(false);
  });

  it("shows the current theme, applies a choice from its sheet and closes", async () => {
    render(<Control />);
    const row = screen.getByRole("button", { name: /theme/i });
    if (variant === "row") expect(row.textContent).toContain("Light");

    fireEvent.click(row);
    const sheet = within(await screen.findByRole("dialog", { name: "Theme" }));
    expect(sheet.getByRole("radio", { name: "Light" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sheet.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    if (variant === "row") expect(row.textContent).toContain("Dark");
  });
});
