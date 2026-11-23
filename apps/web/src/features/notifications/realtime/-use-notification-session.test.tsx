import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  prime: vi.fn(),
  badge: vi.fn(),
  stopBadge: vi.fn(),
}));
vi.mock("./session", () => ({ startNotificationSession: mocks.start }));
vi.mock("./alert-cue", () => ({ primeNotificationCue: mocks.prime }));
vi.mock("./app-badge", () => ({ installAppBadgeSync: mocks.badge }));
import { useNotificationSession } from "./use-notification-session";

const WALLET = "0x1111111111111111111111111111111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.start.mockResolvedValue(mocks.stop);
  mocks.badge.mockReturnValue(mocks.stopBadge);
});

async function mount(initialWallet: string | undefined) {
  function Fixture() {
    const [wallet, setWallet] = useState<string | undefined>(initialWallet);
    useNotificationSession(wallet);
    return (
      <>
        <button type="button" onClick={() => setWallet(undefined)}>
          Sign out
        </button>
        <button
          type="button"
          onClick={() => setWallet("0x2222222222222222222222222222222222222222")}
        >
          Switch wallet
        </button>
        <Outlet />
      </>
    );
  }
  const root = createRootRoute({ component: Fixture });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: (search) => search,
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ["/?tab=activity&section=messages"] }),
  });
  const client = new QueryClient();
  await router.load();
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: "Sign out" });
  return { ...view, router, client };
}

it("keeps one session while Activity navigation changes its live presentation rule", async () => {
  const { router, unmount, client } = await mount(WALLET);
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  const options = mocks.start.mock.calls[0]?.[0];
  expect(options.activity.current()).toEqual({ section: "messages" });
  await act(async () =>
    router.navigate({ to: "/", search: { tab: "activity", section: "notifications" } } as never),
  );
  expect(options.activity.current()).toEqual({ section: "notifications" });
  expect(mocks.start).toHaveBeenCalledOnce();
  expect(mocks.stop).not.toHaveBeenCalled();
  unmount();
  expect(options.signal.aborted).toBe(true);
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.stopBadge).toHaveBeenCalledOnce();
  client.clear();
});

it("starts only for a signed-in wallet and tears down on sign-out and account switching", async () => {
  const { client, unmount } = await mount(undefined);
  expect(mocks.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Switch wallet" }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
  mocks.start.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Switch wallet" }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  expect(mocks.start.mock.calls[0]?.[0].walletAddress).toBe(
    "0x2222222222222222222222222222222222222222",
  );
  unmount();
  client.clear();
});
