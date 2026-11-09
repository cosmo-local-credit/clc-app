import type { AccountActivityItem } from "@clc/api/features/accounts/client";
import { accountKeys } from "@clc/api/features/accounts/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ME = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";
const OTHER = "0x6E4c0f6A3eAb2d7e1C2b4c5B9c4a1E2d3F4a5B6c";

const mocks = vi.hoisted(() => ({
  getAccountActivity: vi.fn(),
  auth: { isAuthenticated: true, address: undefined as string | undefined },
  owner: { value: null as string | null },
}));

vi.mock("#/lib/api/accounts", () => ({
  accountsClient: { getAccountActivity: mocks.getAccountActivity },
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mocks.auth,
}));
vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => mocks.owner.value,
}));

import { useActivityUnseen, useActivityVisit } from "./use-activity-unseen";
import { useAccountActivityInfinite } from "./use-account-balances";

const MARKER_KEY = `clc.t.${ME.toLowerCase()}.activity.seen.v1`;
const T1 = "2026-11-09T10:00:00Z";
const T2 = "2026-11-09T10:00:05Z";
const T3 = "2026-11-09T10:00:10Z";

function row(id: number, dateBlock: string, direction: "IN" | "OUT" = "IN"): AccountActivityItem {
  return {
    kind: direction === "IN" ? "received" : "sent",
    direction,
    id,
    txHash: `0x${id.toString(16).padStart(2, "0")}`,
    dateBlock,
    success: true,
    transfer: {
      tokenAddress: OTHER,
      tokenName: "KFP",
      tokenSymbol: "KFP",
      tokenDecimals: 6,
      amount: "1000000",
    },
    senderAddress: direction === "IN" ? OTHER : ME,
    recipientAddress: direction === "IN" ? ME : OTHER,
    counterpartyAddress: OTHER,
    hasNote: false,
  };
}

function storedMarker() {
  const raw = window.localStorage.getItem(MARKER_KEY);
  return raw ? (JSON.parse(raw) as { at: string; keys: string[] }) : null;
}

const clients: QueryClient[] = [];

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.auth.isAuthenticated = true;
  mocks.auth.address = ME;
  mocks.owner.value = ME.toLowerCase();
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("useActivityUnseen", () => {
  it("seeds a first marker silently, so a new device starts at zero", async () => {
    mocks.getAccountActivity.mockResolvedValue({ activity: [row(2, T2), row(1, T1)] });
    const { result } = renderHook(() => useActivityUnseen(), { wrapper: wrapper() });

    await waitFor(() => expect(storedMarker()).toEqual({ at: T2, keys: ["2:0x02"] }));
    expect(result.current.count).toBe(0);
    expect(mocks.getAccountActivity).toHaveBeenCalledWith(
      { address: ME, perPage: 20 },
      expect.any(AbortSignal),
    );
  });

  it("writes nothing when the read fails", async () => {
    mocks.getAccountActivity.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useActivityUnseen(), { wrapper: wrapper() });

    await waitFor(() => expect(mocks.getAccountActivity).toHaveBeenCalled());
    await act(async () => {});
    expect(storedMarker()).toBeNull();
    expect(result.current.count).toBe(0);
  });

  it("counts incoming rows newer than the marker, not the person's own", async () => {
    window.localStorage.setItem(MARKER_KEY, JSON.stringify({ at: T1, keys: ["1:0x01"] }));
    mocks.getAccountActivity.mockResolvedValue({
      activity: [row(4, T3), row(3, T3, "OUT"), row(2, T2), row(1, T1)],
    });
    const { result } = renderHook(() => useActivityUnseen(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.count).toBe(2));
    expect(storedMarker()).toEqual({ at: T1, keys: ["1:0x01"] });
  });

  it("refetches when a realtime push lands in the inbox", async () => {
    window.localStorage.setItem(MARKER_KEY, JSON.stringify({ at: T1, keys: ["1:0x01"] }));
    mocks.getAccountActivity.mockResolvedValue({ activity: [row(1, T1)] });
    const { result } = renderHook(() => useActivityUnseen(), { wrapper: wrapper() });
    await waitFor(() => expect(mocks.getAccountActivity).toHaveBeenCalledTimes(1));
    expect(result.current.count).toBe(0);

    mocks.getAccountActivity.mockResolvedValue({ activity: [row(2, T2), row(1, T1)] });
    act(() => {
      window.dispatchEvent(new Event("clc-notification-inbox-changed"));
    });

    await waitFor(() => expect(result.current.count).toBe(1));
  });

  it("counts nothing and reads nothing for a guest", async () => {
    mocks.auth.isAuthenticated = false;
    mocks.owner.value = "guest";
    const { result } = renderHook(() => useActivityUnseen(), { wrapper: wrapper() });

    await act(async () => {});
    expect(result.current.count).toBe(0);
    expect(mocks.getAccountActivity).not.toHaveBeenCalled();
  });

  it("reads nothing while the owner is undecided", async () => {
    mocks.owner.value = null;
    renderHook(() => useActivityUnseen(), { wrapper: wrapper() });

    await act(async () => {});
    expect(mocks.getAccountActivity).not.toHaveBeenCalled();
  });

  it("finds an unread receipt beyond twenty newer outgoing transfers on a cold read", async () => {
    window.localStorage.setItem(MARKER_KEY, JSON.stringify({ at: T1, keys: ["1:0x01"] }));
    const outgoing = Array.from({ length: 20 }, (_, index) => row(22 - index, T3, "OUT"));
    mocks.getAccountActivity.mockImplementation(({ cursor }: { cursor?: number }) =>
      Promise.resolve(
        cursor === undefined
          ? { activity: outgoing, last: 3 }
          : { activity: [row(2, T2), row(1, T1)] },
      ),
    );
    const { result } = renderHook(() => useActivityUnseen(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.count).toBe(1));
    expect(mocks.getAccountActivity).toHaveBeenCalledWith(
      { address: ME, perPage: 20, cursor: 3, next: true },
      expect.any(AbortSignal),
    );
    expect(storedMarker()).toEqual({ at: T1, keys: ["1:0x01"] });
  });

  it("retains the previous unread count if a later page fails during refresh", async () => {
    window.localStorage.setItem(MARKER_KEY, JSON.stringify({ at: T1, keys: ["1:0x01"] }));
    mocks.getAccountActivity.mockResolvedValue({ activity: [row(2, T2), row(1, T1)] });
    const provider = wrapper();
    const client = clients.at(-1)!;
    const { result } = renderHook(() => useActivityUnseen(), { wrapper: provider });
    await waitFor(() => expect(result.current.count).toBe(1));

    mocks.getAccountActivity.mockImplementation(({ cursor }: { cursor?: number }) =>
      cursor === undefined
        ? Promise.resolve({
            activity: Array.from({ length: 20 }, (_, index) => row(22 - index, T3, "OUT")),
            last: 3,
          })
        : Promise.reject(new Error("older page failed")),
    );
    act(() => {
      window.dispatchEvent(new Event("clc-notification-inbox-changed"));
    });
    await waitFor(() =>
      expect(client.getQueryState(accountKeys.activityLatest(ME, 20, T1))?.status).toBe("error"),
    );
    expect(result.current.count).toBe(1);
    expect(storedMarker()).toEqual({ at: T1, keys: ["1:0x01"] });
  });
});

describe("useActivityVisit", () => {
  it("clears the count on open and keeps the unread rows marked for the visit", async () => {
    window.localStorage.setItem(MARKER_KEY, JSON.stringify({ at: T1, keys: ["1:0x01"] }));
    const items = [row(3, T3, "OUT"), row(2, T2), row(1, T1)];
    mocks.getAccountActivity.mockResolvedValue({ activity: items });
    const { result } = renderHook(
      () => ({ isNew: useActivityVisit(items), unseen: useActivityUnseen() }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(storedMarker()).toEqual({ at: T3, keys: ["3:0x03"] }));
    expect(result.current.unseen.count).toBe(0);
    expect(result.current.isNew(items[1])).toBe(true);
    expect(result.current.isNew(items[0])).toBe(false);
    expect(result.current.isNew(items[2])).toBe(false);
  });

  it("marks rows the screen shows before the newest page has them", async () => {
    window.localStorage.setItem(MARKER_KEY, JSON.stringify({ at: T1, keys: ["1:0x01"] }));
    mocks.getAccountActivity.mockResolvedValue({ activity: [row(1, T1)] });
    const shown = [row(2, T2), row(1, T1)];
    renderHook(() => useActivityVisit(shown), { wrapper: wrapper() });

    await waitFor(() => expect(storedMarker()).toEqual({ at: T2, keys: ["2:0x02"] }));
  });

  it("marks nothing new on the first visit from a fresh device", async () => {
    const items = [row(2, T2), row(1, T1)];
    mocks.getAccountActivity.mockResolvedValue({ activity: items });
    const { result } = renderHook(() => useActivityVisit(items), { wrapper: wrapper() });

    await waitFor(() => expect(storedMarker()).not.toBeNull());
    expect(result.current(items[0])).toBe(false);
  });

  it("keeps background pushes unread until their rows are displayed in the visible page", async () => {
    window.localStorage.setItem(MARKER_KEY, JSON.stringify({ at: T1, keys: ["1:0x01"] }));
    mocks.getAccountActivity.mockResolvedValue({ activity: [row(1, T1)] });
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const { result, rerender } = renderHook(
      ({ shown }: { shown: AccountActivityItem[] }) => ({
        isNew: useActivityVisit(shown),
        unseen: useActivityUnseen(),
      }),
      { initialProps: { shown: [row(1, T1)] }, wrapper: wrapper() },
    );
    await waitFor(() => expect(mocks.getAccountActivity).toHaveBeenCalledTimes(1));
    act(() => {
      visibility.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    mocks.getAccountActivity.mockResolvedValue({ activity: [row(2, T2), row(1, T1)] });
    act(() => {
      window.dispatchEvent(new Event("clc-notification-inbox-changed"));
    });
    await waitFor(() => expect(result.current.unseen.count).toBe(1));

    rerender({ shown: [row(2, T2), row(1, T1)] });
    expect(storedMarker()).toEqual({ at: T1, keys: ["1:0x01"] });
    act(() => {
      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(result.current.unseen.count).toBe(0));
    expect(storedMarker()).toEqual({ at: T2, keys: ["2:0x02"] });
    expect(result.current.isNew(row(2, T2))).toBe(true);
  });

  it.each([
    { state: "pending or filtered", shown: undefined },
    { state: "empty", shown: [] },
  ])("does not acknowledge badge rows absent from a $state feed", async ({ shown }) => {
    window.localStorage.setItem(MARKER_KEY, JSON.stringify({ at: T1, keys: ["1:0x01"] }));
    mocks.getAccountActivity.mockResolvedValue({ activity: [row(2, T2), row(1, T1)] });
    const { result } = renderHook(
      () => ({
        isNew: useActivityVisit(shown),
        unseen: useActivityUnseen(),
      }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.unseen.count).toBe(1));
    expect(storedMarker()).toEqual({ at: T1, keys: ["1:0x01"] });
  });

  it.each(["feed", "badge"] as const)(
    "uses the displayed feed when the %s request fails",
    async (failed) => {
      window.localStorage.setItem(MARKER_KEY, JSON.stringify({ at: T1, keys: ["1:0x01"] }));
      mocks.getAccountActivity.mockImplementation((params: { cursor?: number }) => {
        const feed = Object.hasOwn(params, "cursor");
        return feed === (failed === "feed")
          ? Promise.reject(new Error(`${failed} failed`))
          : Promise.resolve({ activity: [row(2, T2), row(1, T1)] });
      });
      const { result } = renderHook(
        () => {
          const feed = useAccountActivityInfinite(ME);
          const shown = useMemo(
            () => feed.data?.pages.flatMap((page) => page.activity),
            [feed.data],
          );
          useActivityVisit(feed.isSuccess ? shown : undefined);
          return { feed, unseen: useActivityUnseen() };
        },
        { wrapper: wrapper() },
      );

      await waitFor(() => expect(result.current.feed.isPending).toBe(false));
      if (failed === "feed") {
        await waitFor(() => expect(result.current.unseen.count).toBe(1));
        expect(storedMarker()).toEqual({ at: T1, keys: ["1:0x01"] });
      } else {
        await waitFor(() => expect(storedMarker()?.at).toBe(T2));
        expect(result.current.unseen.count).toBe(0);
      }
    },
  );
});
