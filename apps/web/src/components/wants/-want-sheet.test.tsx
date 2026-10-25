import type { Want } from "@clc/core/features/wants/logic";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
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

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  refetch: vi.fn(),
  query: {
    data: undefined as Want | undefined,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@clc/api/features/wants/queries", () => ({
  wantDetailQueryOptions: () => ({}),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.query,
}));
vi.mock("#/lib/navigation/use-want-sheet-selection", () => ({
  useWantSheetSelection: () => ({ want: "7", close: mocks.close }),
}));
vi.mock("#/components/ui/map-sheet", () => ({
  MapSheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MapSheetPeek: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MapSheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("#/components/wants/want-detail", () => ({
  WantDetail: () => <div>Full Want details</div>,
  WantShareButton: () => null,
}));

beforeEach(() => {
  mocks.close.mockReset();
  mocks.query.data = WANT;
  mocks.query.isError = false;
  mocks.query.isFetching = false;
  mocks.query.refetch.mockReset();
});
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

  it("opens the full sheet from the identity row and closes without bubbling", () => {
    const onSnapChange = vi.fn();
    render(
      <WantSheet
        realFix={null}
        snap="peek"
        onSnapChange={onSnapChange}
        onCoveredHeightChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Bicycle repair/ }));
    expect(onSnapChange).toHaveBeenCalledWith("full");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mocks.close).toHaveBeenCalled();
  });

  it("retries failed detail reads", () => {
    mocks.query.data = undefined;
    mocks.query.isError = true;
    render(
      <WantSheet
        realFix={null}
        snap="peek"
        onSnapChange={vi.fn()}
        onCoveredHeightChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.query.refetch).toHaveBeenCalled();
  });

  it("mounts the complete detail after the sheet reaches half", () => {
    render(
      <WantSheet
        realFix={null}
        snap="half"
        onSnapChange={vi.fn()}
        onCoveredHeightChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Full Want details")).toBeTruthy();
  });
});
