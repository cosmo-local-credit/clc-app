import type { UserPool } from "@clc/api/features/pools/client";
import { poolKeys } from "@clc/api/features/pools/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const updatePoolProfile = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api/pools", () => ({
  poolsClient: { updatePoolProfile: (...args: unknown[]) => updatePoolProfile(...args) },
}));

import { useUpdatePoolProfile } from "./use-update-pool-profile";

const ADDRESS = "0x2E89e617E75F223BbCA81F1B0F39a5074e1f937c";

function pool(name: string): UserPool {
  return {
    id: "7",
    chainId: 100,
    address: ADDRESS,
    name,
    symbol: "KLF",
    ownerAddress: null,
    feePpm: null,
    feeAddress: null,
    tokenRegistryAddress: null,
    limiterAddress: null,
    quoterAddress: null,
    quoterType: null,
    feePolicyAddress: null,
    protocolFeeControllerAddress: null,
    feesDecoupled: false,
    decimals: 6,
    description: "",
    unitOfAccount: "KES",
    locationName: null,
    geoLat: null,
    geoLng: null,
    email: null,
    website: null,
    phone: null,
    imageUrl: null,
    bannerUrl: null,
    terms: null,
    defaultVoucherId: null,
    voucherCount: 0,
    tags: [],
  };
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  updatePoolProfile.mockReset();
  updatePoolProfile.mockResolvedValue(pool("Saved pool"));
});

describe("useUpdatePoolProfile", () => {
  it("keeps the authoritative mutation row while invalidating pool lists", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const detailKey = poolKeys.detail(ADDRESS);
    const listKey = poolKeys.list({ perPage: 20 });
    client.setQueryData(detailKey, pool("Before"));
    client.setQueryData(listKey, { pools: [] });

    const { result } = renderHook(() => useUpdatePoolProfile(ADDRESS), {
      wrapper: wrapper(client),
    });
    await result.current.mutateAsync({
      description: "Updated",
      unitOfAccount: "KES",
      email: "",
      website: "",
      phone: "",
      terms: "",
      locationName: "",
      geoLat: null,
      geoLng: null,
      tags: [],
    });

    expect(client.getQueryData<UserPool>(detailKey)?.name).toBe("Saved pool");
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(false);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });
});
