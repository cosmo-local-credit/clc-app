import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * Create catalog across a browser zoom or window resize that crosses the
 * desktop breakpoint: both views run `useCatalogForm`, so the typed fields
 * cross over, and nothing else does.
 */
const mocks = vi.hoisted(() => ({
  api: { mine: vi.fn(), create: vi.fn(), setMember: vi.fn() },
  account: { address: undefined as string | undefined },
  navigate: vi.fn(),
}));

vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({
    data: { catalogs: { used: 0, limit: 1, canCreate: true, unlimited: false } },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    address: mocks.account.address,
    isAuthenticated: Boolean(mocks.account.address),
    isLoading: false,
    state: mocks.account.address ? "authenticated" : "guest",
    session: mocks.account.address ? { address: mocks.account.address } : undefined,
    error: null,
    retry: vi.fn(),
  }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({
    data: { geoLat: 43, geoLng: 18, locationName: "Sarajevo" },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/lib/api/catalogs", () => ({ catalogsClient: mocks.api }));
vi.mock("#/hooks/use-deployment", () => ({
  tokenTagsQueryKey: ["deployments", "token-tags"],
  useTokenTags: () => ({ data: ["Food"], isError: false, isPending: false, refetch: vi.fn() }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("#/components/wallet", () => ({ BackChevron: () => <a href="/">Back</a> }));
vi.mock("#/components/resource-usage", () => ({ ResourceUsage: () => null }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useSearch: () => ({}),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock("#/components/ui/image-upload-field", () => ({
  ImageUploadField: ({ value }: { value: string | null }) => (
    <output data-testid="catalog-image">{value ?? ""}</output>
  ),
}));
vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({ value }: { value?: { locationName: string } }) => (
    <output data-testid="location">{value?.locationName ?? "none"}</output>
  ),
}));
vi.mock("#/components/ui/location-map.lazy", () => ({ LocationMap: () => <div /> }));
vi.mock("#/components/ui/tag-combobox", () => ({
  TagCombobox: ({
    value,
    onValueChange,
  }: {
    value: string[];
    onValueChange: (tags: string[]) => void;
  }) => (
    <div>
      <output data-testid="tags">{value.join(",")}</output>
      <button type="button" onClick={() => onValueChange(["Food"])}>
        Add Food
      </button>
    </div>
  ),
}));

import { CatalogCreateDesk } from "#/desktop/catalogs/catalog-create-desk";
import { DESKTOP_MEDIA } from "#/desktop/layout";
import { LayoutSwitch } from "#/desktop/switch";
import { CatalogCreatePage } from "#/features/catalogs/ui/catalog-create-page";
import { clearViewDrafts, useViewDraftStore } from "#/lib/view-drafts";

const ALICE = `0x${"a".repeat(40)}`;
const BOB = `0x${"b".repeat(40)}`;

const originalMatchMedia = window.matchMedia;
const media = { matches: false, listeners: new Set<() => void>() };

function setViewport(desktop: boolean) {
  act(() => {
    media.matches = desktop;
    for (const listener of media.listeners) listener();
  });
}

function openViewport(desktop: boolean) {
  media.matches = desktop;
  document.documentElement.dataset.layout = desktop ? "desktop" : "mobile";
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
function creator() {
  return (
    <QueryClientProvider client={queryClient}>
      <LayoutSwitch mobile={<CatalogCreatePage />} desktop={<CatalogCreateDesk />} />
    </QueryClientProvider>
  );
}

const entries = () => useViewDraftStore.getState().entries;
const name = async () => ((await screen.findByLabelText("Name")) as HTMLInputElement).value;
const typeName = async (next: string) =>
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: next } });

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  media.matches = false;
  media.listeners.clear();
  mocks.account.address = ALICE;
  mocks.api.mine.mockResolvedValue({ catalogs: [], nextCursor: null });
  clearViewDrafts();
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

describe("Create catalog across a phone/desktop view switch", () => {
  it("brings the typed fields to the other view and back", async () => {
    render(creator());
    await typeName("Local makers");
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Things made in Sarajevo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Food" }));

    setViewport(true);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Create catalog" })).toBeTruthy(),
    );
    expect(await name()).toBe("Local makers");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe(
      "Things made in Sarajevo",
    );
    expect(screen.getByTestId("tags").textContent).toBe("Food");
    expect(screen.getByTestId("location").textContent).toBe("Sarajevo");

    await typeName("Local makers and growers");
    setViewport(false);
    expect(await name()).toBe("Local makers and growers");
  });

  it("keeps the empty image value without any upload bytes", async () => {
    render(creator());
    await typeName("Local makers");

    const [stored] = Object.values(entries());
    expect(stored.value).toMatchObject({ imageUrl: "" });
    expect(JSON.stringify(entries())).not.toMatch(/blob:|data:/);
  });

  it("keeps nothing while the form is as it opened, or is back to that", async () => {
    render(creator());
    await screen.findByLabelText("Name");
    expect(entries()).toEqual({});

    await typeName("Local makers");
    expect(Object.keys(entries())).toHaveLength(1);
    await typeName("");
    expect(entries()).toEqual({});
  });

  it("does not bring the form back after the person leaves and returns in the other layout", async () => {
    openViewport(false);
    const first = render(creator());
    await typeName("Abandoned");

    first.unmount();
    expect(entries()).toEqual({});
    openViewport(true);
    render(creator());

    expect(await name()).toBe("");
  });

  it("is scoped to the account, and absent for a guest", async () => {
    render(creator());
    await typeName("Alice's catalog");
    expect(Object.keys(entries())).toEqual([`${ALICE}:catalog-create`]);

    mocks.account.address = BOB;
    setViewport(true);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Create catalog" })).toBeTruthy(),
    );
    expect(await name()).toBe("");
  });
});
