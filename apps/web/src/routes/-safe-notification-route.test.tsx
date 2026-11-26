import type { SafeProposal } from "@clc/api/features/safe/client";
import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import { useSafeSheet } from "#/features/safe/state/safe-sheet";

const mocks = vi.hoisted(() => ({ pending: vi.fn(), loadSheet: vi.fn() }));
const SAFE = "0x1111111111111111111111111111111111111111";
const VIEWER = "0x2222222222222222222222222222222222222222";
const HASH = `0x${"ab".repeat(32)}`;

vi.mock("#/features/auth/hooks/use-auth-status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/features/auth/hooks/use-auth-status")>()),
  useAuthStatus: () => ({
    address: VIEWER,
    isAuthenticated: true,
    isLoading: false,
    state: "authenticated",
    session: { address: VIEWER, role: "USER" },
  }),
}));
// Keep the real root, phone sheet, Safe store, and notification URL route. Stub
// unrelated background connections and the Safe queue's network boundary.
vi.mock("#/lib/discovery-location", () => ({
  DiscoveryLocationProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("#/features/messaging/hooks/use-messaging-realtime", () => ({
  useMessagingRealtime: () => undefined,
}));
vi.mock("#/features/notifications/realtime/use-notification-session", () => ({
  useNotificationSession: () => undefined,
}));
vi.mock("#/features/home/ui/home-page", () => ({ HomePage: () => <h1>Activity</h1> }));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/features/ownership/hooks/use-asset-owner-info")>()),
  useSafeOwnersSignedBy: () => new Set([SAFE]),
}));
vi.mock("#/lib/api/safe", () => ({ safeClient: { pending: mocks.pending } }));
vi.mock("#/features/safe/ui/safe-pending-sheet", async (importOriginal) => {
  mocks.loadSheet();
  return importOriginal<typeof import("#/features/safe/ui/safe-pending-sheet")>();
});

import { Route as RootRoute } from "./__root";
import { Route as IndexRoute } from "./_nav/index";

it("loads the phone Safe sheet only after choosing the notification's exact proposal", async () => {
  const proposal: SafeProposal = {
    safe: SAFE,
    safeTxHash: HASH,
    to: VIEWER,
    value: "0",
    data: "0x",
    operation: 0,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: "0x0000000000000000000000000000000000000000",
    refundReceiver: "0x0000000000000000000000000000000000000000",
    nonce: "7",
    confirmations: [],
    confirmationsRequired: 2,
    isExecuted: false,
    isSuccessful: null,
    transactionHash: null,
  };
  mocks.pending.mockResolvedValue([proposal]);

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: RootRoute.options.component,
  });
  const index = IndexRoute.update({ getParentRoute: () => root, path: "/" } as never);
  const router = createRouter({
    routeTree: root.addChildren([index]),
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/?tab=activity&section=notifications"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Activity" });
  expect(mocks.loadSheet).not.toHaveBeenCalled();
  expect(mocks.pending).not.toHaveBeenCalled();

  await act(() =>
    router.navigate({
      to: "/",
      search: { tab: "activity", section: "notifications", safe: SAFE, safeTx: HASH },
    }),
  );
  await screen.findByText("Nonce 7");
  const sheet = screen.getByRole("dialog", { name: "Multisig transactions" });
  expect(within(sheet).queryByText("This proposal is no longer pending.")).toBeNull();
  expect(mocks.loadSheet).toHaveBeenCalledOnce();
  expect(mocks.pending).toHaveBeenCalledExactlyOnceWith(SAFE, expect.any(AbortSignal));
  expect(useSafeSheet.getState().safeTxHash).toBe(HASH);

  fireEvent.click(within(sheet).getAllByRole("button", { name: "Close" }).at(-1)!);
  expect(useSafeSheet.getState().safe).toBeNull();
});
