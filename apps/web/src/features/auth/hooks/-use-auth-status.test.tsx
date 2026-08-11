import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockAccount, mockReconnectAttempted, mockGetSession } = vi.hoisted(() => ({
  mockAccount: {
    address: undefined as `0x${string}` | undefined,
    chainId: undefined as number | undefined,
    connector: undefined as { id: string } | undefined,
    status: "disconnected" as "connected" | "disconnected" | "connecting" | "reconnecting",
  },
  mockReconnectAttempted: { value: true },
  mockGetSession: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useConnection: () => mockAccount,
}));

vi.mock("#/providers/auth-bootstrap", () => ({
  useReconnectAttempted: () => mockReconnectAttempted.value,
}));

vi.mock("@clc/api/features/auth/client", async () => {
  const actual = await vi.importActual<typeof import("@clc/api/features/auth/client")>(
    "@clc/api/features/auth/client",
  );
  return {
    ...actual,
    getSession: () => mockGetSession(),
  };
});

// The app-owned client is the seam the code now goes through. Build it from
// the already-mocked resource modules above so their overrides still apply.
vi.mock("#/lib/api", async () => ({
  clcApi: {
    auth: await import("@clc/api/features/auth/client"),
  },
}));

import { BackendApiError } from "@clc/api/client/errors";
import { useAuthStatus } from "./use-auth-status";

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  mockAccount.address = undefined;
  mockAccount.chainId = undefined;
  mockAccount.connector = undefined;
  mockAccount.status = "disconnected";
  mockReconnectAttempted.value = true;
  mockGetSession.mockReset();
});

describe("useAuthStatus", () => {
  it("is loading before reconnect has been attempted", () => {
    mockReconnectAttempted.value = false;
    const { result } = renderHook(() => useAuthStatus(), { wrapper: createWrapper() });
    expect(result.current.state).toBe("loading");
  });

  it("is guest after reconnect settles with no wallet", () => {
    const { result } = renderHook(() => useAuthStatus(), { wrapper: createWrapper() });
    expect(result.current.state).toBe("guest");
  });

  it("is connectedNoSession when the session endpoint returns null", async () => {
    mockAccount.address = "0x1234567890123456789012345678901234567890";
    mockAccount.status = "connected";
    mockGetSession.mockResolvedValue(null);

    const { result } = renderHook(() => useAuthStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.state).toBe("connectedNoSession"));
  });

  it("is connectedNoSession when the session address does not match the wallet", async () => {
    mockAccount.address = "0x1234567890123456789012345678901234567890";
    mockAccount.status = "connected";
    mockGetSession.mockResolvedValue({
      address: "0x9999999999999999999999999999999999999999",
      chainId: 42220,
    });

    const { result } = renderHook(() => useAuthStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.state).toBe("connectedNoSession"));
  });

  it("is authenticated when the session address matches the wallet", async () => {
    mockAccount.address = "0x1234567890123456789012345678901234567890";
    mockAccount.status = "connected";
    mockGetSession.mockResolvedValue({
      address: "0x1234567890123456789012345678901234567890",
      chainId: 42220,
    });

    const { result } = renderHook(() => useAuthStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.state).toBe("authenticated"));
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("keeps backend outages separate from no-session", async () => {
    mockAccount.address = "0x1234567890123456789012345678901234567890";
    mockAccount.status = "connected";
    mockGetSession.mockRejectedValue(new BackendApiError(500, "Server down"));

    const { result } = renderHook(() => useAuthStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.state).toBe("sessionCheckError"));
  });
});
