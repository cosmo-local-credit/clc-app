import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({
    data: { email: "amina@example.org", phone: "+254712345678", country: "KE" },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({
    data: { wants: { used: 0, limit: 3, canCreate: true, unlimited: false } },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/hooks/use-deployment", () => ({
  tokenTagsQueryKey: ["deployments", "token-tags"],
  useTokenTags: () => ({ data: ["Food"], isError: false, isPending: false, refetch: vi.fn() }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));
// Cropping and uploading have their own suite; this one is about the layout.
vi.mock("#/components/ui/image-upload-field", () => ({
  ImageUploadField: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: () => <div data-testid="location-picker" />,
}));
vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div data-testid="map" />,
}));

import { WantFormDesk } from "./want-form-desk";

function renderForm(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe("WantFormDesk", () => {
  it("keeps every part of the form, and the preview, at every width", () => {
    renderForm(<WantFormDesk />);

    expect(screen.getByRole("heading", { level: 1, name: "Create Want" })).toBeTruthy();
    for (const part of ["want", "when", "where", "picture", "contact"]) {
      expect(document.getElementById(`want-part-${part}`)).toBeTruthy();
    }
    expect(screen.getByLabelText("Starts")).toBeTruthy();
    expect(screen.getByLabelText("Ends")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Want" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Preview" })).toBeTruthy();
  });

  it("heads each part of the form with its name, one level under the page title", () => {
    renderForm(<WantFormDesk />);

    // One page title, then a heading per part, in the same words the outline links with.
    expect(screen.getAllByRole("heading", { level: 1 }).map((node) => node.textContent)).toEqual([
      "Create Want",
    ]);
    const outline = within(screen.getByRole("navigation", { name: "Sections" }));
    for (const [part, name] of [
      ["want", "Want"],
      ["when", "When"],
      ["where", "Where"],
      ["picture", "Picture"],
      ["contact", "Contact"],
    ] as const) {
      const heading = screen.getByRole("heading", { level: 2, name });
      const section = document.getElementById(`want-part-${part}`) as HTMLElement;
      expect(section.tagName).toBe("SECTION");
      expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
      expect(section.firstElementChild).toBe(heading);
      expect(outline.getByRole("link", { name }).getAttribute("href")).toBe(`#want-part-${part}`);
      // The 16px section style, never a restyled or oversized heading.
      expect(heading.className).toContain("text-base");
      expect(heading.className).toContain("font-heading");
    }
  });

  it("drops the secondary columns before the form is squeezed", () => {
    renderForm(<WantFormDesk />);

    const aside = screen.getByRole("complementary", { name: "Preview" });
    const nav = screen.getByRole("navigation", { name: "Sections" });
    const grid = aside.parentElement as HTMLElement;
    // One column, then outline + form, then outline + form + preview: the form
    // track never drops below 440px and the preview track never below 240px.
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain(
      "@min-[43rem]:grid-cols-[minmax(160px,200px)_minmax(440px,560px)]",
    );
    expect(grid.className).toContain(
      "@min-[62rem]:grid-cols-[minmax(160px,200px)_minmax(440px,560px)_minmax(240px,1fr)]",
    );
    expect(nav.className).toContain("@min-[43rem]:col-start-1");
    expect(aside.className).toContain("@min-[43rem]:row-start-2");
    expect(aside.className).toContain("@min-[62rem]:col-start-3");
    expect(aside.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(grid.className).not.toContain("200px_minmax(0,520px)");
  });

  it("stacks the start and end dates when the form is narrow", () => {
    renderForm(<WantFormDesk />);

    const dates = screen.getByLabelText("Starts").closest(".grid") as HTMLElement;
    expect(dates.className).toContain("grid-cols-1");
    expect(dates.className).toContain("@min-[30rem]:grid-cols-2");
    expect(within(dates).getByLabelText("Ends")).toBeTruthy();
    expect(dates.parentElement?.className).toContain("@container");
  });
});
