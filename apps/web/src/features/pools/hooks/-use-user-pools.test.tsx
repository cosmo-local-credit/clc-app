import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useUserPoolByAddress, useUserPoolsInfinite } from "./use-user-pools";

const POOL_ADDRESS = "0xAa00000000000000000000000000000000000001";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function response(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

function pool(id: number, address = `0x${id.toString(16).padStart(40, "0")}`) {
  return { id, address, name: `Pool ${id}`, symbol: `P${id}` };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pool queries", () => {
  it("recovers a retired pool only through a viewer-scoped protected read", async () => {
    const owner = "0x2222222222222222222222222222222222222222";
    const fetcher = vi.fn().mockImplementation((url: string) =>
      url.includes("/users/me/owned-pools/")
        ? Promise.resolve(
            response({ pool: { ...pool(1, POOL_ADDRESS), active: false, ownerAddress: owner } }),
          )
        : Promise.resolve({
            ok: false,
            status: 404,
            text: async () => JSON.stringify({ ok: false, description: "Pool not found" }),
          }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useUserPoolByAddress(POOL_ADDRESS, owner), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.data?.active).toBe(false));
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/users/me/owned-pools/${POOL_ADDRESS}`),
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
  });

  it("does not attempt owner recovery for a guest", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ ok: false, description: "Pool not found" }),
    });
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useUserPoolByAddress(POOL_ADDRESS), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).not.toContain("/users/me/");
  });

  it("loads successive pool pages and stops when the backend returns a short page", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ pools: [pool(1), pool(2)], first: 1, last: 2 }))
      .mockResolvedValueOnce(response({ pools: [pool(3)], first: 3, last: 3 }));
    vi.stubGlobal("fetch", fetcher);

    const { result } = renderHook(() => useUserPoolsInfinite(2), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(
      result.current.data?.pages.flatMap((page) => page.pools.map((item) => item.name)),
    ).toEqual(["Pool 1", "Pool 2", "Pool 3"]);
    expect(result.current.hasNextPage).toBe(false);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/api/v2/pools?perPage=2"),
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/api/v2/pools?perPage=2&cursor=2&next=true"),
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("waits for an address before loading a pool detail", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ pool: pool(1, POOL_ADDRESS) }));
    vi.stubGlobal("fetch", fetcher);

    const { result, rerender } = renderHook(
      ({ address }: { address: string | undefined }) => useUserPoolByAddress(address),
      {
        initialProps: { address: undefined as string | undefined },
        wrapper: createWrapper(),
      },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetcher).not.toHaveBeenCalled();

    rerender({ address: POOL_ADDRESS });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("Pool 1");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v2/pools/${POOL_ADDRESS}`),
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });
});
