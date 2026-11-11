import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { POSTED_WITHIN_PREFERENCE_NAME } from "./catalog-filter-preference-storage";
import { usePostedWithin } from "./use-posted-within";
import { ownerScopedKey } from "#/lib/storage/owner-tier-key";

const mocks = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => mocks.search,
  useNavigate: () => mocks.navigate,
}));

function wrapper({ children }: { children: ReactNode }) {
  return children;
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.search = {};
  mocks.navigate = vi.fn();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("usePostedWithin", () => {
  it("defaults to 1 month when the URL omits posted", () => {
    const { result } = renderHook(() => usePostedWithin("guest"), { wrapper });
    expect(result.current.posted).toBe("1m");
  });

  it("restores a stored window when the URL has none", async () => {
    window.localStorage.setItem(ownerScopedKey("guest", POSTED_WITHIN_PREFERENCE_NAME), "all");
    renderHook(() => usePostedWithin("guest"), { wrapper });
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledOnce());
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: ".", replace: true }),
    );
    const search = mocks.navigate.mock.calls[0]?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(search({})).toEqual({ posted: "all" });
  });

  it("does not restore over an explicit window", () => {
    mocks.search = { posted: "3m" };
    window.localStorage.setItem(ownerScopedKey("guest", POSTED_WITHIN_PREFERENCE_NAME), "all");
    const { result } = renderHook(() => usePostedWithin("guest"), { wrapper });
    expect(result.current.posted).toBe("3m");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("keeps every selected window explicit in the URL", () => {
    const { result } = renderHook(() => usePostedWithin("guest"), { wrapper });
    act(() => result.current.setPosted("all"));
    const search = mocks.navigate.mock.calls[0]?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(search({ tab: "posts" })).toEqual({ tab: "posts", posted: "all" });
    act(() => result.current.setPosted("1m"));
    const again = mocks.navigate.mock.calls[1]?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(again({ tab: "posts", posted: "all" })).toEqual({ tab: "posts", posted: "1m" });
  });
});
