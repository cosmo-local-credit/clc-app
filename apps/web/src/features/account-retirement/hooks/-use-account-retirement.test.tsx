import type { SessionResult } from "@clc/api/features/auth/client";
import type { AccountLifecycleState } from "@clc/core/features/account-retirement/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b2";

const { wallet, client, cleared } = vi.hoisted(() => ({
  wallet: { current: undefined as string | undefined },
  client: { retire: vi.fn(), restore: vi.fn() },
  cleared: vi.fn(),
}));

vi.mock("wagmi", () => ({ useConnection: () => ({ address: wallet.current }) }));
vi.mock("#/lib/api/account-retirement", () => ({ accountRetirementClient: client }));
vi.mock("#/features/auth/api/identity-reset", () => ({
  clearScopedQueries: () => cleared(),
  clearInMemoryDrafts: () => undefined,
}));

import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { useRestoreAccount, useRetireAccount } from "./use-account-retirement";

const active: SessionResult = {
  address: A,
  chainId: 100,
  role: "USER",
  accountLifecycle: "ACTIVE",
};
const retiring: AccountLifecycleState = {
  accountLifecycle: "RETIREMENT_SCHEDULED",
  closesAt: "2027-05-11T00:00:00Z",
  capabilities: {
    canUseApp: false,
    canRecoverAssets: true,
    canTransferResources: true,
    canRestoreAccount: true,
  },
  retirement: null,
};
const restored: AccountLifecycleState = {
  accountLifecycle: "ACTIVE",
  closesAt: null,
  capabilities: {
    canUseApp: true,
    canRecoverAssets: true,
    canTransferResources: true,
    canRestoreAccount: false,
  },
  retirement: null,
};

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

beforeEach(() => {
  wallet.current = A;
  client.retire.mockReset();
  client.restore.mockReset();
  cleared.mockReset();
});

describe("retiring and restoring across a wallet switch", () => {
  it("writes the response onto the wallet that asked", async () => {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData([...authSessionQueryKey, A], active);
    client.retire.mockResolvedValue(retiring);
    const { result } = renderHook(() => useRetireAccount(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("");
    });

    const session = queryClient.getQueryData<SessionResult>([...authSessionQueryKey, A]);
    expect(session?.accountLifecycle).toBe("RETIREMENT_SCHEDULED");
    expect(session?.role).toBe("USER");
    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it("does not send another wallet into recovery when A's retire answers after switching to B", async () => {
    const { queryClient, wrapper } = setup();
    const sessionB: SessionResult = { ...active, address: B };
    queryClient.setQueryData([...authSessionQueryKey, A], active);
    queryClient.setQueryData([...authSessionQueryKey, B], sessionB);
    let answer: (value: AccountLifecycleState) => void = () => undefined;
    client.retire.mockReturnValue(
      new Promise<AccountLifecycleState>((resolve) => (answer = resolve)),
    );
    const { result, rerender } = renderHook(() => useRetireAccount(), { wrapper });

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.mutateAsync("");
    });
    wallet.current = B;
    rerender();
    await act(async () => {
      answer(retiring);
      await pending;
    });

    expect(
      queryClient.getQueryData<SessionResult>([...authSessionQueryKey, B])?.accountLifecycle,
    ).toBe("ACTIVE");
    expect(
      queryClient.getQueryData<SessionResult>([...authSessionQueryKey, A])?.accountLifecycle,
    ).toBe("RETIREMENT_SCHEDULED");
    // The switch already cleared A's caches; clearing again would wipe B's.
    expect(cleared).not.toHaveBeenCalled();
  });

  it("does not mark a retired wallet active when A's restore answers after switching to B", async () => {
    const { queryClient, wrapper } = setup();
    const retiredB: SessionResult = {
      ...active,
      address: B,
      role: "USER",
      accountLifecycle: "RETIREMENT_SCHEDULED",
    };
    queryClient.setQueryData([...authSessionQueryKey, A], {
      ...active,
      accountLifecycle: "RETIREMENT_SCHEDULED",
    });
    queryClient.setQueryData([...authSessionQueryKey, B], retiredB);
    let answer: (value: AccountLifecycleState) => void = () => undefined;
    client.restore.mockReturnValue(
      new Promise<AccountLifecycleState>((resolve) => (answer = resolve)),
    );
    const { result, rerender } = renderHook(() => useRestoreAccount(), { wrapper });

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.mutateAsync();
    });
    wallet.current = B;
    rerender();
    await act(async () => {
      answer(restored);
      await pending;
    });

    await waitFor(() =>
      expect(
        queryClient.getQueryData<SessionResult>([...authSessionQueryKey, B])?.accountLifecycle,
      ).toBe("RETIREMENT_SCHEDULED"),
    );
    expect(
      queryClient.getQueryData<SessionResult>([...authSessionQueryKey, A])?.accountLifecycle,
    ).toBe("ACTIVE");
  });
});
