import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const POOL_A = "0x1111111111111111111111111111111111111111";
const POOL_B = "0x2222222222222222222222222222222222222222";
const POOL_C = "0x3333333333333333333333333333333333333333";
const OWNER_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OWNER_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const mocks = vi.hoisted(() => ({
  pool: vi.fn(),
  owner: vi.fn(),
  viewer: "0xcccccccccccccccccccccccccccccccccccccccc",
}));

vi.mock("#/lib/api/pools", () => ({ poolsClient: { getPoolByAddress: mocks.pool } }));
vi.mock("#/lib/api/safe", () => ({ safeClient: { owner: mocks.owner } }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: true,
    session: { address: mocks.viewer },
  }),
}));

import { SwapPoolOwnerContacts } from "./swap-pool-owner-contacts";

function pool(address: string, name: string, ownerAddress: string) {
  return { address, name, ownerAddress };
}

function mount(addresses: string[]) {
  const root = createRootRoute();
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => <SwapPoolOwnerContacts poolAddresses={addresses} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pool.mockImplementation((address: string) => {
    if (address.toLowerCase() === POOL_A) return Promise.resolve(pool(POOL_A, "Alpha", OWNER_A));
    if (address.toLowerCase() === POOL_B) return Promise.resolve(pool(POOL_B, "Beta", OWNER_A));
    return Promise.resolve(pool(POOL_C, "Gamma", OWNER_B));
  });
  mocks.owner.mockImplementation((address: string) =>
    Promise.resolve({
      kind: "unsupported",
      owner: address,
      messageTargets: [
        {
          address,
          username: address.toLowerCase() === OWNER_A ? "alice" : "bob",
          avatar: null,
        },
      ],
    }),
  );
});

describe("SwapPoolOwnerContacts", () => {
  it("deduplicates current owners and lets their identity open Messages", async () => {
    const router = mount([POOL_A, POOL_B, POOL_C, POOL_A.toUpperCase()]);

    expect(await screen.findByRole("link", { name: "alice" })).toBeTruthy();
    expect(await screen.findByRole("link", { name: "bob" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Message" })).toHaveLength(2);
    expect(mocks.pool).toHaveBeenCalledTimes(3);
    expect(mocks.owner).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("link", { name: "alice" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        tab: "activity",
        section: "messages",
        messageTo: OWNER_A,
      }),
    );
  });

  it("keeps resolved owners visible while a failed Pool lookup is retried", async () => {
    let fail = true;
    mocks.pool.mockImplementation((address: string) => {
      if (address.toLowerCase() === POOL_B && fail) return Promise.reject(new Error("offline"));
      return Promise.resolve(
        address.toLowerCase() === POOL_A
          ? pool(POOL_A, "Alpha", OWNER_A)
          : pool(POOL_B, "Beta", OWNER_B),
      );
    });
    mount([POOL_A, POOL_B]);

    expect(await screen.findByRole("link", { name: "alice" })).toBeTruthy();
    expect(await screen.findByText("Couldn't load pools.")).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("link", { name: "bob" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Couldn't load pools.")).toBeNull());
  });
});
