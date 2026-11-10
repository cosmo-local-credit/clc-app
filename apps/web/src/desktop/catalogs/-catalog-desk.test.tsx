import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const OWNER = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";

const { detail, members, update, auth } = vi.hoisted(() => ({
  detail: vi.fn(),
  members: vi.fn(),
  update: vi.fn(),
  auth: { address: "" },
}));

vi.mock("#/lib/api/catalogs", () => ({ catalogsClient: { detail, members, update } }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, session: { address: auth.address } }),
}));
vi.mock("#/hooks/use-deployment", () => ({
  tokenTagsQueryKey: ["deployments", "token-tags"],
  useTokenTags: () => ({ data: ["Food"], isError: false, isPending: false, refetch: vi.fn() }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));
vi.mock("#/components/ui/image-upload-field", () => ({
  ImageUploadField: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: () => <div data-testid="location-picker" />,
}));
vi.mock("#/components/auth/authenticated-details-gate", () => ({
  AuthenticatedDetailsGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { CatalogDesk } from "./catalog-desk";

const CATALOG = {
  id: "7",
  name: "Kilifi Traders",
  description: "Pools and vouchers around Kilifi.",
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

/** The real route has no `validateSearch`; neither does this one. */
function mountAt(entry: string) {
  const root = createRootRoute({ component: Outlet });
  const catalog = createRoute({
    getParentRoute: () => root,
    path: "/catalogs/$catalogId",
    component: () => <CatalogDesk id="7" />,
  });
  const router = createRouter({
    routeTree: root.addChildren([catalog]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  auth.address = OWNER;
  detail.mockResolvedValue(CATALOG);
  members.mockResolvedValue({ items: [], nextCursor: null });
  update.mockResolvedValue({ ...CATALOG, name: "Kilifi Traders Co-op" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CatalogDesk edit inspector", () => {
  it("opens as ?edit, takes focus, and Back closes it", async () => {
    const router = mountAt("/catalogs/7");
    const edit = await screen.findByRole("button", { name: "Edit catalog" });
    expect(screen.queryByRole("complementary", { name: "Edit catalog" })).toBeNull();
    edit.focus();

    fireEvent.click(edit);

    const inspector = await screen.findByRole("complementary", { name: "Edit catalog" });
    expect(router.state.location.search).toMatchObject({ edit: true });
    expect(edit.getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => expect(inspector.contains(document.activeElement)).toBe(true));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Kilifi Traders");

    act(() => router.history.back());
    await waitFor(() =>
      expect(screen.queryByRole("complementary", { name: "Edit catalog" })).toBeNull(),
    );
    expect(router.state.location.search).not.toHaveProperty("edit");
  });

  it("closes on Escape and returns focus to the button that opened it", async () => {
    const router = mountAt("/catalogs/7");
    const edit = await screen.findByRole("button", { name: "Edit catalog" });
    edit.focus();
    fireEvent.click(edit);
    const inspector = await screen.findByRole("complementary", { name: "Edit catalog" });
    await waitFor(() => expect(inspector.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document.activeElement ?? inspector, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByRole("complementary", { name: "Edit catalog" })).toBeNull(),
    );
    expect(router.state.location.search).not.toHaveProperty("edit");
    expect(document.activeElement).toBe(edit);
  });

  it("opens from a direct link, and closing it lands on the catalog without adding history", async () => {
    const router = mountAt("/catalogs/7?edit=true");
    await screen.findByRole("complementary", { name: "Edit catalog" });
    const entries = router.history.length;

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(screen.queryByRole("complementary", { name: "Edit catalog" })).toBeNull(),
    );
    expect(router.state.location.pathname).toBe("/catalogs/7");
    expect(router.state.location.search).not.toHaveProperty("edit");
    // Replaced, not pushed: Back does not reopen the editor.
    expect(router.history.length).toBe(entries);
  });

  it("closes after a save by popping the entry it pushed", async () => {
    const router = mountAt("/catalogs/7");
    fireEvent.click(await screen.findByRole("button", { name: "Edit catalog" }));
    await screen.findByRole("complementary", { name: "Edit catalog" });
    // Opening pushed an entry on top of the catalog page.
    expect(router.history.location.state.__TSR_index).toBe(1);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Kilifi Traders Co-op" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole("complementary", { name: "Edit catalog" })).toBeNull(),
    );
    expect(router.state.location.search).not.toHaveProperty("edit");
    // Popped, not stacked: the catalog page is the entry we are on again.
    expect(router.history.location.state.__TSR_index).toBe(0);
  });

  it("keeps the editor closed for someone who does not own the catalog", async () => {
    auth.address = "0x0000000000000000000000000000000000000001";
    mountAt("/catalogs/7?edit=true");

    await screen.findByRole("heading", { level: 1, name: "Kilifi Traders" });
    expect(screen.queryByRole("button", { name: "Edit catalog" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Edit catalog" })).toBeNull();
  });

  it("lays Pools and Vouchers out by the room the pane has", async () => {
    mountAt("/catalogs/7");
    const pools = await screen.findByRole("heading", { level: 2, name: "Pools" });

    const pair = pools.closest(".grid.items-start") as HTMLElement;
    expect(pair.className).toContain("grid-cols-1");
    expect(pair.className).toContain("@min-[44rem]:grid-cols-2");
  });
});
