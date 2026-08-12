import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { AdminUser } from "@clc/api/features/admin/client";
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

function user(address: string, status: string): AdminUser {
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
  };
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
  it("removes the row from the PENDING list once it is approved", async () => {
    // The bug this covers: approving from the Pending view left an APPROVED
    // account still listed under Pending, because the row was replaced in every
    // cache without checking the filter it was keyed by.
    queryClient.setQueryData(adminKeys.users("PENDING"), [
      user(PENDING_ADDRESS, "PENDING"),
      user(OTHER_ADDRESS, "PENDING"),
    ]);
    approveUser.mockResolvedValue(user(PENDING_ADDRESS, "APPROVED"));

    const { result } = renderHook(() => useApproveUser(), { wrapper });
    result.current.mutate(PENDING_ADDRESS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const pending = queryClient.getQueryData<Array<AdminUser>>(adminKeys.users("PENDING"));
    expect(pending?.map((u) => u.ethereumAddress)).toEqual([OTHER_ADDRESS]);
  });

  it("keeps the row in the APPROVED list, where it now belongs", async () => {
    queryClient.setQueryData(adminKeys.users("APPROVED"), [user(PENDING_ADDRESS, "PENDING")]);
    approveUser.mockResolvedValue(user(PENDING_ADDRESS, "APPROVED"));

    const { result } = renderHook(() => useApproveUser(), { wrapper });
    result.current.mutate(PENDING_ADDRESS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const approved = queryClient.getQueryData<Array<AdminUser>>(adminKeys.users("APPROVED"));
    expect(approved).toHaveLength(1);
    expect(approved?.[0]?.status).toBe("APPROVED");
  });

  it("updates the row in the unfiltered list without dropping it", async () => {
    queryClient.setQueryData(adminKeys.users(), [
      user(PENDING_ADDRESS, "PENDING"),
      user(OTHER_ADDRESS, "APPROVED"),
    ]);
    approveUser.mockResolvedValue(user(PENDING_ADDRESS, "APPROVED"));

    const { result } = renderHook(() => useApproveUser(), { wrapper });
    result.current.mutate(PENDING_ADDRESS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const all = queryClient.getQueryData<Array<AdminUser>>(adminKeys.users());
    expect(all).toHaveLength(2);
    expect(all?.find((u) => u.ethereumAddress === PENDING_ADDRESS)?.status).toBe("APPROVED");
  });

  it("leaves other accounts untouched", async () => {
    queryClient.setQueryData(adminKeys.users("PENDING"), [user(OTHER_ADDRESS, "PENDING")]);
    approveUser.mockResolvedValue(user(PENDING_ADDRESS, "APPROVED"));

    const { result } = renderHook(() => useApproveUser(), { wrapper });
    result.current.mutate(PENDING_ADDRESS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const pending = queryClient.getQueryData<Array<AdminUser>>(adminKeys.users("PENDING"));
    expect(pending?.map((u) => u.ethereumAddress)).toEqual([OTHER_ADDRESS]);
  });

  it("matches the address case-insensitively, since the backend checksums it", async () => {
    queryClient.setQueryData(adminKeys.users("PENDING"), [
      user(PENDING_ADDRESS.toLowerCase(), "PENDING"),
    ]);
    approveUser.mockResolvedValue(user(PENDING_ADDRESS, "APPROVED"));

    const { result } = renderHook(() => useApproveUser(), { wrapper });
    result.current.mutate(PENDING_ADDRESS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData<Array<AdminUser>>(adminKeys.users("PENDING"))).toEqual([]);
  });
});
