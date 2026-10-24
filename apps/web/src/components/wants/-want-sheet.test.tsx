import type { Want } from "@clc/core/features/wants/logic";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { WantSheet } from "./want-sheet";

const WANT: Want = {
  id: "7",
  name: "Bicycle repair",
  description: "Looking for help repairing a wheel",
  locationName: "Nairobi Market",
  geoLat: -1.286,
  geoLng: 36.817,
  startsAt: "2026-10-24T08:00:00.000Z",
  expiresAt: null,
  status: "OPEN",
  state: "active",
  tags: [],
  imageUrl: null,
  markerIcon: "question",
  markerColor: "orange",
};

vi.mock("@clc/api/features/wants/queries", () => ({
  wantDetailQueryOptions: () => ({}),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: WANT, isError: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("#/lib/navigation/use-want-sheet-selection", () => ({
  useWantSheetSelection: () => ({ want: "7", close: vi.fn() }),
}));
vi.mock("#/components/ui/map-sheet", () => ({
  MapSheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MapSheetPeek: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MapSheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("#/components/wants/want-detail", () => ({
  WantDetail: () => null,
  WantShareButton: () => null,
}));
vi.mock("#/components/wants/want-row", () => ({
  WantPicture: () => <span data-testid="want-picture" />,
}));

describe("Want map sheet privacy", () => {
  it("shows the Want location without a creator identity", () => {
    render(
      <WantSheet
        realFix={null}
        snap="peek"
        onSnapChange={vi.fn()}
        onCoveredHeightChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Bicycle repair" })).toBeTruthy();
    expect(screen.getByText("Nairobi Market")).toBeTruthy();
    expect(screen.queryByText(/Wanted by/)).toBeNull();
    expect(screen.queryByText(/Amina/)).toBeNull();
  });
});
