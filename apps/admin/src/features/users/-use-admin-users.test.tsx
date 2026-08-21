import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { AdminUser, AdminUserPage } from "@clc/api/features/admin/client";
import { adminKeys } from "@clc/api/features/admin/queries";

const approveUser = vi.fn();

vi.mock("#/lib/api", () => ({
  clcApi: {
    admin: {
      approveUser: (address: string) => approveUser(address),
      rejectUser: vi.fn(),
      updateUserLimits: vi.fn(),
      listUsers: vi.fn(),
    },
  },
}));

const { useApproveUser } = await import("./use-admin-users");

const PENDING_ADDRESS = "0x33a573149db22e759fB9A38Bcc461C12855c2645";
const OTHER_ADDRESS = "0x4D478F0e1c1b0b3d0F5b8d2cbde4581dB6369abc";

const FIRST_PAGE = { perPage: 25 };
const SEARCHED_PAGE = { perPage: 25, q: "someone" };

function user(address: string, status: string, overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 1,
    ethereumAddress: address,
    name: "Someone",
    email: "someone@example.test",
    phone: "",
    country: "",
    role: "USER",
    status,
    maxPools: 10,
    maxTokens: 20,
    createdAt: "2026-07-24T10:43:16Z",
    updatedAt: "2026-07-24T10:43:16Z",
    avatarUrl: null,
    locationName: null,
    geoLat: null,
    geoLng: null,
    ...overrides,
  };
}

function page(...users: Array<AdminUser>): AdminUserPage {
  return { users, first: 0, last: users.length, receivedCount: users.length };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  approveUser.mockReset();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe("useApproveUser cache writes", () => {
  it("updates the approved row in place, without dropping it from the page", async () => {
    // The row keeps its position: an approval changes no column the directory is
    // searched or ordered by, so it still belongs on the page it was served on.
    queryClient.setQueryData(
      adminKeys.users(FIRST_PAGE),
      page(user(PENDING_ADDRESS, "PENDING"), user(OTHER_ADDRESS, "APPROVED")),
    );
    approveUser.mockResolvedValue(user(PENDING_ADDRESS, "APPROVED", { name: "Renamed" }));

    const { result } = renderHook(() => useApproveUser(), { wrapper });
    result.current.mutate(PENDING_ADDRESS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueryData<AdminUserPage>(adminKeys.users(FIRST_PAGE));
    expect(cached?.users).toHaveLength(2);
    expect(cached?.users[0]?.status).toBe("APPROVED");
    expect(cached?.users[0]?.name).toBe("Renamed");
  });

  it("reaches every cached page, not just the one on screen", async () => {
    // Each set of parameters is its own cache entry, so an operator who searched,
    // approved, then cleared the search must not find the stale row waiting.
    queryClient.setQueryData(adminKeys.users(FIRST_PAGE), page(user(PENDING_ADDRESS, "PENDING")));
    queryClient.setQueryData(
      adminKeys.users(SEARCHED_PAGE),
      page(user(PENDING_ADDRESS, "PENDING")),
    );
    approveUser.mockResolvedValue(user(PENDING_ADDRESS, "APPROVED"));

    const { result } = renderHook(() => useApproveUser(), { wrapper });
    result.current.mutate(PENDING_ADDRESS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    for (const params of [FIRST_PAGE, SEARCHED_PAGE]) {
      const cached = queryClient.getQueryData<AdminUserPage>(adminKeys.users(params));
      expect(cached?.users[0]?.status).toBe("APPROVED");
    }
  });

  it("leaves other accounts untouched", async () => {
    queryClient.setQueryData(adminKeys.users(FIRST_PAGE), page(user(OTHER_ADDRESS, "PENDING")));
    approveUser.mockResolvedValue(user(PENDING_ADDRESS, "APPROVED"));

    const { result } = renderHook(() => useApproveUser(), { wrapper });
    result.current.mutate(PENDING_ADDRESS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueryData<AdminUserPage>(adminKeys.users(FIRST_PAGE));
    expect(cached?.users).toEqual([user(OTHER_ADDRESS, "PENDING")]);
  });

  it("matches the address case-insensitively, since the backend checksums it", async () => {
    queryClient.setQueryData(
      adminKeys.users(FIRST_PAGE),
      page(user(PENDING_ADDRESS.toLowerCase(), "PENDING")),
    );
    approveUser.mockResolvedValue(user(PENDING_ADDRESS, "APPROVED"));

    const { result } = renderHook(() => useApproveUser(), { wrapper });
    result.current.mutate(PENDING_ADDRESS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueryData<AdminUserPage>(adminKeys.users(FIRST_PAGE));
    expect(cached?.users[0]?.status).toBe("APPROVED");
  });

  it("updates the account's own entry, which the detail screen reads", async () => {
    queryClient.setQueryData(adminKeys.user(PENDING_ADDRESS), user(PENDING_ADDRESS, "PENDING"));
    approveUser.mockResolvedValue(user(PENDING_ADDRESS, "APPROVED"));

    const { result } = renderHook(() => useApproveUser(), { wrapper });
    result.current.mutate(PENDING_ADDRESS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData<AdminUser | null>(adminKeys.user(PENDING_ADDRESS))?.status,
    ).toBe("APPROVED");
  });

  it("does not seed an entry nothing is watching", async () => {
    // Approving from the table must not invent a detail entry: it would be a
    // cache hit no request produced, and the next detail visit would trust it.
    approveUser.mockResolvedValue(user(PENDING_ADDRESS, "APPROVED"));

    const { result } = renderHook(() => useApproveUser(), { wrapper });
    result.current.mutate(PENDING_ADDRESS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(adminKeys.user(PENDING_ADDRESS))).toBeUndefined();
  });

  it("marks the directory stale so the server still reconciles", async () => {
    // The write is optimistic: it shows the operator the new state at once, but
    // the server owns the record — and it, not this, decides where a row belongs
    // once a filter is involved. So invalidation must not be downgraded to
    // refetchType: "none".
    queryClient.setQueryData(adminKeys.users(FIRST_PAGE), page(user(PENDING_ADDRESS, "PENDING")));
    approveUser.mockResolvedValue(user(PENDING_ADDRESS, "APPROVED"));

    const { result } = renderHook(() => useApproveUser(), { wrapper });
    result.current.mutate(PENDING_ADDRESS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(adminKeys.users(FIRST_PAGE))?.isInvalidated).toBe(true);
  });
});
