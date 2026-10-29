import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ health: vi.fn(), system: vi.fn() }));
vi.mock("#/lib/relayer-config", () => ({
  relayerClient: { getHealth: (...args: unknown[]) => state.health(...args) },
}));
vi.mock("#/lib/api", () => ({
  clcApi: {
    admin: {},
    accounts: {},
    auth: { getSystem: (...args: unknown[]) => state.system(...args) },
  },
}));

import { useRelayDesk } from "./use-dashboard-metrics";

beforeEach(() => {
  state.health.mockReset().mockResolvedValue({
    result: { relayerAddress: undefined, chainId: 100, idempotentRelay: true },
  });
  state.system.mockReset().mockResolvedValue({ systemSigner: "0x123", build: "build-1" });
});

describe("useRelayDesk", () => {
  it("combines relayer health with the current platform signer", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRelayDesk(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      relayerAddress: "",
      chainId: 100,
      idempotentRelay: true,
      systemSigner: "0x123",
      build: "build-1",
    });
  });
});
