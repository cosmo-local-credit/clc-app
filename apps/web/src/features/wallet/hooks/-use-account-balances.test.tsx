import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  getAccountIssuedTokens: vi.fn(),
  getAccountTokens: vi.fn(),
  getAccountTransfers: vi.fn(),
  getLatestAccountTokens: vi.fn(),
}));

vi.mock("@clc/api/features/accounts/client", () => mocks);

// The app-owned client is the seam the code now goes through. Build it from
// the already-mocked resource modules above so their overrides still apply.
vi.mock("#/lib/api/accounts", async () => ({
  accountsClient: await import("@clc/api/features/accounts/client"),
}));

import {
  useAccountTokensInfinite,
  useAccountTransfersInfinite,
  useAllAccountIssuedTokens,
  useAllAccountTokens,
} from "./use-account-balances";

const ADDRESS = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

/** Fake timers make `waitFor` useless here, so the clock is driven by hand. */
function tick(ms: number) {
  return act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  // Only the interval timers are faked: React's act() and react-query's
  // notifier run on queueMicrotask, which must stay real or nothing settles.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  mocks.getAccountTokens.mockReset().mockResolvedValue({ tokens: [] });
  mocks.getAccountTransfers.mockReset().mockResolvedValue({ transfers: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("account balance polling", () => {
  // Pool detail, send, voucher detail and the off-ramp sheet all need a balance
  // lookup. None of them should leave a 5s poll running against the account.
  it("fetches once and stops when a screen only needs a balance lookup", async () => {
    const { result } = renderHook(() => useAccountTokensInfinite(ADDRESS), { wrapper: wrapper() });

    await tick(0);
    expect(result.current.isSuccess).toBe(true);
    expect(mocks.getAccountTokens).toHaveBeenCalledTimes(1);

    await tick(30_000);
    expect(mocks.getAccountTokens).toHaveBeenCalledTimes(1);
  });

  it("keeps polling for the screens whose job is a live list", async () => {
    renderHook(() => useAccountTokensInfinite(ADDRESS, { poll: true }), { wrapper: wrapper() });

    await tick(0);
    expect(mocks.getAccountTokens).toHaveBeenCalledTimes(1);

    await tick(16_000);
    expect(mocks.getAccountTokens.mock.calls.length).toBeGreaterThan(1);
  });

  it("polls transfers only for the activity screens", async () => {
    renderHook(() => useAccountTransfersInfinite(ADDRESS), { wrapper: wrapper() });
    await tick(30_000);
    expect(mocks.getAccountTransfers).toHaveBeenCalledTimes(1);

    mocks.getAccountTransfers.mockClear();
    renderHook(() => useAccountTransfersInfinite(ADDRESS, { poll: true }), { wrapper: wrapper() });
    await tick(16_000);
    expect(mocks.getAccountTransfers.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("complete account holdings", () => {
  it("drains every token page instead of stopping at the latest or first page", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: 200 - index }));
    const finalToken = { id: 99 };
    mocks.getAccountTokens.mockImplementation(({ cursor }: { cursor?: number }) =>
      cursor === undefined
        ? Promise.resolve({ tokens: firstPage, last: 100 })
        : Promise.resolve({ tokens: [finalToken], last: 99 }),
    );

    const { result } = renderHook(() => useAllAccountTokens(ADDRESS), { wrapper: wrapper() });

    await tick(0);
    await tick(0);
    await tick(1);
    expect(mocks.getAccountTokens).toHaveBeenCalledTimes(2);
    expect(mocks.getAccountTokens.mock.calls[1]?.[0]).toMatchObject({ cursor: 100, next: true });
    expect(result.current.tokens).toHaveLength(101);
    expect(result.current.isPending).toBe(false);
  });
});

describe("issued vouchers", () => {
  it("drains every page and keeps polling with the balance list it splits", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: 200 - index }));
    mocks.getAccountIssuedTokens
      .mockReset()
      .mockImplementation(({ cursor }: { cursor?: number }) =>
        cursor === undefined
          ? Promise.resolve({ tokens: firstPage, last: 101 })
          : Promise.resolve({ tokens: [{ id: 100 }], last: 100 }),
      );

    const { result } = renderHook(() => useAllAccountIssuedTokens(ADDRESS), {
      wrapper: wrapper(),
    });

    await tick(0);
    await tick(0);
    await tick(1);
    expect(mocks.getAccountIssuedTokens.mock.calls[1]?.[0]).toMatchObject({
      cursor: 101,
      next: true,
    });
    expect(result.current.tokens).toHaveLength(101);
    expect(result.current.isPending).toBe(false);

    const drained = mocks.getAccountIssuedTokens.mock.calls.length;
    await tick(16_000);
    expect(mocks.getAccountIssuedTokens.mock.calls.length).toBeGreaterThan(drained);
  });
});
