import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    isLoading: false,
    address: undefined as `0x${string}` | undefined,
  },
  verification: {
    pools: [] as Array<{ chainId: number | null; address: `0x${string}` }>,
    status: "ready" as "loading" | "ready" | "error",
    retry: vi.fn(),
  },
  holder: undefined as `0x${string}` | undefined,
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mocks.auth,
}));
vi.mock("#/features/pools/hooks/use-creditable-pools", () => ({
  useCreditablePools: (holder: `0x${string}` | undefined) => {
    mocks.holder = holder;
    return mocks.verification;
  },
}));

import { useCreditableBrowse } from "./use-creditable-browse";

beforeEach(() => {
  mocks.auth.isAuthenticated = false;
  mocks.auth.isLoading = false;
  mocks.auth.address = undefined;
  mocks.verification.pools = [];
  mocks.verification.status = "ready";
  mocks.holder = undefined;
});

describe("useCreditableBrowse", () => {
  it("leaves absent Credit off without blocking public results", () => {
    const { result } = renderHook(() => useCreditableBrowse(undefined));
    expect(result.current.enabled).toBe(false);
    expect(result.current.blocksResults).toBe(false);
    expect(mocks.holder).toBeUndefined();
  });

  it("blocks an explicit guest Credit link instead of broadening it", () => {
    const { result } = renderHook(() => useCreditableBrowse("true"));
    expect(result.current.enabled).toBe(true);
    expect(result.current.poolRefs).toBeUndefined();
    expect(result.current.blocksResults).toBe(true);
  });

  it.each(["loading", "error"] as const)(
    "blocks authenticated results while verification is %s",
    (status) => {
      mocks.auth.isAuthenticated = true;
      mocks.auth.address = "0x1111111111111111111111111111111111111111";
      mocks.verification.status = status;
      const { result } = renderHook(() => useCreditableBrowse(true));
      expect(mocks.holder).toBe(mocks.auth.address);
      expect(result.current.blocksResults).toBe(true);
    },
  );

  it("returns canonical verified pool references and unblocks results", () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.address = "0x1111111111111111111111111111111111111111";
    mocks.verification.pools = [
      { chainId: 100, address: "0x2222222222222222222222222222222222222222" },
    ];
    const { result } = renderHook(() => useCreditableBrowse(true));
    expect(result.current.poolRefs).toEqual(mocks.verification.pools);
    expect(result.current.blocksResults).toBe(false);
  });

  it("blocks the checked empty state and rejects malformed URL state", () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.address = "0x1111111111111111111111111111111111111111";
    const empty = renderHook(() => useCreditableBrowse(true));
    expect(empty.result.current.poolRefs).toEqual([]);
    expect(empty.result.current.blocksResults).toBe(true);
    empty.unmount();

    const invalid = renderHook(() => useCreditableBrowse(["true", "false"]));
    expect(invalid.result.current.parsed).toEqual({ ok: false });
    expect(invalid.result.current.blocksResults).toBe(true);
  });
});
