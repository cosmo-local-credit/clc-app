import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { BackendApiError } from "@clc/api/client/errors";
import { AddToCatalogButton } from "#/components/catalogs/add-to-catalog-button";
import { useCatalogVisibilityStore } from "#/features/home/state/catalog-visibility";
import { CatalogCreatePage } from "./catalog-create-page";
import { CatalogDetailPage } from "./catalog-detail-page";
import { CatalogsPage } from "./catalogs-page";
import { CatalogShareButton } from "./catalog-share-button";
import { CatalogForm } from "./catalog-form";

const mocks = vi.hoisted(() => ({
  api: {
    mine: vi.fn(),
    list: vi.fn(),
    detail: vi.fn(),
    members: vi.fn(),
    membership: vi.fn(),
    setMember: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  auth: {
    address: `0x${"a".repeat(40)}`,
    chainId: 100,
    error: null,
    isAuthenticated: true,
    isLoading: false,
    state: "authenticated",
    session: { address: `0x${"a".repeat(40)}` },
    retry: vi.fn(),
  },
  profile: {
    data: { geoLat: 43, geoLng: 18, locationName: "Sarajevo" } as {
      geoLat: number | null;
      geoLng: number | null;
      locationName: string;
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  navigate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
const quotaMock = vi.hoisted(() => ({
  data: {
    vouchers: { used: 0, limit: 1, canCreate: true, unlimited: false },
    catalogs: { used: 0, limit: 1, canCreate: true, unlimited: false },
    offers: { used: 0, limit: 3, canCreate: true, unlimited: false },
    pools: { used: 0, limit: 10, canCreate: true, unlimited: false },
  },
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock("#/hooks/use-resource-usage", () => ({ useResourceUsage: () => quotaMock }));

vi.mock("#/lib/api/catalogs", () => ({ catalogsClient: mocks.api }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => mocks.auth }));
vi.mock("#/features/home/hooks/use-creditable-browse", () => ({
  useCreditableBrowse: () => ({
    auth: mocks.auth,
    parsed: { ok: true, enabled: null },
    enabled: false,
    verification: { status: "idle", pools: [], retry: vi.fn() },
    poolRefs: undefined,
    blocksResults: false,
  }),
}));
vi.mock("#/components/creditable-browse-control", () => ({
  CreditableBrowseControl: ({
    part,
    onChange,
    onClear,
  }: {
    part: "control" | "feedback";
    onChange: (checked: boolean) => void;
    onClear: () => void;
  }) => (
    <div data-testid={`credit-${part}`}>
      <button type="button" onClick={() => onChange(true)}>
        {part} Credit on
      </button>
      <button type="button" onClick={onClear}>
        {part} Credit clear
      </button>
    </div>
  ),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({ useAuthProfile: () => mocks.profile }));
vi.mock("#/features/home/hooks/use-discovery-distance-origin", () => ({
  useDiscoveryDistanceOrigin: () => {
    const { geoLat, geoLng } = mocks.profile.data;
    return mocks.auth.isAuthenticated && geoLat !== null && geoLng !== null
      ? { lat: geoLat, lng: geoLng }
      : null;
  },
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("#/components/wallet", () => ({ BackChevron: () => <a href="/">Back</a> }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useSearch: () => ({}),
  Link: ({
    to,
    params,
    search,
    hash,
    hashScrollIntoView: _hashScrollIntoView,
    children,
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
    hash?: string;
    hashScrollIntoView?: boolean;
    children: ReactNode;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (value, [key, replacement]) => value.replace(`$${key}`, replacement),
      to,
    );
    const query = search ? `?${new URLSearchParams(search)}` : "";
    return <a href={`${path}${query}${hash ? `#${hash}` : ""}`}>{children}</a>;
  },
}));
vi.mock("#/components/ui/image-upload-field", () => ({
  ImageUploadField: ({ onChange }: { onChange: (url: string | null) => void }) => (
    <button type="button" onClick={() => onChange(null)}>
      Clear catalog picture
    </button>
  ),
}));
vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({ value, error }: { value?: { locationName: string }; error?: string }) => (
    <div>
      {value?.locationName}
      {error}
    </div>
  ),
}));

const catalog = {
  id: "7",
  name: "Local makers",
  description: null,
  imageUrl: null,
  locationName: "Sarajevo",
  geoLat: 43,
  geoLng: 18,
  ownerAddress: `0x${"a".repeat(40)}` as `0x${string}`,
  poolCount: 0,
  voucherCount: 0,
  distanceMeters: null,
  createdAt: "2026-10-10",
  updatedAt: "2026-10-10",
  tags: [],
};
const intent = {
  kind: "pool" as const,
  resourceId: "12",
  address: `0x${"b".repeat(40)}` as `0x${string}`,
};
function mount(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
    queryClient,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  quotaMock.data.catalogs = { used: 0, limit: 1, canCreate: true, unlimited: false };
  quotaMock.isError = false;
  window.localStorage.clear();
  useCatalogVisibilityStore.setState({ visibility: "1000" });
  mocks.auth.isAuthenticated = true;
  mocks.auth.isLoading = false;
  mocks.auth.state = "authenticated";
  mocks.auth.error = null;
  mocks.auth.session.address = catalog.ownerAddress;
  mocks.profile.data = { geoLat: 43, geoLng: 18, locationName: "Sarajevo" };
  mocks.profile.isPending = false;
  mocks.profile.isError = false;
  mocks.api.mine.mockResolvedValue({ catalogs: [catalog], nextCursor: null });
  mocks.api.membership.mockResolvedValue({ added: false });
  mocks.api.setMember.mockResolvedValue({ added: true });
  mocks.api.list.mockResolvedValue({ catalogs: [catalog], nextCursor: null });
  mocks.api.detail.mockResolvedValue(catalog);
  mocks.api.members.mockResolvedValue({ items: [], nextCursor: null });
  mocks.api.create.mockResolvedValue(catalog);
  mocks.api.update.mockResolvedValue(catalog);
});
describe("catalog curation", () => {
  it("routes an empty wallet through creation with a validated pool intent", async () => {
    mocks.api.mine.mockResolvedValue({ catalogs: [], nextCursor: null });
    mount(<AddToCatalogButton {...intent} />);
    const link = await screen.findByRole("link", { name: "Add to catalog" });
    const url = new URL(link.getAttribute("href")!, "https://app.test");
    expect(url.pathname).toBe("/catalogs/create");
    expect(url.searchParams.get("kind")).toBe("pool");
    expect(url.searchParams.get("resourceId")).toBe("12");
    expect(mocks.api.setMember).not.toHaveBeenCalled();
  });
  it("adds exactly the selected pool and prevents a duplicate tap", async () => {
    mocks.api.membership.mockResolvedValueOnce({ added: false }).mockResolvedValue({ added: true });
    mount(<AddToCatalogButton {...intent} />);
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Add to catalog" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to catalog" }));
    expect(await screen.findByRole("button", { name: "Added to catalog" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(mocks.api.setMember).toHaveBeenCalledExactlyOnceWith("7", "pool", "12", true);
  });
  it("retries both owner and membership reads after membership fails", async () => {
    mocks.api.membership.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({
      added: false,
    });
    mount(<AddToCatalogButton {...intent} />);

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mocks.api.mine).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.api.membership).toHaveBeenCalledTimes(2));
  });
  it("keeps Add to catalog usable and reports a failed mutation", async () => {
    mocks.api.setMember.mockRejectedValueOnce(new Error("offline"));
    mount(<AddToCatalogButton {...intent} />);
    const add = await screen.findByRole("button", { name: "Add to catalog" });

    await waitFor(() => expect(add).toHaveProperty("disabled", false));

    fireEvent.click(add);
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("Couldn't update the catalog. Try again."),
    );
    expect(add).toHaveProperty("disabled", false);
  });
  it("does not read owner data for guests", () => {
    mocks.auth.isAuthenticated = false;
    mount(<AddToCatalogButton {...intent} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(mocks.api.mine).not.toHaveBeenCalled();
    expect(mocks.api.membership).not.toHaveBeenCalled();
  });
  it("keeps a created catalog after the initial add fails and retries only the add", async () => {
    mocks.api.mine.mockResolvedValue({ catalogs: [], nextCursor: null });
    mocks.api.setMember
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ added: true });
    mount(<CatalogCreatePage intent={intent} />);
    fireEvent.change(await screen.findByRole("textbox", { name: "Name" }), {
      target: { value: "Local makers" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create catalog" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Catalog saved. The item couldn't be added. Try again.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to catalog" }));
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/pools/$poolAddress",
        params: { poolAddress: intent.address },
        replace: true,
      }),
    );
    expect(mocks.api.create).toHaveBeenCalledTimes(1);
    expect(mocks.api.setMember).toHaveBeenCalledTimes(2);
  });
  it("routes a newly created catalog to its canonical detail page", async () => {
    mocks.api.mine.mockResolvedValue({ catalogs: [], nextCursor: null });
    mount(<CatalogCreatePage />);
    fireEvent.change(await screen.findByRole("textbox", { name: "Name" }), {
      target: { value: "Local makers" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create catalog" }));

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/catalogs/$catalogId",
        params: { catalogId: "7" },
        replace: true,
      }),
    );
  });
  it("returns a voucher creation intent to the voucher after adding it", async () => {
    const voucherIntent = {
      kind: "voucher" as const,
      resourceId: "13",
      address: `0x${"c".repeat(40)}` as `0x${string}`,
    };
    mocks.api.mine.mockResolvedValue({ catalogs: [], nextCursor: null });
    mount(<CatalogCreatePage intent={voucherIntent} />);
    fireEvent.change(await screen.findByRole("textbox", { name: "Name" }), {
      target: { value: "Local makers" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create catalog" }));

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/vouchers/$voucherAddress",
        params: { voucherAddress: voucherIntent.address },
        replace: true,
      }),
    );
    expect(mocks.api.setMember).toHaveBeenCalledWith("7", "voucher", "13", true);
  });
  it("retries a failed owner-catalog read before showing the create form", async () => {
    mocks.api.mine
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ catalogs: [], nextCursor: null });
    mount(<CatalogCreatePage />);

    expect(await screen.findByText("Couldn't load catalogs.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("textbox", { name: "Name" })).toBeTruthy();
    expect(mocks.api.mine).toHaveBeenCalledTimes(2);
  });
  it("reports quota failures without navigating or hiding the form", async () => {
    mocks.api.mine.mockResolvedValue({ catalogs: [], nextCursor: null });
    mocks.api.create.mockRejectedValueOnce(new BackendApiError(429, "limit reached", "E11"));
    const view = mount(<CatalogCreatePage />);
    const invalidate = vi.spyOn(view.queryClient, "invalidateQueries");
    fireEvent.change(await screen.findByRole("textbox", { name: "Name" }), {
      target: { value: "Local makers" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create catalog" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Catalog limit reached. Ask an administrator to increase your allowance.",
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["clc", "catalogs", "mine"] });
    expect(screen.getByRole("button", { name: "Create catalog" })).toBeTruthy();
  });
  it("updates an existing catalog using its stored image and location", async () => {
    const onSaved = vi.fn();
    mount(<CatalogForm catalog={catalog} onSaved={onSaved} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "New name" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "Updated directory" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear catalog picture" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.api.update).toHaveBeenCalledWith("7", {
      name: "New name",
      description: "Updated directory",
      imageUrl: "",
      geoLat: 43,
      geoLng: 18,
      locationName: "Sarajevo",
      tags: [],
    });
    expect(mocks.api.create).not.toHaveBeenCalled();
  });
  it("shows a general save error for conflicts without a quota code", async () => {
    mocks.api.update.mockRejectedValue(new BackendApiError(409, "already exists"));
    const view = mount(<CatalogForm catalog={{ ...catalog, tags: ["Food"] }} onSaved={vi.fn()} />);
    const invalidate = vi.spyOn(view.queryClient, "invalidateQueries");

    expect(screen.getByRole("button", { name: "Remove Food" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Couldn't save the catalog. Try again.",
    );
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["clc", "catalogs", "mine"] });
  });
  it("keeps a generic catalog save failure visible and retryable", async () => {
    mocks.api.update.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(catalog);
    const onSaved = vi.fn();
    mount(<CatalogForm catalog={catalog} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Couldn't save the catalog. Try again.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(catalog));
  });
  it("shows editing only for the backend session owner", async () => {
    mocks.auth.session.address = `0x${"c".repeat(40)}`;
    mount(<CatalogDetailPage id="7" />);
    await screen.findByRole("heading", { name: "Local makers" });
    expect(screen.queryByRole("button", { name: "Edit catalog" })).toBeNull();
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
  });
  it("lets the owner edit and remove one pool relationship", async () => {
    const item = {
      id: "12",
      chainId: 100,
      address: intent.address,
      name: "Community pool",
      imageUrl: null,
    };
    mocks.api.members.mockImplementation((_id, kind) =>
      Promise.resolve({ items: kind === "pool" ? [item] : [], nextCursor: null }),
    );
    mount(<CatalogDetailPage id="7" />);
    expect(await screen.findByRole("button", { name: "Edit catalog" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Remove Community pool" }));
    await waitFor(() =>
      expect(mocks.api.setMember).toHaveBeenCalledExactlyOnceWith("7", "pool", "12", false),
    );
  });
  it("paginates pool membership only after Load more", async () => {
    const item = {
      id: "12",
      chainId: 100,
      address: intent.address,
      name: "Community pool",
      imageUrl: null,
    };
    mocks.api.members.mockImplementation((_id, kind, cursor) =>
      Promise.resolve(
        kind === "pool"
          ? { items: cursor ? [] : [item], nextCursor: cursor ? null : "next-pool" }
          : { items: [], nextCursor: null },
      ),
    );
    mount(<CatalogDetailPage id="7" />);

    const pools = await screen.findByRole("region", { name: "Pools" });
    expect(mocks.api.members).not.toHaveBeenCalledWith("7", "pool", "next-pool");
    fireEvent.click(await within(pools).findByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(mocks.api.members).toHaveBeenCalledWith("7", "pool", "next-pool", expect.anything()),
    );
  });
  it("retries a failed member list and reports a failed removal", async () => {
    const item = {
      id: "12",
      chainId: 100,
      address: intent.address,
      name: "Community pool",
      imageUrl: null,
    };
    let poolAttempts = 0;
    mocks.api.members.mockImplementation((_id, kind) => {
      if (kind !== "pool") return Promise.resolve({ items: [], nextCursor: null });
      poolAttempts += 1;
      return poolAttempts === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({ items: [item], nextCursor: null });
    });
    mocks.api.setMember.mockRejectedValueOnce(new Error("offline"));
    mount(<CatalogDetailPage id="7" />);

    const pools = await screen.findByRole("region", { name: "Pools" });
    fireEvent.click(await within(pools).findByRole("button", { name: "Retry" }));
    const remove = await within(pools).findByRole("button", { name: "Remove Community pool" });
    fireEvent.click(remove);
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("Couldn't update the catalog. Try again."),
    );
  });
  it("renders description and tags, edits as the owner, and closes after saving", async () => {
    const detailed = { ...catalog, description: "Local food and services", tags: ["Food"] };
    mocks.api.detail.mockResolvedValue(detailed);
    mocks.api.update.mockResolvedValue(detailed);
    mount(<CatalogDetailPage id="7" />);

    expect(await screen.findByText("Local food and services")).toBeTruthy();
    expect(screen.getByText("Food")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit catalog" }));
    expect(screen.getByRole("dialog", { name: "Edit catalog" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit catalog" })).toBeNull());
  });
  it("retries a failed catalog detail request", async () => {
    mocks.api.detail.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(catalog);
    mount(<CatalogDetailPage id="7" />);

    expect(await screen.findByRole("heading", { name: "Couldn't load catalogs." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Local makers" })).toBeTruthy();
  });
  it("changes ownership data when the active session changes", async () => {
    const other = `0x${"c".repeat(40)}`;
    mocks.api.mine
      .mockResolvedValueOnce({ catalogs: [catalog], nextCursor: null })
      .mockResolvedValue({ catalogs: [], nextCursor: null });
    const view = mount(<AddToCatalogButton {...intent} />);
    await waitFor(() => expect(mocks.api.membership).toHaveBeenCalled());
    mocks.auth.session.address = other;
    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <AddToCatalogButton {...intent} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("link", { name: "Add to catalog" })).toBeTruthy();
    expect(mocks.api.mine).toHaveBeenCalledTimes(2);
  });
});
describe("catalog discovery", () => {
  it("writes and clears Credit from both shell and feedback controls", async () => {
    mount(<CatalogsPage />);
    await screen.findByText("Local makers");

    fireEvent.click(screen.getByRole("button", { name: "control Credit on" }));
    fireEvent.click(screen.getByRole("button", { name: "control Credit clear" }));
    fireEvent.click(screen.getByRole("button", { name: "feedback Credit on" }));
    fireEvent.click(screen.getByRole("button", { name: "feedback Credit clear" }));

    expect(mocks.navigate).toHaveBeenCalledTimes(4);
    const previous = { scope: "catalogs", q: "local", creditable: false };
    const [shellOn, shellClear, feedbackOn, feedbackClear] = mocks.navigate.mock.calls.map(
      ([call]) => call,
    );
    expect(shellOn).toMatchObject({ to: "/market" });
    expect(shellOn.search(previous)).toEqual({ ...previous, creditable: true });
    expect(shellClear).toMatchObject({ to: "/market", replace: true });
    expect(shellClear.search(previous)).toEqual({ scope: "catalogs", q: "local" });
    expect(feedbackOn).toMatchObject({ to: "/market" });
    expect(feedbackOn.search(previous)).toEqual({ ...previous, creditable: true });
    expect(feedbackClear).toMatchObject({ to: "/market", replace: true });
    expect(feedbackClear.search(previous)).toEqual({ scope: "catalogs", q: "local" });
  });

  it("uses nearby session discovery at the established radius", async () => {
    mocks.api.list.mockResolvedValue({
      catalogs: [{ ...catalog, geoLat: -10, geoLng: -10 }],
      nextCursor: null,
    });
    mount(<CatalogsPage />);
    await screen.findByText("Local makers");
    expect(mocks.api.list).toHaveBeenCalledWith(
      {
        cursor: undefined,
        facets: true,
        nearby: true,
        pools: undefined,
        q: "",
        tagMatch: "any",
        tags: [],
      },
      expect.any(AbortSignal),
    );
    const distance = screen.getByRole("link", { name: "1,000 km" });
    const profile = screen.getByRole("link", { name: "profile location" });
    expect(distance.getAttribute("href")).toBe("/?tab=settings#visibility");
    expect(profile.getAttribute("href")).toBe("/settings/profile");
    expect(distance.closest("p")?.textContent).toBe(
      "Showing results within 1,000 km of your saved profile location.",
    );
  });

  it("uses public unfiltered discovery for authenticated Global visibility", async () => {
    useCatalogVisibilityStore.getState().setVisibility("global");
    mount(<CatalogsPage />);
    await screen.findByText("Local makers");
    expect(mocks.api.list).toHaveBeenCalledWith(
      {
        cursor: undefined,
        facets: true,
        nearby: false,
        pools: undefined,
        q: "",
        tagMatch: "any",
        tags: [],
      },
      expect.any(AbortSignal),
    );
    const global = screen.getByRole("link", { name: "globally" });
    expect(global.getAttribute("href")).toBe("/?tab=settings#visibility");
    expect(global.closest("p")?.textContent).toBe("Showing catalogs globally.");
  });

  it("filters nearby pages to the selected distance and stops after the boundary", async () => {
    useCatalogVisibilityStore.getState().setVisibility("100");
    mocks.api.list.mockResolvedValue({
      catalogs: [
        { ...catalog, id: "7", name: "Near catalog", geoLat: 43.2 },
        { ...catalog, id: "8", name: "Far catalog", geoLat: 44.2 },
      ],
      nextCursor: "next",
    });

    mount(<CatalogsPage />);

    expect(await screen.findByText("Near catalog")).toBeTruthy();
    expect(screen.queryByText("Far catalog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("applies the smallest 50 km visibility choice", async () => {
    useCatalogVisibilityStore.getState().setVisibility("50");
    mocks.api.list.mockResolvedValue({
      catalogs: [
        { ...catalog, id: "7", name: "Inside 50 km", geoLat: 43.2 },
        { ...catalog, id: "8", name: "Outside 50 km", geoLat: 43.6 },
      ],
      nextCursor: null,
    });

    mount(<CatalogsPage />);

    expect(await screen.findByText("Inside 50 km")).toBeTruthy();
    expect(screen.queryByText("Outside 50 km")).toBeNull();
    expect(screen.getByRole("link", { name: "50 km" }).getAttribute("href")).toBe(
      "/?tab=settings#visibility",
    );
  });

  it("continues nearest-first pagination until a later page crosses the boundary", async () => {
    useCatalogVisibilityStore.getState().setVisibility("500");
    mocks.api.list
      .mockResolvedValueOnce({
        catalogs: [{ ...catalog, id: "7", name: "First nearby", geoLat: 43.2 }],
        nextCursor: "next",
      })
      .mockResolvedValueOnce({
        catalogs: [{ ...catalog, id: "8", name: "Outside radius", geoLat: 49 }],
        nextCursor: "later",
      });

    mount(<CatalogsPage />);

    expect(await screen.findByText("First nearby")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(mocks.api.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Outside radius")).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
  it("lists catalogs everywhere, saying so, when the profile lacks a location", async () => {
    mocks.profile.data.geoLat = null;
    mount(<CatalogsPage />);
    expect(screen.getByText("Choose a location")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit profile" })).toBeTruthy();
    await waitFor(() => expect(mocks.api.list).toHaveBeenCalled());
    expect(mocks.api.list.mock.calls[0]?.[0]).not.toHaveProperty("nearby", true);
  });

  it("keeps discovery hidden and retries a failed profile request", () => {
    mocks.profile.isError = true;
    mount(<CatalogsPage />);
    expect(screen.getByText("We couldn't load your profile.")).toBeTruthy();
    expect(mocks.api.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.auth.retry).toHaveBeenCalledTimes(1);
    expect(mocks.profile.refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps query failures retryable without displaying stale rows", async () => {
    mocks.api.list.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({
      catalogs: [catalog],
      nextCursor: null,
    });
    mount(<CatalogsPage />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Couldn't load catalogs.",
    );
    expect(screen.queryByText("Local makers")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Local makers")).toBeTruthy();
  });
  it("allows public guest discovery", async () => {
    mocks.auth.isAuthenticated = false;
    mount(<CatalogsPage />);
    await screen.findByText("Local makers");
    expect(mocks.api.list).toHaveBeenCalledWith(
      {
        cursor: undefined,
        facets: true,
        nearby: false,
        pools: undefined,
        q: "",
        tagMatch: "any",
        tags: [],
      },
      expect.any(AbortSignal),
    );
  });
});
describe("catalog sharing", () => {
  it("ignores native share cancellation", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    mount(<CatalogShareButton id="7" name="Local makers" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(mocks.error).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  });
  it("copies a public catalog link when native share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    mount(<CatalogShareButton id="7" name="Local makers" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/catalogs/7`),
    );
  });
  it("requires a fresh tap to copy after a native-share failure", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("unsupported")),
    });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    mount(<CatalogShareButton id="7" name="Local makers" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    const copy = await screen.findByRole("button", { name: "Copy link" });
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  });
});

describe("adjustable catalog allowance", () => {
  it("allows a second catalog when an admin raises the allowance", async () => {
    quotaMock.data.catalogs = { used: 1, limit: 2, canCreate: true, unlimited: false };
    mount(<CatalogCreatePage />);
    expect(await screen.findByRole("textbox", { name: "Name" })).toBeTruthy();
    expect(screen.getByText(/1 of 2 used/)).toBeTruthy();
  });
  it("explains a full allowance and keeps existing catalogs accessible", async () => {
    quotaMock.data.catalogs = { used: 1, limit: 1, canCreate: false, unlimited: false };
    mount(<CatalogCreatePage />);
    expect(
      await screen.findByText("Limit reached. Ask an administrator to increase your allowance."),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(screen.getByRole("link", { name: catalog.name }).getAttribute("href")).toBe(
      "/catalogs/7",
    );
  });
  it("adds an item to the catalog the user selects", async () => {
    mocks.api.mine.mockResolvedValue({
      catalogs: [catalog, { ...catalog, id: "8", name: "Second catalog" }],
      nextCursor: null,
    });
    mount(<AddToCatalogButton {...intent} />);
    fireEvent.change(await screen.findByLabelText("Choose catalog"), { target: { value: "8" } });
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Add to catalog" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to catalog" }));
    await waitFor(() => expect(mocks.api.setMember).toHaveBeenCalledWith("8", "pool", "12", true));
  });
});
