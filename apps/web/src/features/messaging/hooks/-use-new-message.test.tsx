import type { RecipientIdentity } from "@clc/api/features/recipients/client";
import type { Conversation } from "@clc/core/features/messaging/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

const VIEWER = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, session: { address: VIEWER } }),
}));
vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useRecipientSearch: () => ({ data: [], isDebouncing: false, isFetching: false }),
}));
vi.mock("@clc/api/features/safe/queries", () => ({
  ownerInfoQueryOptions: (_client: unknown, address?: string) => ({
    queryKey: ["owner", address ?? "none"],
    queryFn: async () => ({ messageTargets: [] }),
    enabled: Boolean(address),
  }),
}));
vi.mock("#/lib/api/safe", () => ({ safeClient: {} }));
vi.mock("./use-conversation-actions", () => ({
  useRequestConversation: () => ({ error: null, reset: vi.fn(), mutate: vi.fn() }),
}));

import { useNewMessage } from "./use-new-message";

const recipient = {
  kind: "user" as const,
  name: "Pool owner",
  alias: "pool-owner",
  address: OWNER,
  chainId: 100,
} satisfies RecipientIdentity;
const context = {
  kind: "pool" as const,
  resourceId: "0x3333333333333333333333333333333333333333" as const,
  proposedVoucherAddress: "0x4444444444444444444444444444444444444444" as const,
};

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("useNewMessage", () => {
  it("opens an accepted thread with resource context supplied after the hook mounted", () => {
    const openThread = vi.fn();
    const existing = [{ id: 7, status: "accepted", peer: { address: OWNER } }] as Conversation[];
    const { result } = renderHook(() => useNewMessage(existing, openThread, OWNER), { wrapper });

    act(() => result.current.choose(recipient, context));

    expect(openThread).toHaveBeenCalledWith(7, context);
  });

  it("retains late resource context while preparing a new request", () => {
    const { result } = renderHook(() => useNewMessage([], vi.fn(), OWNER), { wrapper });

    act(() => result.current.choose(recipient, context));

    expect(result.current.selected).toEqual(recipient);
    expect(result.current.context).toEqual(context);
  });
});
