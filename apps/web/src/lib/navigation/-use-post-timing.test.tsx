import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { writePostTimingPreference } from "./catalog-filter-preference-storage";
import { usePostTiming } from "./use-post-timing";

const mocks = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => mocks.search,
  useNavigate: () => mocks.navigate,
}));

beforeEach(() => {
  window.localStorage.clear();
  mocks.search = {};
  mocks.navigate.mockReset();
});

describe("usePostTiming", () => {
  it("defaults to Future and restores an owner-scoped non-default preference", async () => {
    expect(renderHook(() => usePostTiming("guest")).result.current.timing).toBe("future");

    writePostTimingPreference("account:0xabc", "all");
    renderHook(() => usePostTiming("account:0xabc"));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledOnce());
    const update = mocks.navigate.mock.calls[0]?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(update({ tab: "posts" })).toEqual({
      tab: "posts",
      timing: "all",
      posted: undefined,
    });
  });

  it("keeps an explicit link ahead of saved state", () => {
    mocks.search = { timing: "past" };
    writePostTimingPreference("guest", "all");
    const { result } = renderHook(() => usePostTiming("guest"));

    expect(result.current.timing).toBe("past");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("checks a newly selected owner's preference without reusing the previous owner", async () => {
    writePostTimingPreference("account:0xdef", "past");
    const hook = renderHook(({ owner }) => usePostTiming(owner), {
      initialProps: { owner: "account:0xabc" as string },
    });
    expect(mocks.navigate).not.toHaveBeenCalled();

    hook.rerender({ owner: "account:0xdef" });
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledOnce());
  });

  it("writes Past explicitly and removes Future from the URL", () => {
    const { result } = renderHook(() => usePostTiming("guest"));
    act(() => result.current.setTiming("past"));
    let update = mocks.navigate.mock.calls[0]?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(update({ tab: "posts" })).toEqual({ tab: "posts", timing: "past", posted: undefined });

    act(() => result.current.setTiming("future"));
    update = mocks.navigate.mock.calls[1]?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(update({ tab: "posts", timing: "past" })).toEqual({
      tab: "posts",
      timing: undefined,
      posted: undefined,
    });
  });
});
