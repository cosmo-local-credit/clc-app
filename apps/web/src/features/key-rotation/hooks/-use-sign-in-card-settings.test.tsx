import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ relink: vi.fn() }));
vi.mock("wagmi", () => ({ useConnection: () => ({ connector: { id: "private-key" } }) }));
vi.mock("../api/relink-passkey", () => ({ relinkMovedPasskeys: mocks.relink }));
vi.mock("#/providers/web3-config", () => ({ wagmiConfig: {}, pkConnector: { id: "private-key" } }));

import { storePrivateKey } from "#/connectors/privateKey";

import { useSignInCardSettings } from "./use-sign-in-card-settings";

const KEY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const ADDRESS = "0x6a347bA6B1eC10348478377c5fCeE7Ceb6921A69";

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  storePrivateKey(KEY);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const result = url.includes("/auth/webauthn/credentials")
        ? { address: ADDRESS, credentials: [] }
        : { rotations: [] };
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  mocks.relink.mockReset();
});

describe("useSignInCardSettings", () => {
  it("keeps a passkey move started before a layout switch busy afterwards", async () => {
    let settle!: () => void;
    mocks.relink.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    const before = renderHook(() => useSignInCardSettings(ADDRESS), { wrapper });
    act(() => before.result.current.finishPasskeyMove());
    await waitFor(() => expect(mocks.relink).toHaveBeenCalledTimes(1));
    before.unmount();

    const after = renderHook(() => useSignInCardSettings(ADDRESS), { wrapper });
    expect(after.result.current.relinking).toBe(true);

    await act(async () => settle());
    await waitFor(() => expect(after.result.current.relinking).toBe(false));
  });
});
