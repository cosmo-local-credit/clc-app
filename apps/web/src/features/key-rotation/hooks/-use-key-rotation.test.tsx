import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  replaceSignInCard: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("../api/replace-sign-in-card", () => ({ replaceSignInCard: mocks.replaceSignInCard }));
vi.mock("wagmi/actions", () => ({ connect: mocks.connect, disconnect: mocks.disconnect }));
vi.mock("#/providers/web3-config", () => ({ wagmiConfig: {}, pkConnector: { id: "private-key" } }));

import { getStoredKey, storePrivateKey } from "#/connectors/privateKey";
import { clearIdentitySecrets } from "#/features/auth/api/identity-reset";
import { abortWalletSwitch } from "#/lib/wallet-session";

import { useRotationSession } from "../state/rotation-session";
import { useSwitchToNewCard } from "./use-key-rotation";

const OLD_KEY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const OLD = privateKeyToAccount(OLD_KEY).address;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function rotated() {
  const { newAddress } = useRotationSession.getState();
  return {
    userId: 1,
    role: "USER",
    address: newAddress,
    oldAddress: OLD,
    movedPasskeys: [],
    replayed: false,
  };
}

afterEach(() => {
  localStorage.clear();
  useRotationSession.getState().clear();
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("useSwitchToNewCard", () => {
  it("connects the new card once the account has moved", async () => {
    storePrivateKey(OLD_KEY);
    useRotationSession.getState().begin(OLD, { kind: "card", key: OLD_KEY });
    const newKey = useRotationSession.getState().newKey;
    mocks.replaceSignInCard.mockImplementation(async () => rotated());
    const { result } = renderHook(() => useSwitchToNewCard(), { wrapper });

    act(() => result.current.mutate("card"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getStoredKey()).toBe(newKey);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(useRotationSession.getState().step).toBe("moving");
  });

  it("lets a sign-out during the request win over its late answer", async () => {
    storePrivateKey(OLD_KEY);
    useRotationSession.getState().begin(OLD, { kind: "card", key: OLD_KEY });
    const answer = deferred<ReturnType<typeof rotated>>();
    const response = rotated();
    mocks.replaceSignInCard.mockReturnValue(answer.promise);
    const { result } = renderHook(() => useSwitchToNewCard(), { wrapper });

    act(() => result.current.mutate("card"));
    await waitFor(() => expect(mocks.replaceSignInCard).toHaveBeenCalled());

    // What sign-out does before its first await (home-page.tsx).
    abortWalletSwitch();
    clearIdentitySecrets("none");
    answer.resolve(response);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getStoredKey()).toBeNull();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(useRotationSession.getState().newKey).toBeNull();
  });
});
