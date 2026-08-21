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

const OPERATOR = "0x33a573149db22e759fB9A38Bcc461C12855c2645";
const ISSUER = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const VOUCHER_ADDRESS = "0x88a3c18f7329bb8b533e5be0d8b176ee1ed73563d";
const PIN = { lat: -3.5107, lng: 39.9093 };

const reverseLocation = vi.hoisted(() => vi.fn());
const getTokenTags = vi.hoisted(() => vi.fn());
const deployVoucher = vi.hoisted(() => vi.fn());
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
        url: `https://cdn.test/voucher/x_${input.purpose === "voucher.banner" ? 1280 : 400}_ab.webp`,
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
    voucherDeploy: {
      deployVoucher: (...args: unknown[]) => deployVoucher(...args),
    },
    auth: {
      getSession: () => Promise.resolve({ address: OPERATOR, role: "SUPERADMIN" }),
      trackOtx: (...args: unknown[]) => trackOtx(...args),
    },
  },
}));

vi.mock("#/features/auth/admin-session", () => ({
  useAdminSession: () => ({
    status: "authenticated",
    operator: { address: OPERATOR, role: "SUPERADMIN" },
  }),
}));

const { VoucherPublishPage } = await import("./voucher-publish-page");

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
    path: "/vouchers/publish",
    component: VoucherPublishPage,
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/vouchers/$address",
    component: () => <div>Voucher record</div>,
    validateSearch: (search: Record<string, unknown>) => search,
  });
  const router = createRouter({
    routeTree: root.addChildren([publish, detail]),
    history: createMemoryHistory({ initialEntries: ["/vouchers/publish"] }),
  });
  return { router, ...render(<RouterProvider router={router} />) };
}

/**
 * Picks an option out of a Base UI select.
 *
 * A plain click is not enough. `SelectItem` ignores a mouse click on an item that
 * is not highlighted — the pointer normally highlights it on the way in, and
 * jsdom fires no hover — so the pointer is announced as touch, which is the one
 * pointer type the item commits without a prior highlight.
 */
function selectOption(trigger: HTMLElement, optionName: string) {
  fireEvent.click(trigger);
  const option = screen.getByRole("option", { name: optionName });
  fireEvent.pointerDown(option, { pointerType: "touch" });
  fireEvent.click(option);
}

function fieldValue(name: string): string {
  const field = screen.getByRole("textbox", { name });
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
    ? field.value
    : "";
}

async function fillRequiredFields() {
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Kilifi Harvest" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Symbol" }), {
    target: { value: "khv" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: /^Description/ }), {
    target: { value: "A basket of fresh food" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Set pin" }));
  await waitFor(() => expect(fieldValue("Location")).toBe("Kilifi, Kenya"));
  const tagSearch = await screen.findByRole("combobox", { name: "Search voucher tags" });
  fireEvent.click(tagSearch);
  fireEvent.click(screen.getByRole("option", { name: "Agriculture" }));
}

describe("VoucherPublishPage", () => {
  beforeEach(() => {
    reverseLocation.mockReset();
    getTokenTags.mockReset();
    deployVoucher.mockReset();
    trackOtx.mockReset();
    getDeploymentContract.mockReset();
    reverseLocation.mockResolvedValue("Kilifi, Kenya");
    getTokenTags.mockResolvedValue(["Agriculture", "Food"]);
    deployVoucher.mockResolvedValue({ trackingId: "track-1" });
    trackOtx.mockResolvedValue({
      otx: [
        {
          id: 1,
          trackingId: "track-1",
          otxType: "TOKEN_PROXY_DEPLOY",
          txHash: "0xabc",
          nonce: 1,
          replaced: false,
          createdAt: "2026-08-19T00:00:00Z",
          status: "SUCCESS",
        },
      ],
    });
    getDeploymentContract.mockResolvedValue({
      address: VOUCHER_ADDRESS,
      admin: OPERATOR,
      name: "Kilifi Harvest",
      symbol: "KHV",
      status: "CONFIRMED",
      decimals: 6,
    });
  });

  it("publishes the deploy payload and opens the new record", async () => {
    const { router } = renderPage();

    expect(await screen.findByRole("heading", { name: "Publish voucher" })).toBeTruthy();
    // Contact is optional on this endpoint, so an empty row must not be flagged
    // the way the pool form's required rows are.
    expect(screen.getByRole("definition", { name: "Email" }).textContent).toBe("—");
    expect(screen.getByRole("definition", { name: "Name" }).textContent).toBe("—");
    expect(screen.getByRole("button", { name: "Publish voucher" }).hasAttribute("disabled")).toBe(
      true,
    );

    await fillRequiredFields();

    expect(reverseLocation).toHaveBeenCalledWith(PIN.lat, PIN.lng, expect.anything());
    expect(screen.getByRole("button", { name: "Publish voucher" }).hasAttribute("disabled")).toBe(
      false,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish voucher" }));

    await waitFor(() => expect(deployVoucher).toHaveBeenCalledTimes(1));
    expect(deployVoucher).toHaveBeenCalledWith({
      name: "Kilifi Harvest",
      symbol: "KHV",
      decimals: "6",
      owner: OPERATOR,
      description: "A basket of fresh food",
      voucherUoa: "KES",
      voucherValue: 1,
      locationName: "Kilifi, Kenya",
      geoLat: PIN.lat,
      geoLng: PIN.lng,
      tags: ["Agriculture"],
    });
    await waitFor(() => expect(trackOtx).toHaveBeenCalledWith("track-1"));
    await waitFor(() => expect(getDeploymentContract).toHaveBeenCalled());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/vouchers/${VOUCHER_ADDRESS}`),
    );
  });

  it("defaults the owner to the operator and checksums an address typed in lowercase", async () => {
    renderPage();

    const owner = await waitFor(() => screen.getByLabelText("Owner", { selector: "input" }));
    expect((owner as HTMLInputElement).value).toBe(OPERATOR);

    fireEvent.change(owner, { target: { value: ISSUER.toLowerCase() } });
    await fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Publish voucher" }));

    await waitFor(() => expect(deployVoucher).toHaveBeenCalledTimes(1));
    // clc-core validates `eth_addr_checksum`, so the lowercase input has to reach
    // it checksummed rather than as typed.
    expect(deployVoucher.mock.calls[0]![0]).toMatchObject({ owner: ISSUER });
  });

  it("blocks a malformed owner address", async () => {
    renderPage();

    const owner = await waitFor(() => screen.getByLabelText("Owner", { selector: "input" }));
    fireEvent.change(owner, { target: { value: "0xnope" } });
    await fillRequiredFields();

    expect(screen.getByRole("button", { name: "Publish voucher" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(deployVoucher).not.toHaveBeenCalled();
  });

  it("asks for an expiry only on an expiring voucher, and sends it as a unix timestamp", async () => {
    renderPage();

    expect(await screen.findByLabelText("Type")).toBeTruthy();
    expect(screen.queryByLabelText("Expires on")).toBeNull();

    selectOption(screen.getByLabelText("Type"), "Expiring");

    const expiry = await screen.findByLabelText("Expires on");
    fireEvent.change(expiry, { target: { value: "2027-01-01" } });
    await fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Publish voucher" }));

    await waitFor(() => expect(deployVoucher).toHaveBeenCalledTimes(1));
    expect(deployVoucher.mock.calls[0]![0]).toMatchObject({
      expiryTimestamp: String(Date.parse("2027-01-01T00:00:00Z") / 1_000),
    });
  });

  it("refuses an expiry date in the past", async () => {
    renderPage();

    selectOption(await screen.findByLabelText("Type"), "Expiring");
    fireEvent.change(await screen.findByLabelText("Expires on"), {
      target: { value: "2020-01-01" },
    });
    await fillRequiredFields();

    expect(screen.getByRole("button", { name: "Publish voucher" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("stays on the page when the deployment reverts", async () => {
    trackOtx.mockResolvedValue({
      otx: [
        {
          id: 1,
          trackingId: "track-1",
          otxType: "TOKEN_PROXY_DEPLOY",
          txHash: "0xabc",
          nonce: 1,
          replaced: false,
          createdAt: "2026-08-19T00:00:00Z",
          status: "REVERTED",
        },
      ],
    });

    const { router } = renderPage();
    expect(await screen.findByRole("heading", { name: "Publish voucher" })).toBeTruthy();
    await fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Publish voucher" }));

    await waitFor(() => expect(trackOtx).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("Transaction failed on-chain (REVERTED).")).toBeTruthy(),
    );
    expect(getDeploymentContract).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/vouchers/publish");
  });

  it("binds a filled field onto the deployment card", async () => {
    renderPage();
    expect((await screen.findByRole("definition", { name: "Name" })).textContent).toBe("—");

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Kilifi Harvest" },
    });

    await waitFor(() =>
      expect(screen.getByRole("definition", { name: "Name" }).textContent).toBe("Kilifi Harvest"),
    );
  });
});

/** Selection opens the crop frame; confirming it is what uploads. */
async function confirmCrop() {
  await waitFor(() => expect(document.querySelector('[role="group"] img')).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Crop and upload" }));
}

describe("VoucherPublishPage images", () => {
  beforeEach(() => {
    reverseLocation.mockReset();
    getTokenTags.mockReset();
    deployVoucher.mockReset();
    reverseLocation.mockResolvedValue("Kilifi, Kenya");
    getTokenTags.mockResolvedValue(["Agriculture", "Food"]);
    deployVoucher.mockResolvedValue({ trackingId: "track-1" });
  });

  it("publishes without images, sending neither key", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Publish voucher" })).toBeTruthy();
    await fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Publish voucher" }));

    await waitFor(() => expect(deployVoucher).toHaveBeenCalledTimes(1));
    const payload = deployVoucher.mock.calls[0]![0] as object;
    // Absent rather than "": the deploy request treats these as optional, and an
    // empty string is not a URL clc-core would accept.
    expect("iconUrl" in payload).toBe(false);
    expect("bannerUrl" in payload).toBe(false);
  });

  it("carries an uploaded icon and banner into the deploy request", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Publish voucher" })).toBeTruthy();
    await fillRequiredFields();

    // One at a time: the frame is modal, so the second file cannot be chosen
    // until the first is framed.
    fireEvent.change(screen.getByLabelText("Icon", { selector: "input" }), {
      target: { files: [new File([new Uint8Array(8)], "icon.png", { type: "image/png" })] },
    });
    await confirmCrop();

    fireEvent.change(screen.getByLabelText("Banner", { selector: "input" }), {
      target: { files: [new File([new Uint8Array(8)], "banner.jpg", { type: "image/jpeg" })] },
    });
    await confirmCrop();

    await waitFor(() => expect(screen.getAllByRole("button", { name: /replace/i }).length).toBe(2));

    fireEvent.click(screen.getByRole("button", { name: "Publish voucher" }));

    await waitFor(() => expect(deployVoucher).toHaveBeenCalledTimes(1));
    expect(deployVoucher.mock.calls[0]![0]).toMatchObject({
      iconUrl: "https://cdn.test/voucher/x_400_ab.webp",
      bannerUrl: "https://cdn.test/voucher/x_1280_ab.webp",
    });
  });
});
