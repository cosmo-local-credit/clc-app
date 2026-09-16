import type { UserPool } from "@clc/api/features/pools/client";
import { poolKeys } from "@clc/api/features/pools/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const updatePoolProfile = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api", () => ({
  clcApi: {
    admin: { updatePoolProfile: (...args: unknown[]) => updatePoolProfile(...args) },
  },
}));

import { useUpdatePoolProfile } from "./use-update-pool-profile";

// Checksummed here and lowercase in the key factory on purpose: the page reads
// this query under the address in its URL, and the sheet writes it under the
// address on the record. If those two ever stopped agreeing, the header would go
// on showing initials after a save.
const ADDRESS = "0x2E89e617E75F223BbCA81F1B0F39a5074e1f937c";

function saved(overrides: Partial<UserPool> = {}): UserPool {
  return {
    address: ADDRESS,
    name: "Kilifi Market",
    imageUrl: "https://cdn.test/pool/new_400_ab.webp",
    bannerUrl: null,
    ...overrides,
  } as UserPool;
}

beforeEach(() => {
  updatePoolProfile.mockReset();
  updatePoolProfile.mockResolvedValue(saved());
});

describe("useUpdatePoolProfile", () => {
  it("writes the saved image into the query the detail page reads", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // What the page is already showing: a pool with no image, hence initials.
    client.setQueryData(poolKeys.detail(ADDRESS), saved({ imageUrl: null }));
    const listKey = poolKeys.list({ perPage: 20 });
    client.setQueryData(listKey, { pools: [] });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdatePoolProfile(ADDRESS), { wrapper });

    await result.current.mutateAsync({
      description: "",
      unitOfAccount: "",
      email: "",
      website: "",
      phone: "",
      terms: "",
      locationName: "",
      geoLat: null,
      geoLng: null,
      imageUrl: "https://cdn.test/pool/new_400_ab.webp",
      tags: [],
    });

    // Seeded from the response, so the header stops showing its placeholder
    // without waiting for a refetch to land.
    await waitFor(() =>
      expect(client.getQueryData<UserPool>(poolKeys.detail(ADDRESS))?.imageUrl).toBe(
        "https://cdn.test/pool/new_400_ab.webp",
      ),
    );
    expect(client.getQueryState(poolKeys.detail(ADDRESS))?.isInvalidated).toBe(false);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it("seeds the same entry whatever casing the caller used", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdatePoolProfile(ADDRESS.toLowerCase()), { wrapper });

    await result.current.mutateAsync({
      description: "",
      unitOfAccount: "",
      email: "",
      website: "",
      phone: "",
      terms: "",
      locationName: "",
      geoLat: null,
      geoLng: null,
      tags: [],
    });

    // The page's key is built from the checksummed URL address.
    await waitFor(() =>
      expect(client.getQueryData<UserPool>(poolKeys.detail(ADDRESS))).toBeTruthy(),
    );
  });
});
