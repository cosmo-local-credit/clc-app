import { BackendApiError } from "@clc/api/client/errors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const WALLET = "0x1111111111111111111111111111111111111111" as const;
const OTHER_WALLET = "0x3333333333333333333333333333333333333333" as const;
const POOL = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    isLoading: false,
    address: undefined as `0x${string}` | undefined,
  },
  reach: vi.fn(),
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mocks.auth,
}));
vi.mock("#/lib/api/credit-router", () => ({
  creditRouterClient: { reach: mocks.reach },
}));

import { useCreditableBrowse } from "./use-creditable-browse";

function reach(pools: string[], overrides: Record<string, unknown> = {}) {
  return {
    depth: 1,
    asOfBlock: 49254469,
    graphVersion: 812,
    stale: false,
    digest: `0x${"ab".repeat(32)}`,
    inputs: [],
    vouchers: [],
    pools: pools.map((address) => ({ address, minHops: 1 })),
    ...overrides,
  };
}

function renderCredit(value: Parameters<typeof useCreditableBrowse>[0], client?: QueryClient) {
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useCreditableBrowse(value), { wrapper }), queryClient };
}

function signIn(address: `0x${string}` = WALLET) {
  mocks.auth.isAuthenticated = true;
  mocks.auth.address = address;
}

beforeEach(() => {
  mocks.auth.isAuthenticated = false;
  mocks.auth.isLoading = false;
  mocks.auth.address = undefined;
  mocks.reach.mockReset();
});

describe("useCreditableBrowse", () => {
  it("leaves absent Credit off without blocking public results or asking the router", () => {
    const { result } = renderCredit(undefined);
    expect(result.current.enabled).toBe(false);
    expect(result.current.blocksResults).toBe(false);
    expect(result.current.scope).toBeUndefined();
    expect(mocks.reach).not.toHaveBeenCalled();
  });

  it("blocks an explicit guest Credit link instead of broadening it, without a request", () => {
    const { result } = renderCredit("1");
    expect(result.current.enabled).toBe(true);
    expect(result.current.poolRefs).toBeUndefined();
    expect(result.current.blocksResults).toBe(true);
    expect(mocks.reach).not.toHaveBeenCalled();
  });

  it("blocks results while the reach is loading", () => {
    signIn();
    mocks.reach.mockReturnValue(new Promise(() => {}));
    const { result } = renderCredit(1);
    expect(result.current.verification.status).toBe("loading");
    expect(result.current.blocksResults).toBe(true);
  });

  it("reports an unavailable router as an error, never as an empty reach", async () => {
    signIn();
    mocks.reach.mockRejectedValue(
      new BackendApiError(503, "router_unavailable", "E27", { retryAfterMs: 0 }),
    );
    const { result } = renderCredit(1);
    await waitFor(() => expect(result.current.verification.status).toBe("error"));
    expect(result.current.poolRefs).toBeUndefined();
    expect(result.current.blocksResults).toBe(true);
  });

  it("resolves the server's reach into a creditDepth scope and the same pools as a list", async () => {
    signIn();
    mocks.reach.mockResolvedValue(reach([POOL]));
    const { result } = renderCredit(1);
    await waitFor(() => expect(result.current.verification.status).toBe("ready"));
    expect(mocks.reach).toHaveBeenCalledWith(1, expect.anything());
    expect(result.current.depth).toBe(1);
    expect(result.current.scope).toEqual({
      depth: 1,
      wallet: WALLET,
      digest: `0x${"ab".repeat(32)}`,
    });
    expect(result.current.poolRefs).toEqual([{ chainId: 100, address: POOL }]);
    expect(result.current.blocksResults).toBe(false);
    expect(result.current.verification.stale).toBe(false);
  });

  it("surfaces a stale graph", async () => {
    signIn();
    mocks.reach.mockResolvedValue(reach([POOL], { stale: true }));
    const { result } = renderCredit(1);
    await waitFor(() => expect(result.current.verification.stale).toBe(true));
  });

  it("blocks the checked empty reach and rejects malformed URL state", async () => {
    signIn();
    mocks.reach.mockResolvedValue(reach([]));
    const empty = renderCredit(1);
    await waitFor(() => expect(empty.result.current.poolRefs).toEqual([]));
    expect(empty.result.current.blocksResults).toBe(true);
    empty.unmount();

    const invalid = renderCredit(["1", "2"]);
    expect(invalid.result.current.parsed).toEqual({ ok: false });
    expect(invalid.result.current.blocksResults).toBe(true);
  });

  it("never reuses one wallet's reach for another wallet on the same cache", async () => {
    signIn(WALLET);
    mocks.reach.mockResolvedValueOnce(reach([POOL]));
    const first = renderCredit(1);
    await waitFor(() => expect(first.result.current.verification.status).toBe("ready"));
    first.unmount();

    signIn(OTHER_WALLET);
    mocks.reach.mockReturnValueOnce(new Promise(() => {}));
    const second = renderCredit(1, first.queryClient);
    expect(second.result.current.poolRefs).toBeUndefined();
    expect(second.result.current.blocksResults).toBe(true);
    expect(mocks.reach).toHaveBeenCalledTimes(2);
  });

  it("asks the router for the selected depth and keys every answer on it", async () => {
    signIn();
    mocks.reach.mockImplementation(async (depth: number) =>
      reach(depth === 2 ? [POOL, OTHER_WALLET] : [POOL], { depth }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const view = renderHook(({ value }) => useCreditableBrowse(value), {
      wrapper,
      initialProps: { value: 2 as 1 | 2 | undefined },
    });
    await waitFor(() => expect(view.result.current.scope?.depth).toBe(2));
    expect(view.result.current.poolRefs).toHaveLength(2);

    view.rerender({ value: 1 });
    await waitFor(() => expect(view.result.current.scope?.depth).toBe(1));
    expect(view.result.current.poolRefs).toHaveLength(1);
    expect(mocks.reach.mock.calls.map(([depth]) => depth)).toEqual([2, 1]);

    view.rerender({ value: undefined });
    expect(view.result.current.enabled).toBe(false);
    expect(view.result.current.scope).toBeUndefined();
  });

  it("never lets an older depth's late answer replace the current one", async () => {
    signIn();
    let finishDepthTwo: (value: unknown) => void = () => {};
    mocks.reach.mockImplementation((depth: number) =>
      depth === 2
        ? new Promise((resolve) => (finishDepthTwo = resolve))
        : Promise.resolve(reach([POOL], { depth: 1 })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    // OFF, then two hops (slow), then quickly back to one hop.
    const view = renderHook(({ value }) => useCreditableBrowse(value), {
      wrapper,
      initialProps: { value: 2 as 1 | 2 | undefined },
    });
    view.rerender({ value: 1 });
    await waitFor(() => expect(view.result.current.scope?.depth).toBe(1));

    // The abandoned depth's request finishes late. It is keyed to depth 2 (and
    // cancelled once nothing reads it), so the one-hop answer stays.
    await act(async () => {
      finishDepthTwo(reach([POOL, OTHER_WALLET], { depth: 2, digest: `0x${"cd".repeat(32)}` }));
      await Promise.resolve();
    });
    expect(view.result.current.scope).toEqual({
      depth: 1,
      wallet: WALLET,
      digest: `0x${"ab".repeat(32)}`,
    });
    expect(view.result.current.poolRefs).toEqual([{ chainId: 100, address: POOL }]);
  });
});
