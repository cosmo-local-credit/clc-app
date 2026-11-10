import { BackendApiError } from "@clc/api/client/errors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const VIEWER = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";

const mocks = vi.hoisted(() => ({
  unread: vi.fn(),
  enabled: { value: true },
  auth: {
    isAuthenticated: true,
    address: "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6" as string | undefined,
  },
}));

vi.mock("#/lib/messaging-config", () => ({
  get MESSAGING_ENABLED() {
    return mocks.enabled.value;
  },
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => mocks.auth }));
vi.mock("#/lib/api/messaging", () => ({ messagingClient: { unread: mocks.unread } }));
vi.mock("#/features/wallet/hooks/use-activity-unseen", () => ({
  useActivityUnseen: () => ({ count: 2 }),
}));

import { useActivityCounts } from "./use-activity-counts";

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useActivityCounts(), { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.value = true;
  mocks.auth = { isAuthenticated: true, address: VIEWER };
});

describe("useActivityCounts", () => {
  it("sums transactions, messages with requests, and support replies into the badge", async () => {
    mocks.unread.mockResolvedValue({ direct: 3, requests: 1, helpdesk: 2 });
    const { result } = render();
    await waitFor(() => expect(result.current.total).toBe(8));
    expect(result.current).toEqual({ transactions: 2, messages: 4, helpdesk: 2, total: 8 });
  });

  it("counts only transactions while the unread read is pending or failed", async () => {
    mocks.unread.mockRejectedValue(new BackendApiError(400, "refused"));
    const { result } = render();
    expect(result.current.total).toBe(2);
    await waitFor(() => expect(mocks.unread).toHaveBeenCalled());
    expect(result.current.total).toBe(2);
  });

  it("reads nothing with messaging off or for a guest", () => {
    mocks.enabled.value = false;
    expect(render().result.current.total).toBe(2);
    mocks.enabled.value = true;
    mocks.auth = { isAuthenticated: false, address: undefined };
    expect(render().result.current.total).toBe(2);
    expect(mocks.unread).not.toHaveBeenCalled();
  });
});
