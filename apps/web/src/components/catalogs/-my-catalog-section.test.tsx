import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("#/features/catalogs/hooks/use-my-catalog", () => ({
  useMyCatalog: () => ({
    isPending: false,
    isSuccess: true,
    isError: false,
    catalogs: [catalog("1", "Market day"), catalog("2", "Farm gate")],
  }),
}));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({
    data: { catalogs: { used: 2, limit: 5, unlimited: false, canCreate: true } },
    isPending: false,
    isError: false,
  }),
}));

import { MyCatalogSection } from "./my-catalog-section";

function catalog(id: string, name: string) {
  return {
    id,
    name,
    description: null,
    imageUrl: null,
    locationName: null,
    geoLat: 0,
    geoLng: 0,
    tags: [],
  };
}

describe("MyCatalogSection", () => {
  it("lists every catalog with Create catalog at rest", () => {
    render(<MyCatalogSection />);

    expect(screen.getByText("Market day")).toBeTruthy();
    expect(screen.getByText("Farm gate")).toBeTruthy();
    expect(screen.getByText("Create catalog")).toBeTruthy();
  });

  it("narrows to the Wallet's search, with nothing to create", () => {
    render(<MyCatalogSection search="farm" />);

    expect(screen.getByText("Farm gate")).toBeTruthy();
    expect(screen.queryByText("Market day")).toBeNull();
    expect(screen.queryByText("Create catalog")).toBeNull();
  });

  it("leaves the Wallet when nothing matches", () => {
    const { container } = render(<MyCatalogSection search="nothing like it" />);

    expect(container.childElementCount).toBe(0);
  });
});
