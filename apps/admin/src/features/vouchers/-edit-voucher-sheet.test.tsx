import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { EditVoucherSheet } from "./ui/edit-voucher-sheet";

const ADDRESS = "0xdD97a5282D11e55d7271d466C80963d6793B276f";

const updateVoucherProfile = vi.hoisted(() => vi.fn());
const getTokenTags = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api", () => ({
  clcApi: {
    admin: { updateVoucherProfile: (...args: unknown[]) => updateVoucherProfile(...args) },
    deployments: { getTokenTags: (...args: unknown[]) => getTokenTags(...args) },
  },
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div>Map</div>,
}));

// The image controls are hidden where the upload service is unconfigured, and the
// test env has no VITE_STORAGE_URL.
vi.mock("#/lib/storage", () => ({ isStorageConfigured: true }));

vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({
    mutateAsync: () =>
      Promise.resolve({
        url: "https://cdn.test/voucher/new_400_a3f91c2e.webp",
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

function voucher(overrides: Partial<MarketVoucherDetail> = {}): MarketVoucherDetail {
  return {
    id: "2710",
    chainId: 42220,
    address: ADDRESS as MarketVoucherDetail["address"],
    name: "Kilifi Harvest",
    symbol: "KHV",
    decimals: 6,
    ownerAddress: null,
    description: "A basket of fresh food.",
    voucherUoa: "KES",
    voucherValue: "10",
    locationName: "Kilifi, Kenya",
    lat: -3.5107,
    lng: 39.9093,
    email: "issuer@example.test",
    website: "https://kilifi.example",
    phone: "+254700000000",
    terms: "https://kilifi.example/terms",
    iconUrl: null,
    bannerUrl: null,
    tags: ["food"],
    kind: "goods",
    ...overrides,
  };
}

function renderSheet(overrides: Partial<MarketVoucherDetail> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <EditVoucherSheet open voucher={voucher(overrides)} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  updateVoucherProfile.mockReset();
  getTokenTags.mockReset();
  updateVoucherProfile.mockResolvedValue(voucher());
  getTokenTags.mockResolvedValue(["food", "care"]);
});

describe("EditVoucherSheet", () => {
  it("edits only the catalog's half of the record", async () => {
    // Name, symbol, decimals and the owner mirror the deployed ERC20. A field for
    // one of them here would let an operator put the catalog out of step with the
    // chain, and the endpoint does not accept them either. `active` is absent for
    // a different reason: retiring a voucher is not a prose correction.
    renderSheet();

    await waitFor(() => expect(screen.getByLabelText("Description")).toBeTruthy());
    for (const absent of ["Name", "Symbol", "Decimals", "Owner", "Active", "Kind"]) {
      expect(screen.queryByLabelText(absent)).toBeNull();
    }
  });

  it("sends the whole record, since the endpoint assigns every column", async () => {
    renderSheet();

    const email = await waitFor(() => screen.getByLabelText("Email address"));
    fireEvent.change(email, { target: { value: "new@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateVoucherProfile).toHaveBeenCalled());
    const [address, profile] = updateVoucherProfile.mock.calls[0]!;

    expect(address).toBe(ADDRESS);
    expect(profile).toEqual({
      description: "A basket of fresh food.",
      voucherUoa: "KES",
      // The catalog serves NUMERIC as text so nothing rounds it in transit; the
      // request body carries a number, because that is what the endpoint binds.
      voucherValue: 10,
      email: "new@example.test",
      website: "https://kilifi.example",
      phone: "+254700000000",
      terms: "https://kilifi.example/terms",
      locationName: "Kilifi, Kenya",
      geoLat: -3.5107,
      geoLng: 39.9093,
      tags: ["food"],
    });
  });

  it("sends a cleared value as null rather than zero", async () => {
    renderSheet();

    const value = await waitFor(() => screen.getByLabelText("Value per unit"));
    fireEvent.change(value, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateVoucherProfile).toHaveBeenCalled());
    const [, profile] = updateVoucherProfile.mock.calls[0]!;
    // Number("") is 0, which would price the voucher at nothing instead of
    // recording that it has no stated value.
    expect((profile as { voucherValue: number | null }).voucherValue).toBeNull();
  });

  it("refuses a place name with no pin", async () => {
    // clc-core rejects the half-pair and vouchers_geo_valid backstops it; catching
    // it here only saves the round trip and names the field.
    renderSheet({ lat: null, lng: null, locationName: "Nowhere" });

    await waitFor(() => expect(screen.getByLabelText("Description")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(screen.getByText("Click the map to place this voucher")).toBeTruthy(),
    );
    expect(updateVoucherProfile).not.toHaveBeenCalled();
  });

  it("rejects a malformed email before sending it", async () => {
    renderSheet();

    const email = await waitFor(() => screen.getByLabelText("Email address"));
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText("Invalid email address")).toBeTruthy());
    expect(updateVoucherProfile).not.toHaveBeenCalled();
  });

  it("closes on a successful save", async () => {
    const onClose = renderSheet();

    await waitFor(() => expect(screen.getByLabelText("Description")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

/** Selection opens the crop frame; confirming it is what uploads. */
async function confirmCrop() {
  await waitFor(() => expect(document.querySelector('[role="group"] img')).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Crop and upload" }));
}

describe("EditVoucherSheet images", () => {
  it("leaves the stored images alone when the operator did not touch them", async () => {
    renderSheet({ iconUrl: "https://cdn.test/voucher/kept_400_ab.webp" });

    const email = await waitFor(() => screen.getByLabelText("Email address"));
    fireEvent.change(email, { target: { value: "new@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateVoucherProfile).toHaveBeenCalled());
    const [, profile] = updateVoucherProfile.mock.calls[0]!;
    // Omitted, not echoed: these two columns are COALESCEd, so sending the stored
    // value back is indistinguishable from omitting it — but omitting is what says
    // "no opinion", and it is the shape that keeps a future client honest.
    expect("iconUrl" in (profile as object)).toBe(false);
    expect("bannerUrl" in (profile as object)).toBe(false);
  });

  it("sends a replacement URL after an upload", async () => {
    renderSheet();

    await waitFor(() => expect(screen.getByLabelText("Description")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Icon", { selector: "input" }), {
      target: { files: [new File([new Uint8Array(8)], "icon.png", { type: "image/png" })] },
    });

    await confirmCrop();
    await waitFor(() => expect(screen.getByRole("button", { name: /replace/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateVoucherProfile).toHaveBeenCalled());
    const [, profile] = updateVoucherProfile.mock.calls[0]!;
    expect(profile).toMatchObject({ iconUrl: "https://cdn.test/voucher/new_400_a3f91c2e.webp" });
  });

  it("clears a stored image with an empty string, which is what the endpoint reads", async () => {
    renderSheet({ iconUrl: "https://cdn.test/voucher/old_400_ab.webp" });

    await waitFor(() => expect(screen.getByRole("button", { name: /remove/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateVoucherProfile).toHaveBeenCalled());
    const [, profile] = updateVoucherProfile.mock.calls[0]!;
    expect(profile).toMatchObject({ iconUrl: "" });
  });
});
