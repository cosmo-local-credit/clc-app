import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { AdminUser } from "@clc/api/features/admin/client";
import { parseTableSearch } from "#/lib/table-search";
import { UsersPage } from "./users-page";

const listUsers = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api", () => ({
  clcApi: { admin: { listUsers: (...args: unknown[]) => listUsers(...args) } },
}));

function user(id: number, overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id,
    ethereumAddress: `0x${id.toString(16).padStart(40, "0")}`,
    name: `Account ${id}`,
    email: `account-${id}@example.test`,
    phone: `+25470000${id.toString().padStart(4, "0")}`,
    country: "KE",
    role: "USER",
    status: "APPROVED",
    maxPools: 10,
    maxTokens: 20,
    createdAt: "2026-08-13T11:00:00Z",
    updatedAt: "2026-08-13T11:00:00Z",
    avatarUrl: null,
    locationName: null,
    geoLat: null,
    geoLng: null,
    ...overrides,
  };
}

function page(...users: Array<AdminUser>) {
  return {
    users,
    first: users[0]?.id ?? 0,
    last: users.at(-1)?.id ?? 0,
    receivedCount: users.length,
  };
}

function renderUsersRoute(initialEntry = "/users") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const usersRoute = createRoute({
    getParentRoute: () => root,
    path: "/users",
    validateSearch: parseTableSearch,
    component: function UsersRoute() {
      return <UsersPage search={usersRoute.useSearch()} />;
    },
  });
  const detailRoute = createRoute({
    getParentRoute: () => root,
    path: "/users/$address",
    component: () => <p>detail</p>,
  });

  const router = createRouter({
    routeTree: root.addChildren([usersRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("UsersPage", () => {
  it("shows contact details and no approval state", async () => {
    // The directory answers "who is this and how do we reach them". Approval
    // state, limits and the join date belong to one account, on its own screen.
    listUsers.mockResolvedValue(page(user(4210)));

    renderUsersRoute();

    await waitFor(() => expect(screen.getByText("Account 4210")).toBeTruthy());
    expect(screen.getByText("+254700004210")).toBeTruthy();
    expect(screen.getByText("KE")).toBeTruthy();
    expect(screen.queryByText(/approve/i)).toBeNull();
    expect(screen.queryByText(/reject/i)).toBeNull();
  });

  it("sends a typed term to the backend rather than filtering the fetched page", async () => {
    // The regression this guards: the directory used to arrive whole and be
    // filtered in the browser, so what an operator could find depended on what
    // had been downloaded.
    listUsers.mockImplementation((params: { q?: string }) =>
      Promise.resolve(params.q === undefined ? page(user(4210)) : page(user(3990))),
    );

    const router = renderUsersRoute();
    await waitFor(() => expect(screen.getByText("Account 4210")).toBeTruthy());

    fireEvent.change(screen.getByRole("textbox", { name: "Name, email, phone, address" }), {
      target: { value: "wanjiku" },
    });

    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: "wanjiku" }));
    expect(listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ q: "wanjiku" }),
      expect.anything(),
    );
    await waitFor(() => expect(screen.getByText("Account 3990")).toBeTruthy());
  });

  it("holds back a one-character term, which clc-core answers 400 for", async () => {
    listUsers.mockResolvedValue(page(user(4210)));

    const router = renderUsersRoute();
    await waitFor(() => expect(screen.getByText("Account 4210")).toBeTruthy());

    fireEvent.change(screen.getByRole("textbox", { name: "Name, email, phone, address" }), {
      target: { value: "w" },
    });

    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: "w" }));
    expect(listUsers).not.toHaveBeenCalledWith(
      expect.objectContaining({ q: "w" }),
      expect.anything(),
    );
  });

  it("records the cursor in the URL and returns to the first page on Back", async () => {
    listUsers.mockImplementation((params: { cursor?: number }) =>
      Promise.resolve(
        params.cursor === undefined
          ? page(...Array.from({ length: 25 }, (_, i) => user(4210 - i)))
          : page(user(4180)),
      ),
    );

    const router = renderUsersRoute();
    await waitFor(() => expect(screen.getByText("Account 4210")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(screen.getByText("Account 4180")).toBeTruthy());
    expect(router.state.location.search).toMatchObject({ dir: "next" });
  });
});
