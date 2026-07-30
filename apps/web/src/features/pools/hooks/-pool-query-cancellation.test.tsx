import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { usePoolVouchersInfinite } from "./use-pool-vouchers";
import { useUserPoolByAddress, useUserPoolsInfinite } from "./use-user-pools";

const POOL_ADDRESS = "0x1111111111111111111111111111111111111111";

const fetchMock = vi.fn();

function jsonResponse(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function signals(): (AbortSignal | undefined)[] {
  return fetchMock.mock.calls.map(
    ([, init]) => (init as RequestInit | undefined)?.signal ?? undefined,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pool query cancellation", () => {
  it("passes the query signal through the pools list", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ pools: [], first: 0, last: 0 }));

    const { result } = renderHook(() => useUserPoolsInfinite(), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(signals()[0]).toBeInstanceOf(AbortSignal);
  });

  it("passes the query signal through a single pool read", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ pool: { id: 1, address: POOL_ADDRESS, name: "Trade Pool", symbol: "TRD" } }),
    );

    const { result } = renderHook(() => useUserPoolByAddress(POOL_ADDRESS), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(signals()[0]).toBeInstanceOf(AbortSignal);
  });

  it("passes the query signal through the pool vouchers pages", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ vouchers: [], first: 0, last: 0 }));

    const { result } = renderHook(() => usePoolVouchersInfinite(POOL_ADDRESS), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(signals()[0]).toBeInstanceOf(AbortSignal);
  });

  it("aborts the in-flight request when the consumer unmounts", async () => {
    let captured: AbortSignal | undefined;
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      captured = init?.signal ?? undefined;
      return new Promise(() => {});
    });

    const { unmount } = renderHook(() => useUserPoolByAddress(POOL_ADDRESS), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(captured).toBeInstanceOf(AbortSignal));
    expect(captured?.aborted).toBe(false);

    unmount();

    await waitFor(() => expect(captured?.aborted).toBe(true));
  });
});
