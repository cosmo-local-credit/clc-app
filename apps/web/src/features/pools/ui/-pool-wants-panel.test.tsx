import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  query: {
    data: undefined as undefined | { pages: Array<{ wants: Array<{ id: string; name: string }> }> },
    isPending: false,
    isError: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({ useInfiniteQuery: () => state.query }));
vi.mock("@clc/api/features/wants/queries", () => ({ poolWantsInfiniteQueryOptions: () => ({}) }));
vi.mock("#/lib/api/wants", () => ({ wantsClient: {} }));
vi.mock("#/components/wants/want-row", () => ({
  WantRow: ({ want, poolAddress }: { want: { name: string }; poolAddress: string }) => (
    <div>
      {want.name} in {poolAddress}
    </div>
  ),
}));

import { PoolWantsPanel } from "./pool-wants-panel";

beforeEach(() => {
  state.query.data = undefined;
  state.query.isPending = false;
  state.query.isError = false;
  state.query.isFetching = false;
  state.query.hasNextPage = false;
  state.query.isFetchingNextPage = false;
  state.query.refetch.mockReset();
  state.query.fetchNextPage.mockReset();
});

describe("Pool Wants panel", () => {
  it("renders connected Wants and loads another page", () => {
    state.query.data = { pages: [{ wants: [{ id: "7", name: "Bicycle repair" }] }] };
    state.query.hasNextPage = true;
    render(<PoolWantsPanel poolAddress="0xpool" />);

    expect(screen.getByText("Bicycle repair in 0xpool")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(state.query.fetchNextPage).toHaveBeenCalled();
  });

  it("renders loading, failure with Retry, and empty states", () => {
    state.query.isPending = true;
    const view = render(<PoolWantsPanel poolAddress="0xpool" />);
    expect(screen.getByText("Loading Wants…")).toBeTruthy();

    state.query.isPending = false;
    state.query.isError = true;
    view.rerender(<PoolWantsPanel poolAddress="0xpool" />);
    expect(screen.getByText("Couldn't load Wants for this pool.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(state.query.refetch).toHaveBeenCalled();

    state.query.isError = false;
    state.query.data = { pages: [{ wants: [] }] };
    view.rerender(<PoolWantsPanel poolAddress="0xpool" />);
    expect(screen.getByText("No Wants are connected to this pool yet.")).toBeTruthy();
  });
});
