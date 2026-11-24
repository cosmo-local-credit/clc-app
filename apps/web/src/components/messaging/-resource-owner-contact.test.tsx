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
  authState: "authenticated",
}));

vi.mock("#/lib/api/safe", () => ({ safeClient: { owner: mocks.owner } }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    state: mocks.authState,
    isAuthenticated: mocks.authState === "authenticated",
    session: { address: mocks.viewer.address },
  }),
}));

import {
  ResourceMessageButton,
  ResourceOwnerContact,
  ResourceOwnerContactValue,
} from "./resource-owner-contact";

function mount(
  embedded = false,
  context?: {
    kind: "pool";
    resourceId: `0x${string}`;
    proposedVoucherAddress?: `0x${string}`;
  },
) {
  const root = createRootRoute();
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: (search: Record<string, unknown>) => search,
    component: () =>
      embedded ? (
        <ResourceOwnerContactValue ownerAddress={OWNER} context={context} />
      ) : (
        <ResourceOwnerContact ownerAddress={OWNER} label="Issuer" context={context} />
      ),
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
  mocks.authState = "authenticated";
  mocks.viewer.address = "0x3333333333333333333333333333333333333333";
  mocks.owner.mockResolvedValue({
    kind: "safe",
    owner: OWNER,
    signers: [SIGNER],
    threshold: 1,
    messageTargets: [{ address: SIGNER, username: "amina", avatar: null }],
  });
});

function mountResourceButton(
  kind: "pool" | "voucher" | "want" | "catalog" | "post",
  id: string,
  proposedVoucherAddress?: `0x${string}`,
) {
  const root = createRootRoute();
  const start = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => (
      <ResourceMessageButton
        context={
          kind === "pool"
            ? { kind, resourceId: id, proposedVoucherAddress }
            : { kind, resourceId: id }
        }
      />
    ),
  });
  const onboarding = createRoute({
    getParentRoute: () => root,
    path: "/onboarding",
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => <h1>Sign in</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([start, onboarding]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("ResourceMessageButton", () => {
  it("preserves a proposed Voucher when launching the Pool composer", async () => {
    const router = mountResourceButton("pool", OWNER, SIGNER);
    fireEvent.click(await screen.findByRole("link", { name: "Message" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        tab: "activity",
        section: "messages",
        messageKind: "pool",
        messageResource: OWNER,
        messageVoucher: SIGNER,
      }),
    );
    expect(mocks.owner).not.toHaveBeenCalled();
  });
  it.each(["guest", "connectedNoSession"])(
    "sends a %s visitor directly to sign-in with the Post intent",
    async (state) => {
      mocks.authState = state;
      const router = mountResourceButton("post", "47");
      fireEvent.click(await screen.findByRole("link", { name: "Message" }));
      await screen.findByRole("heading", { name: "Sign in" });
      expect(router.state.location.search).toEqual({
        step: "signin",
        redirect: "/?tab=activity&section=messages&messageKind=post&messageResource=47",
      });
      expect(mocks.owner).not.toHaveBeenCalled();
    },
  );

  it.each(["authenticated", "loading", "sessionCheckError"])(
    "opens Activity with the resource key in the %s state without fetching an owner",
    async (state) => {
      mocks.authState = state;
      mocks.owner.mockRejectedValue(new Error("offline"));
      const router = mountResourceButton("pool", OWNER);
      fireEvent.click(await screen.findByRole("link", { name: "Message" }));
      await waitFor(() =>
        expect(router.state.location.search).toEqual({
          tab: "activity",
          section: "messages",
          messageKind: "pool",
          messageResource: OWNER,
        }),
      );
      expect(mocks.owner).not.toHaveBeenCalled();
    },
  );
});

describe("ResourceOwnerContact", () => {
  it.each([false, true])(
    "retains both actions through owner lookup errors and forwards resource context (embedded: %s)",
    async (embedded) => {
      mocks.owner.mockRejectedValueOnce(new Error("offline"));
      const context = {
        kind: "pool" as const,
        resourceId: OWNER as `0x${string}`,
        proposedVoucherAddress: SIGNER as `0x${string}`,
      };
      const router = mount(embedded, context);
      await screen.findByRole("button", { name: "Retry" });
      expect(screen.getByRole("button", { name: "Profile" })).toBeTruthy();
      fireEvent.click(screen.getByRole("link", { name: "Message" }));
      await waitFor(() =>
        expect(router.state.location.search).toEqual({
          tab: "activity",
          section: "messages",
          messageKind: "pool",
          messageResource: OWNER,
          messageVoucher: SIGNER,
        }),
      );
    },
  );
  it.each([false, true])(
    "keeps both resource actions available while the owner identity is unresolved (embedded: %s)",
    async (embedded) => {
      mocks.owner.mockReturnValue(new Promise(() => {}));
      mount(embedded, { kind: "pool", resourceId: OWNER });
      expect(await screen.findByRole("link", { name: "Message" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Profile" })).toBeTruthy();
      expect(mocks.owner).toHaveBeenCalledTimes(1);
    },
  );
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

  it("opens the same owner prefill when the displayed identity is selected", async () => {
    const router = mount();
    fireEvent.click(await screen.findByRole("link", { name: "amina" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        tab: "activity",
        section: "messages",
        messageTo: OWNER,
      }),
    );
  });

  it("preserves the originating Pool and proposed Voucher in both owner links", async () => {
    const context = {
      kind: "pool" as const,
      resourceId: "0x4444444444444444444444444444444444444444" as const,
      proposedVoucherAddress: "0x5555555555555555555555555555555555555555" as const,
    };
    const router = mount(false, context);

    fireEvent.click(await screen.findByRole("link", { name: "amina" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        tab: "activity",
        section: "messages",
        messageTo: OWNER,
        messageKind: "pool",
        messageResource: context.resourceId,
        messageVoucher: context.proposedVoucherAddress,
      }),
    );
  });

  it("reuses the owner result for an embedded Info-row action", async () => {
    mount(true);
    expect(await screen.findByRole("link", { name: "amina" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Message" })).toBeTruthy();
    expect(mocks.owner).toHaveBeenCalledTimes(1);
  });

  it("does not offer a self-message action", async () => {
    mocks.viewer.address = SIGNER;
    mount();
    expect(await screen.findByText("amina")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "amina" })).toBeNull();
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
