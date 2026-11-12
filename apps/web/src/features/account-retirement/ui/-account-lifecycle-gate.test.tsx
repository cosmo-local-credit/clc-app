import type { SessionResult } from "@clc/api/features/auth/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

const { account, getSession } = vi.hoisted(() => ({
  account: {
    address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as `0x${string}`,
    chainId: 100,
    connector: { id: "test" },
    status: "connected" as const,
  },
  getSession: vi.fn(),
}));

vi.mock("wagmi", () => ({ useConnection: () => account }));
vi.mock("#/providers/auth-bootstrap", () => ({ useReconnectAttempted: () => true }));
vi.mock("#/lib/api/auth", () => ({ authClient: { getSession: () => getSession() } }));

import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { AccountLifecycleGate } from "./account-lifecycle-gate";

const ACTIVE: SessionResult = { address: ADDRESS, chainId: 100, role: "USER" };
const RETIRING: SessionResult = {
  address: ADDRESS,
  chainId: 100,
  role: "USER",
  accountLifecycle: "RETIREMENT_SCHEDULED",
  closesAt: "2027-05-11T10:00:00Z",
  capabilities: {
    canUseApp: false,
    canRecoverAssets: true,
    canTransferResources: true,
    canRestoreAccount: true,
  },
};

function renderApp(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <AccountLifecycleGate>
          <Outlet />
        </AccountLifecycleGate>
      </QueryClientProvider>
    ),
  });
  const page = (path: string, name: string) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => (
        <div>
          <h1>{name}</h1>
          <Link to="/wallet/send">Send funds</Link>
          <Link to="/settings/profile">Profile</Link>
        </div>
      ),
    });
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      page("/", "Market"),
      page("/recovery", "Recovery shell"),
      page("/wallet/send", "Send"),
      page("/settings/profile", "Edit profile"),
    ]),
    history,
  });
  render(<RouterProvider router={router} />);
  return { history, queryClient };
}

beforeEach(() => {
  getSession.mockReset();
});

describe("account lifecycle gate", () => {
  it("replaces a normal route with the shell for a retiring account", async () => {
    getSession.mockResolvedValue(RETIRING);
    const { history } = renderApp("/settings/profile");

    await screen.findByRole("heading", { name: "Recovery shell" });
    expect(screen.queryByRole("heading", { name: "Edit profile" })).toBeNull();
    // Replaced, not pushed: Back must not reopen the screen the account lost.
    expect(history.length).toBe(1);
    expect(history.location.pathname).toBe("/recovery");
  });

  it("keeps Back inside the recovery set", async () => {
    getSession.mockResolvedValue(RETIRING);
    const { history } = renderApp("/");
    await screen.findByRole("heading", { name: "Recovery shell" });

    fireEvent.click(screen.getByRole("link", { name: "Send funds" }));
    await screen.findByRole("heading", { name: "Send" });
    expect(history.length).toBe(2);

    act(() => history.back());
    await screen.findByRole("heading", { name: "Recovery shell" });
    expect(history.location.pathname).toBe("/recovery");
  });

  it("sends a blocked link from the shell straight back to it", async () => {
    getSession.mockResolvedValue(RETIRING);
    const { history } = renderApp("/recovery");
    await screen.findByRole("heading", { name: "Recovery shell" });

    fireEvent.click(screen.getByRole("link", { name: "Profile" }));

    await waitFor(() => expect(history.location.pathname).toBe("/recovery"));
    expect(screen.queryByRole("heading", { name: "Edit profile" })).toBeNull();
  });

  it("leaves an active account on its routes and moves it out of the shell", async () => {
    getSession.mockResolvedValue(ACTIVE);
    const { history } = renderApp("/recovery");

    await screen.findByRole("heading", { name: "Market" });
    expect(history.location.pathname).toBe("/");
    fireEvent.click(screen.getByRole("link", { name: "Profile" }));
    await screen.findByRole("heading", { name: "Edit profile" });
  });

  it("switches shells when the session turns restricted without a reload", async () => {
    getSession.mockResolvedValue(ACTIVE);
    const { history, queryClient } = renderApp("/");
    await screen.findByRole("heading", { name: "Market" });

    act(() => {
      queryClient.setQueryData([...authSessionQueryKey, ADDRESS.toLowerCase()], RETIRING);
    });

    await screen.findByRole("heading", { name: "Recovery shell" });
    expect(history.location.pathname).toBe("/recovery");
  });

  it("does not redirect while the session cannot be read", async () => {
    getSession.mockRejectedValue(new Error("offline"));
    const { history } = renderApp("/");

    await screen.findByRole("heading", { name: "Market" });
    expect(history.location.pathname).toBe("/");
  });
});
