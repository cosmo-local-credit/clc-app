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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const OWNER = `0x${"a".repeat(40)}`;
const mocks = vi.hoisted(() => ({
  api: { detail: vi.fn(), members: vi.fn(), update: vi.fn() },
  account: { address: "" },
}));
vi.mock("#/lib/api/catalogs", () => ({ catalogsClient: mocks.api }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    address: mocks.account.address,
    isAuthenticated: true,
    session: { address: mocks.account.address },
  }),
}));
vi.mock("#/hooks/use-deployment", () => ({
  tokenTagsQueryKey: ["deployments", "token-tags"],
  useTokenTags: () => ({ data: ["Food"], isError: false, isPending: false, refetch: vi.fn() }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));
vi.mock("#/components/ui/image-upload-field", () => ({ ImageUploadField: () => <div /> }));
vi.mock("#/components/ui/location-picker", () => ({ LocationPicker: () => <div /> }));
vi.mock("#/components/auth/authenticated-details-gate", () => ({
  AuthenticatedDetailsGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("#/components/wallet", () => ({ BackChevron: () => <a href="/">Back</a> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DESKTOP_MEDIA } from "#/desktop/layout";
import { clearViewDrafts, useViewDraftStore } from "#/lib/view-drafts";
import { Route } from "./_nav/catalogs/$catalogId";

const CATALOG = {
  id: "7",
  name: "Kilifi Traders",
  description: "Local produce",
  imageUrl: null,
  locationName: "Kilifi, Kenya",
  geoLat: -3.51,
  geoLng: 39.9,
  ownerAddress: OWNER,
  poolCount: 0,
  voucherCount: 0,
  distanceMeters: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  tags: ["Food"],
};
const originalMatchMedia = window.matchMedia;
const media = { matches: false, listeners: new Set<() => void>() };
function setViewport(desktop: boolean) {
  act(() => {
    media.matches = desktop;
    for (const listener of media.listeners) listener();
  });
}
function mountAt(desktop: boolean, entry = "/catalogs/7") {
  media.matches = desktop;
  document.documentElement.dataset.layout = desktop ? "desktop" : "mobile";
  const root = createRootRoute({ component: Outlet });
  const nav = createRoute({ getParentRoute: () => root, id: "_nav", component: Outlet });
  const catalog = Route.update({ getParentRoute: () => nav, path: "catalogs/$catalogId" } as never);
  const router = createRouter({
    routeTree: root.addChildren([nav.addChildren([catalog])]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
beforeEach(() => {
  vi.clearAllMocks();
  clearViewDrafts();
  media.listeners.clear();
  mocks.account.address = OWNER;
  mocks.api.detail.mockImplementation((id: string) => Promise.resolve({ ...CATALOG, id }));
  mocks.api.members.mockResolvedValue({ items: [], nextCursor: null });
  mocks.api.update.mockResolvedValue(CATALOG);
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return query === DESKTOP_MEDIA && media.matches;
    },
    addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
  }));
});
afterEach(() => {
  vi.stubGlobal("matchMedia", originalMatchMedia);
  delete document.documentElement.dataset.layout;
  clearViewDrafts();
});

describe("Catalog editing across phone/desktop views", () => {
  it.each([false, true])(
    "keeps the editor and unsaved values across resize, starting desktop=%s",
    async (desktop) => {
      const router = mountAt(desktop);
      fireEvent.click(await screen.findByRole("button", { name: "Edit catalog" }));
      fireEvent.change(await screen.findByLabelText("Name"), {
        target: { value: "Unsaved traders" },
      });
      fireEvent.change(screen.getByLabelText("Description"), {
        target: { value: "Unsaved description" },
      });
      setViewport(!desktop);
      expect(((await screen.findByLabelText("Name")) as HTMLInputElement).value).toBe(
        "Unsaved traders",
      );
      expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe(
        "Unsaved description",
      );
      expect(mocks.api.update).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsaved again" } });
      setViewport(desktop);
      expect(((await screen.findByLabelText("Name")) as HTMLInputElement).value).toBe(
        "Unsaved again",
      );
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      await waitFor(() => expect(screen.queryByLabelText("Name")).toBeNull());
      expect(router.state.location.search).not.toHaveProperty("edit");
      expect(router.history.location.state.__TSR_index).toBe(0);
    },
  );

  it.each([false, true])(
    "opens a deep-linked editor and closes in place, desktop=%s",
    async (desktop) => {
      const router = mountAt(desktop, "/catalogs/7?edit=true");
      await screen.findByLabelText("Name");
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      await waitFor(() => expect(screen.queryByLabelText("Name")).toBeNull());
      expect(router.state.location.pathname).toBe("/catalogs/7");
      expect(router.history.length).toBe(1);
    },
  );

  it.each([false, true])(
    "Back closes after switching layouts, starting desktop=%s",
    async (desktop) => {
      const router = mountAt(desktop);
      fireEvent.click(await screen.findByRole("button", { name: "Edit catalog" }));
      await screen.findByLabelText("Name");
      setViewport(!desktop);
      await screen.findByLabelText("Name");
      act(() => router.history.back());
      await waitFor(() => expect(screen.queryByLabelText("Name")).toBeNull());
      expect(router.state.location.search).not.toHaveProperty("edit");
      expect(router.history.location.state.__TSR_index).toBe(0);
    },
  );

  it.each([false, true])(
    "does not expose a linked editor for another owner, desktop=%s",
    async (desktop) => {
      mocks.account.address = `0x${"b".repeat(40)}`;
      mountAt(desktop, "/catalogs/7?edit=true");
      await screen.findByRole("heading", { level: 1, name: CATALOG.name });
      expect(screen.queryByRole("button", { name: "Edit catalog" })).toBeNull();
      expect(screen.queryByLabelText("Name")).toBeNull();
      expect(mocks.api.update).not.toHaveBeenCalled();
    },
  );

  it("scopes edits to this catalog and clears them after an explicit save in the other layout", async () => {
    const router = mountAt(false);
    fireEvent.click(await screen.findByRole("button", { name: "Edit catalog" }));
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Unsaved traders" },
    });
    expect(Object.keys(useViewDraftStore.getState().entries)).toEqual([`${OWNER}:catalog-edit:7`]);
    setViewport(true);
    expect(((await screen.findByLabelText("Name")) as HTMLInputElement).value).toBe(
      "Unsaved traders",
    );
    expect(mocks.api.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.api.update).toHaveBeenCalledTimes(1));
    expect(mocks.api.update).toHaveBeenCalledWith(
      "7",
      expect.objectContaining({ name: "Unsaved traders", geoLat: -3.51, geoLng: 39.9 }),
    );
    await waitFor(() => expect(screen.queryByLabelText("Name")).toBeNull());
    expect(useViewDraftStore.getState().entries).toEqual({});
    expect(router.history.location.state.__TSR_index).toBe(0);
  });
});
