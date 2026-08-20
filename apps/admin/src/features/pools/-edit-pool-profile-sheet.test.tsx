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
    pools: { updatePoolProfile: (...args: unknown[]) => updatePoolProfile(...args) },
    deployments: { getTokenTags: (...args: unknown[]) => getTokenTags(...args) },
  },
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div>Map</div>,
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
