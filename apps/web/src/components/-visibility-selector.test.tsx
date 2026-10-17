import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("#/components/ui/select", () => ({
  SelectRoot: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange?: (value: string) => void;
    children: ReactNode;
  }) => (
    <select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) => (
    <span aria-label={ariaLabel} />
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const { VisibilitySelector, VisibilitySettingsRow } = await import("./visibility-selector");
const { CATALOG_VISIBILITY_STORAGE_KEY, DEFAULT_CATALOG_VISIBILITY, useCatalogVisibilityStore } =
  await import("#/features/home/state/catalog-visibility");

describe("VisibilitySelector", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useCatalogVisibilityStore.setState({ visibility: DEFAULT_CATALOG_VISIBILITY });
  });

  it("offers Global and each supported distance in the requested order", async () => {
    render(<VisibilitySelector />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("500"));
    expect([...select.options].map((option) => option.text)).toEqual([
      "Global",
      "1,000 km",
      "500 km",
      "100 km",
      "50 km",
    ]);
  });

  it("persists the selected visibility", async () => {
    render(<VisibilitySelector />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "50" } });
    expect(window.localStorage.getItem(CATALOG_VISIBILITY_STORAGE_KEY)).toBe("50");
    expect(useCatalogVisibilityStore.getState().visibility).toBe("50");
  });
});

describe("VisibilitySettingsRow", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useCatalogVisibilityStore.setState({ visibility: DEFAULT_CATALOG_VISIBILITY });
  });

  it("carries the anchor the catalogs page links to", () => {
    render(<VisibilitySettingsRow />);
    expect(screen.getByRole("button", { name: /visibility/i }).id).toBe("visibility");
  });

  it("persists a distance chosen in its sheet and closes", async () => {
    render(<VisibilitySettingsRow />);
    const row = screen.getByRole("button", { name: /visibility/i });
    await waitFor(() => expect(row.textContent).toContain("500 km"));

    fireEvent.click(row);
    const sheet = within(await screen.findByRole("dialog", { name: "Visibility" }));
    expect(sheet.getAllByRole("radio")).toHaveLength(5);
    expect(sheet.getByRole("radio", { name: "500 km" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sheet.getByRole("radio", { name: "50 km" }));

    expect(window.localStorage.getItem(CATALOG_VISIBILITY_STORAGE_KEY)).toBe("50");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(row.textContent).toContain("50 km");
  });
});
