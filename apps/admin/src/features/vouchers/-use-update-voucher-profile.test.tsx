import { adminKeys } from "@clc/api/features/admin/queries";
import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { voucherKeys } from "@clc/api/features/market/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const updateVoucherProfile = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api", () => ({
  clcApi: {
    admin: { updateVoucherProfile: (...args: unknown[]) => updateVoucherProfile(...args) },
  },
}));

import { useUpdateVoucherProfile } from "./use-update-voucher-profile";

const ADDRESS = "0xAbC0000000000000000000000000000000000123";

function voucher(name: string, email: string | null): MarketVoucherDetail {
  return {
    id: "7",
    chainId: 100,
    address: ADDRESS,
    name,
    contractName: "Contract voucher",
    symbol: "TEST",
    decimals: 6,
    ownerAddress: null,
    description: "",
    voucherUoa: "KES",
    voucherValue: "1",
    locationName: null,
    lat: null,
    lng: null,
    email,
    website: null,
    phone: null,
    terms: null,
    iconUrl: null,
    bannerUrl: null,
    tags: [],
    kind: "voucher",
    markerIcon: null,
    markerColor: null,
    active: true,
  };
}

beforeEach(() => {
  updateVoucherProfile.mockReset().mockResolvedValue(voucher("Saved", "private@example.org"));
});

describe("admin useUpdateVoucherProfile", () => {
  it("keeps protected contacts out of the public voucher cache", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const publicKey = voucherKeys.detail(ADDRESS);
    const adminKey = adminKeys.voucher(ADDRESS);
    client.setQueryData(publicKey, voucher("Before", null));
    client.setQueryData(adminKey, voucher("Before", "private@example.org"));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateVoucherProfile(ADDRESS), { wrapper });

    await result.current.mutateAsync({
      description: "Updated",
      voucherUoa: "KES",
      voucherValue: 1,
      email: "private@example.org",
      website: "",
      phone: "",
      terms: "",
      locationName: "",
      geoLat: null,
      geoLng: null,
      tags: [],
    });

    expect(client.getQueryData<MarketVoucherDetail>(adminKey)?.name).toBe("Saved");
    expect(client.getQueryData<MarketVoucherDetail>(publicKey)?.email).toBeNull();
    expect(client.getQueryState(publicKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(adminKey)?.isInvalidated).toBe(false);
  });
});
