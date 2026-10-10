import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AddToCatalogButton } from "#/components/catalogs/add-to-catalog-button";
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
vi.mock("#/lib/api/catalogs", () => ({ catalogsClient: mocks.api }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => mocks.auth }));
vi.mock("#/features/auth/hooks/use-profile", () => ({ useAuthProfile: () => mocks.profile }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("#/components/wallet", () => ({ BackChevron: () => <a href="/">Back</a> }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({
    to,
    params,
    search,
    children,
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
    children: ReactNode;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (value, [key, replacement]) => value.replace(`$${key}`, replacement),
      to,
    );
    return <a href={search ? `${path}?${new URLSearchParams(search)}` : path}>{children}</a>;
  },
}));
vi.mock("#/components/ui/image-upload-field", () => ({
  ImageUploadField: () => <div>Image picker</div>,
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
  mocks.auth.isAuthenticated = true;
  mocks.auth.session.address = catalog.ownerAddress;
  mocks.profile.data = { geoLat: 43, geoLng: 18, locationName: "Sarajevo" };
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
  it("updates an existing catalog using its stored image and location", async () => {
    const onSaved = vi.fn();
    mount(<CatalogForm catalog={catalog} onSaved={onSaved} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "New name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.api.update).toHaveBeenCalledWith("7", {
      name: "New name",
      imageUrl: "",
      geoLat: 43,
      geoLng: 18,
      locationName: "Sarajevo",
    });
    expect(mocks.api.create).not.toHaveBeenCalled();
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
  it("uses nearby session discovery at the established radius", async () => {
    mount(<CatalogsPage />);
    await screen.findByText("Local makers");
    expect(mocks.api.list).toHaveBeenCalledWith(
      { cursor: undefined, nearby: true },
      expect.any(AbortSignal),
    );
    expect(
      screen.getByText("Showing results within 1,000 km of your saved profile location."),
    ).toBeTruthy();
  });
  it("does not silently fall back to a global list when the profile lacks a location", () => {
    mocks.profile.data.geoLat = null;
    mount(<CatalogsPage />);
    expect(screen.getByRole("link", { name: "Edit profile" })).toBeTruthy();
    expect(mocks.api.list).not.toHaveBeenCalled();
  });
  it("allows public guest discovery", async () => {
    mocks.auth.isAuthenticated = false;
    mount(<CatalogsPage />);
    await screen.findByText("Local makers");
    expect(mocks.api.list).toHaveBeenCalledWith(
      { cursor: undefined, nearby: false },
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
