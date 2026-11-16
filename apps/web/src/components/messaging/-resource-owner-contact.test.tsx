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

const OWNER = "0x1111111111111111111111111111111111111111";
const SIGNER = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  viewer: { address: "0x3333333333333333333333333333333333333333" },
}));

vi.mock("#/lib/api/safe", () => ({ safeClient: { owner: mocks.owner } }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: true,
    session: { address: mocks.viewer.address },
  }),
}));

import { ResourceOwnerContact } from "./resource-owner-contact";

function mount() {
  const root = createRootRoute();
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => <ResourceOwnerContact ownerAddress={OWNER} label="Issuer" />,
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
  mocks.viewer.address = "0x3333333333333333333333333333333333333333";
  mocks.owner.mockResolvedValue({
    kind: "safe",
    owner: OWNER,
    signers: [SIGNER],
    threshold: 1,
    messageTargets: [{ address: SIGNER, username: "amina", avatar: null }],
  });
});

describe("ResourceOwnerContact", () => {
  it("shows the public username and opens Messages with the resource owner prefill", async () => {
    const router = mount();
    expect(await screen.findByText("amina")).toBeTruthy();
    expect(screen.getByText("Issuer")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Message" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        tab: "activity",
        section: "messages",
        messageTo: OWNER,
      }),
    );
  });

  it("does not offer a self-message action", async () => {
    mocks.viewer.address = SIGNER;
    mount();
    expect(await screen.findByText("amina")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Message" })).toBeNull();
  });

  it("recovers when the public owner lookup is retried", async () => {
    mocks.owner.mockRejectedValueOnce(new Error("offline"));
    mount();

    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("amina")).toBeTruthy();
    expect(mocks.owner).toHaveBeenCalledTimes(2);
  });
});
