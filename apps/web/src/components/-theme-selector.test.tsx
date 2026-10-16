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

const { ThemeSelector, ThemeSettingsRow, ThemeToggle } = await import("./theme-selector");
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

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    useThemeStore.setState({ theme: "light" });
    mockPrefersColorScheme(false);
  });

  it("renders unpressed in light mode", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: /toggle theme/i });
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("switches to dark and persists when pressed", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("reflects a stored dark preference as pressed", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: /toggle theme/i });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("ThemeSettingsRow", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    useThemeStore.setState({ theme: "light" });
    mockPrefersColorScheme(false);
  });

  it("shows the current theme, applies a choice from its sheet and closes", async () => {
    render(<ThemeSettingsRow />);
    const row = screen.getByRole("button", { name: /theme/i });
    expect(row.textContent).toContain("Light");

    fireEvent.click(row);
    const sheet = within(await screen.findByRole("dialog", { name: "Theme" }));
    expect(sheet.getByRole("radio", { name: "Light" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sheet.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(row.textContent).toContain("Dark");
  });
});
