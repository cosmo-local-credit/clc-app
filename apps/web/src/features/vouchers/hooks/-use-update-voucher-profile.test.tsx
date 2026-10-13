import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { voucherKeys } from "@clc/api/features/market/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const api = vi.hoisted(() => ({
  updateVoucherProfile: vi.fn(),
  getMarketVoucher: vi.fn(),
}));

vi.mock("#/lib/api/market", () => ({ marketClient: api }));

import { useUpdateVoucherProfile } from "./use-update-voucher-profile";

const ADDRESS = "0xAbC0000000000000000000000000000000000123";

function detail(name: string): MarketVoucherDetail {
  return {
    id: "2710",
    chainId: 100,
    address: ADDRESS,
    name,
    contractName: "Contract voucher",
    symbol: "TEST",
    decimals: 6,
    ownerAddress: null,
    description: "",
    voucherUoa: "KES",
    voucherValue: "10",
    locationName: null,
    lat: null,
    lng: null,
    email: null,
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

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  api.updateVoucherProfile.mockReset();
  api.getMarketVoucher.mockReset();
  api.updateVoucherProfile.mockResolvedValue(detail("Mutation response"));
  api.getMarketVoucher.mockResolvedValue(detail("Fresh read-back"));
});

describe("useUpdateVoucherProfile", () => {
  it("reads past the HTTP cache and keeps the fresh detail out of invalidation", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const detailKey = voucherKeys.detail(ADDRESS);
    const listKey = voucherKeys.list({ perPage: 20 });
    client.setQueryData(detailKey, detail("Stale cached row"));
    client.setQueryData(listKey, { vouchers: [] });

    const { result } = renderHook(() => useUpdateVoucherProfile(ADDRESS), {
      wrapper: wrapper(client),
    });
    await result.current.mutateAsync({
      description: "Updated",
      voucherUoa: "KES",
      voucherValue: 10,
      email: "",
      website: "",
      phone: "",
      terms: "",
      locationName: "",
      geoLat: null,
      geoLng: null,
      tags: [],
    });

    expect(api.updateVoucherProfile).toHaveBeenCalledTimes(1);
    expect(api.getMarketVoucher).toHaveBeenCalledWith(ADDRESS, undefined, { cache: "reload" });
    expect(client.getQueryData<MarketVoucherDetail>(detailKey)?.name).toBe("Fresh read-back");
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(false);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });
});
