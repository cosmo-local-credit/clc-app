import type { UserPool } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { EditPoolProfileSheet } from "./ui/edit-pool-profile-sheet";

const ADDRESS = "0xdD97a5282D11e55d7271d466C80963d6793B276f";

const updatePoolProfile = vi.hoisted(() => vi.fn());
const getTokenTags = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api", () => ({
  clcApi: {
    admin: { updatePoolProfile: (...args: unknown[]) => updatePoolProfile(...args) },
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
        url: "https://cdn.test/pool/new_400_a3f91c2e.webp",
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

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return {
    id: "12",
    chainId: 42220,
    address: ADDRESS as UserPool["address"],
    name: "Kawangware",
    symbol: "KAW",
    ownerAddress: null,
    feePpm: 5_000,
    feeAddress: null,
    tokenRegistryAddress: null,
    limiterAddress: null,
    quoterAddress: null,
    quoterType: "oracle",
    feePolicyAddress: null,
    protocolFeeControllerAddress: null,
    feesDecoupled: false,
    decimals: 6,
    description: "A neighbourhood liquidity pool.",
    unitOfAccount: "KES",
    locationName: "Kawangware, Nairobi",
    geoLat: -1.2833,
    geoLng: 36.75,
    email: "steward@example.test",
    website: "https://kawangware.example",
    phone: "+254700000000",
    imageUrl: null,
    bannerUrl: null,
    terms: "https://kawangware.example/terms",
    defaultVoucherId: null,
    voucherCount: 4,
    tags: ["food"],
    ...overrides,
  };
}

function renderSheet(overrides: Partial<UserPool> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <EditPoolProfileSheet pool={pool(overrides)} open onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  updatePoolProfile.mockReset();
  getTokenTags.mockReset();
  updatePoolProfile.mockResolvedValue(pool());
  getTokenTags.mockResolvedValue(["food", "care"]);
});

describe("EditPoolProfileSheet", () => {
  it("edits only the catalog's half of the record", async () => {
    // Name, symbol, decimals, owner and the dependency addresses mirror SwapPool.
    // A field for one of them here would let an operator put the catalog out of
    // step with the chain, and the endpoint does not accept them either.
    renderSheet();

    await waitFor(() => expect(screen.getByLabelText("Description")).toBeTruthy());
    for (const absent of ["Name", "Symbol", "Decimals", "Owner", "Quoter", "Fee policy"]) {
      expect(screen.queryByLabelText(absent)).toBeNull();
    }
  });

  it("keeps an existing oracle pool's unit of account read-only", async () => {
    renderSheet({ quoterType: "oracle", unitOfAccount: "KES" });

    const unit = (await screen.findByLabelText("Unit of account")) as HTMLInputElement;
    expect(unit.disabled).toBe(true);
    expect(
      screen.getByText("The unit of account is fixed by this pool's deployed oracle."),
    ).toBeTruthy();
  });

  it("sends the whole record, since the endpoint assigns every column", async () => {
    renderSheet();

    const email = await waitFor(() => screen.getByLabelText("Email address"));
    fireEvent.change(email, { target: { value: "new@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatePoolProfile).toHaveBeenCalled());
    const [address, profile] = updatePoolProfile.mock.calls[0]!;

    expect(address).toBe(ADDRESS);
    expect(profile).toEqual({
      description: "A neighbourhood liquidity pool.",
      unitOfAccount: "KES",
      email: "new@example.test",
      website: "https://kawangware.example",
      phone: "+254700000000",
      terms: "https://kawangware.example/terms",
      locationName: "Kawangware, Nairobi",
      geoLat: -1.2833,
      geoLng: 36.75,
      tags: ["food"],
    });
  });

  it("refuses a place name with no pin", async () => {
    // clc-core rejects the half-pair and pools_geo_valid backstops it; catching
    // it here only saves the round trip and names the field.
    renderSheet({ geoLat: null, geoLng: null, locationName: "Nowhere" });

    await waitFor(() => expect(screen.getByLabelText("Description")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText("Click the map to place this pool")).toBeTruthy());
    expect(updatePoolProfile).not.toHaveBeenCalled();
  });

  it("rejects a malformed email before sending it", async () => {
    renderSheet();

    const email = await waitFor(() => screen.getByLabelText("Email address"));
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText("Invalid email address")).toBeTruthy());
    expect(updatePoolProfile).not.toHaveBeenCalled();
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

describe("EditPoolProfileSheet images", () => {
  it("leaves the stored images alone when the operator did not touch them", async () => {
    renderSheet({ imageUrl: "https://cdn.test/pool/kept_400_ab.webp" });

    const email = await waitFor(() => screen.getByLabelText("Email address"));
    fireEvent.change(email, { target: { value: "new@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatePoolProfile).toHaveBeenCalled());
    const [, profile] = updatePoolProfile.mock.calls[0]!;
    // Omitted, not echoed: these two columns are COALESCEd, so sending the stored
    // value back is indistinguishable from omitting it — but omitting is what says
    // "no opinion", and it is the shape that keeps a future client honest.
    expect("imageUrl" in (profile as object)).toBe(false);
    expect("bannerUrl" in (profile as object)).toBe(false);
  });

  it("sends a replacement URL after an upload", async () => {
    renderSheet();

    await waitFor(() => expect(screen.getByLabelText("Description")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Logo", { selector: "input" }), {
      target: { files: [new File([new Uint8Array(8)], "logo.png", { type: "image/png" })] },
    });

    await confirmCrop();
    await waitFor(() => expect(screen.getByRole("button", { name: /replace/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatePoolProfile).toHaveBeenCalled());
    const [, profile] = updatePoolProfile.mock.calls[0]!;
    expect(profile).toMatchObject({ imageUrl: "https://cdn.test/pool/new_400_a3f91c2e.webp" });
  });

  it("clears a stored image with an empty string, which is what the endpoint reads", async () => {
    renderSheet({ imageUrl: "https://cdn.test/pool/old_400_ab.webp" });

    await waitFor(() => expect(screen.getByRole("button", { name: /remove/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatePoolProfile).toHaveBeenCalled());
    const [, profile] = updatePoolProfile.mock.calls[0]!;
    expect(profile).toMatchObject({ imageUrl: "" });
  });
});
