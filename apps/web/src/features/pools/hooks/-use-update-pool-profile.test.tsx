import type { UserPool } from "@clc/api/features/pools/client";
import { poolKeys } from "@clc/api/features/pools/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const api = vi.hoisted(() => ({ updatePoolProfile: vi.fn(), getPoolInfo: vi.fn() }));
const VIEWER = "0x9999999999999999999999999999999999999999";

vi.mock("#/lib/api/pools", () => ({
  poolsClient: api,
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, session: { address: VIEWER } }),
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
  api.updatePoolProfile.mockReset().mockResolvedValue(pool("Mutation response"));
  api.getPoolInfo.mockReset().mockResolvedValue(pool("Saved pool"));
});

describe("useUpdatePoolProfile", () => {
  it("keeps the authoritative mutation row while invalidating pool lists", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const detailKey = poolKeys.detail(ADDRESS);
    const infoKey = poolKeys.info(ADDRESS, VIEWER);
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

    expect(api.getPoolInfo).toHaveBeenCalledWith(ADDRESS);
    expect(client.getQueryData<UserPool>(detailKey)?.name).toBe("Before");
    expect(client.getQueryData<UserPool>(infoKey)?.name).toBe("Saved pool");
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(infoKey)?.isInvalidated).toBe(false);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });
});
