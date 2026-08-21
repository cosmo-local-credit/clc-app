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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const OWNER = "0x33a573149db22e759fB9A38Bcc461C12855c2645";
const POOL_ADDRESS = "0x88a3c18f7329bb8b533e5be0d8b176ee1ed73563d";
const PIN = { lat: -1.3, lng: 36.85 };
const CKES = "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0";

const reverseLocation = vi.hoisted(() => vi.fn());
const getTokenTags = vi.hoisted(() => vi.fn());
const deployPool = vi.hoisted(() => vi.fn());
const trackOtx = vi.hoisted(() => vi.fn());
const getDeploymentContract = vi.hoisted(() => vi.fn());

vi.mock("#/lib/geo-client", () => ({
  reverseLocation: (...args: unknown[]) => reverseLocation(...args),
}));

// The images panel is hidden where the upload service is unconfigured, and the
// test env has no VITE_STORAGE_URL.
vi.mock("#/lib/storage", () => ({ isStorageConfigured: true }));

vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({
    mutateAsync: (input: { purpose: string }) =>
      Promise.resolve({
        url: `https://cdn.test/pool/x_${input.purpose === "pool.banner" ? 1280 : 400}_ab.webp`,
        width: 400,
        height: 400,
        byteSize: 6516,
        contentType: "image/webp",
      }),
    reset: () => {},
    isPending: false,
    isError: false,
  }),
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: ({
    onLocationChange,
  }: {
    onLocationChange?: (lat: number, lng: number) => void;
  }) => (
    <button type="button" onClick={() => onLocationChange?.(PIN.lat, PIN.lng)}>
      Set pin
    </button>
  ),
}));

vi.mock("#/lib/api", () => ({
  clcApi: {
    deployments: {
      getTokenTags: () => getTokenTags(),
      getDeploymentContract: (...args: unknown[]) => getDeploymentContract(...args),
    },
    poolDeploy: {
      deployPool: (...args: unknown[]) => deployPool(...args),
    },
    auth: {
      getSession: () => Promise.resolve({ address: OWNER, role: "SUPERADMIN" }),
      trackOtx: (...args: unknown[]) => trackOtx(...args),
    },
  },
}));

vi.mock("#/features/auth/admin-session", () => ({
  useAdminSession: () => ({
    status: "authenticated",
    operator: { address: OWNER, role: "SUPERADMIN" },
  }),
}));

const { PoolPublishPage } = await import("./pool-publish-page");

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const publish = createRoute({
    getParentRoute: () => root,
    path: "/pools/publish",
    component: PoolPublishPage,
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/pools/$address",
    component: () => <div>Pool record</div>,
    validateSearch: (search: Record<string, unknown>) => search,
  });
  const router = createRouter({
    routeTree: root.addChildren([publish, detail]),
    history: createMemoryHistory({ initialEntries: ["/pools/publish"] }),
  });
  return { router, ...render(<RouterProvider router={router} />) };
}

function fieldValue(name: string): string {
  const field = screen.getByRole("textbox", { name });
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
    ? field.value
    : "";
}

async function fillRequiredFields() {
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Kilifi Market" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Symbol" }), {
    target: { value: "klf" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
    target: { value: "A weekly market pool" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Set pin" }));
  await waitFor(() => expect(fieldValue("Location")).toBe("Kilifi, Kenya"));
  const tagSearch = await screen.findByRole("combobox", { name: "Search pool tags" });
  fireEvent.click(tagSearch);
  fireEvent.click(screen.getByRole("option", { name: "Agriculture" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
    target: { value: "steward@kilifi.test" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Phone" }), {
    target: { value: "+254700000000" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Website" }), {
    target: { value: "https://kilifi.test" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Terms URL" }), {
    target: { value: "https://kilifi.test/terms" },
  });
}

describe("PoolPublishPage", () => {
  beforeEach(() => {
    reverseLocation.mockReset();
    getTokenTags.mockReset();
    deployPool.mockReset();
    trackOtx.mockReset();
    getDeploymentContract.mockReset();
    reverseLocation.mockResolvedValue("Kilifi, Kenya");
    getTokenTags.mockResolvedValue(["Agriculture", "Food"]);
    deployPool.mockResolvedValue({ trackingId: "track-1" });
    trackOtx.mockResolvedValue({
      otx: [
        {
          id: 1,
          trackingId: "track-1",
          otxType: "POOL_PROXY_DEPLOY",
          txHash: "0xabc",
          nonce: 1,
          replaced: false,
          createdAt: "2026-08-19T00:00:00Z",
          status: "SUCCESS",
        },
      ],
    });
    getDeploymentContract.mockResolvedValue({
      address: POOL_ADDRESS,
      admin: OWNER,
      name: "Kilifi Market",
      symbol: "KLF",
      status: "CONFIRMED",
      decimals: 6,
    });
  });

  it("names a dropped pin and publishes the pair with selected tags", async () => {
    const { router } = renderPage();

    expect(await screen.findByRole("heading", { name: "Publish pool" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Symbol" })).toBeTruthy();
    expect(screen.getByLabelText("Oracle base currency")).toBeTruthy();
    expect(screen.getByText("0x33a573…5c2645")).toBeTruthy();
    expect(screen.queryByText("Decimals")).toBeNull();
    expect(screen.queryByText("Request")).toBeNull();
    expect(screen.queryByLabelText("Latitude")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByRole("button", { name: "Publish pool" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("definition", { name: "Name" }).textContent).toBe("—");
    expect(screen.getByRole("definition", { name: "Email" }).textContent).toBe("—");
    expect(screen.getByRole("definition", { name: "Pin" }).textContent).toBe("—");

    await fillRequiredFields();
    fireEvent.change(screen.getByRole("textbox", { name: "Default fee (%)" }), {
      target: { value: "0.5" },
    });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Hold fees separately" }));

    expect(reverseLocation).toHaveBeenCalledWith(PIN.lat, PIN.lng, expect.anything());
    expect(screen.getByRole("button", { name: "Publish pool" }).hasAttribute("disabled")).toBe(
      false,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish pool" }));

    await waitFor(() => expect(deployPool).toHaveBeenCalledTimes(1));
    expect(deployPool).toHaveBeenCalledWith({
      name: "Kilifi Market",
      symbol: "KLF",
      decimals: "6",
      owner: OWNER,
      quoterType: "oracle",
      feesDecoupled: true,
      feePolicyDefault: "0.5",
      baseCurrency: CKES,
      description: "A weekly market pool",
      locationName: "Kilifi, Kenya",
      geoLat: PIN.lat,
      geoLng: PIN.lng,
      email: "steward@kilifi.test",
      website: "https://kilifi.test",
      phone: "+254700000000",
      terms: "https://kilifi.test/terms",
      tags: ["Agriculture"],
    });
    await waitFor(() => expect(trackOtx).toHaveBeenCalledWith("track-1"));
    await waitFor(() => expect(getDeploymentContract).toHaveBeenCalled());
    await waitFor(() => expect(router.state.location.pathname).toBe(`/pools/${POOL_ADDRESS}`));
  });

  it("stays on the publish page when the deployment reverts", async () => {
    trackOtx.mockResolvedValue({
      otx: [
        {
          id: 1,
          trackingId: "track-1",
          otxType: "POOL_TOKEN_INDEX_DEPLOY",
          txHash: "0xabc",
          nonce: 1,
          replaced: false,
          createdAt: "2026-08-19T00:00:00Z",
          status: "REVERTED",
        },
      ],
    });

    const { router } = renderPage();
    expect(await screen.findByRole("heading", { name: "Publish pool" })).toBeTruthy();
    await fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Publish pool" }));

    await waitFor(() => expect(trackOtx).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("Transaction failed on-chain (REVERTED).")).toBeTruthy(),
    );
    expect(getDeploymentContract).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/pools/publish");
  });

  it("offers the oracle base currencies by ISO code", async () => {
    renderPage();
    fireEvent.click(await screen.findByLabelText("Oracle base currency"));
    for (const code of ["KES", "USD", "BAM", "BTN", "EUR", "INR", "ZAR"]) {
      expect(screen.getByRole("option", { name: code })).toBeTruthy();
    }
  });

  it("binds a filled field onto the deployment card", async () => {
    renderPage();
    expect((await screen.findByRole("definition", { name: "Name" })).textContent).toBe("—");

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Kilifi Market" },
    });

    await waitFor(() =>
      expect(screen.getByRole("definition", { name: "Name" }).textContent).toBe("Kilifi Market"),
    );
  });

  it("hides the hold-fees checkbox when the fee is zero", async () => {
    renderPage();
    expect(await screen.findByRole("textbox", { name: "Default fee (%)" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Hold fees separately" })).toBeNull();
  });
});

describe("PoolPublishPage images", () => {
  // The same priming the block above uses: fillRequiredFields drops a pin, which
  // only names itself when the geocoder answers.
  beforeEach(() => {
    reverseLocation.mockReset();
    getTokenTags.mockReset();
    deployPool.mockReset();
    reverseLocation.mockResolvedValue("Kilifi, Kenya");
    getTokenTags.mockResolvedValue(["Agriculture", "Food"]);
    deployPool.mockResolvedValue({ trackingId: "track-1" });
  });

  it("publishes without images, sending neither key", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Publish pool" })).toBeTruthy();
    await fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Publish pool" }));

    await waitFor(() => expect(deployPool).toHaveBeenCalledTimes(1));
    const payload = deployPool.mock.calls[0]![0] as object;
    // Absent rather than "": the deploy request treats these as optional, and an
    // empty string is not a URL clc-core would accept.
    expect("imageUrl" in payload).toBe(false);
    expect("bannerUrl" in payload).toBe(false);
  });

  it("carries an uploaded logo and banner into the deploy request", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Publish pool" })).toBeTruthy();
    await fillRequiredFields();

    fireEvent.change(screen.getByLabelText("Logo", { selector: "input" }), {
      target: { files: [new File([new Uint8Array(8)], "logo.png", { type: "image/png" })] },
    });
    fireEvent.change(screen.getByLabelText("Banner", { selector: "input" }), {
      target: { files: [new File([new Uint8Array(8)], "banner.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getAllByRole("button", { name: /replace/i }).length).toBe(2));

    fireEvent.click(screen.getByRole("button", { name: "Publish pool" }));

    await waitFor(() => expect(deployPool).toHaveBeenCalledTimes(1));
    expect(deployPool.mock.calls[0]![0]).toMatchObject({
      imageUrl: "https://cdn.test/pool/x_400_ab.webp",
      bannerUrl: "https://cdn.test/pool/x_1280_ab.webp",
    });
  });
});
