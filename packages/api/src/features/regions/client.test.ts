import type { Region } from "@clc/core/features/regions/logic";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createRegionsClient } from "./client";
import {
  adminRegionsQueryOptions,
  myRegionsQueryOptions,
  regionCountriesQueryOptions,
  regionCountryQueryOptions,
} from "./queries";

const staff = "0x1111111111111111111111111111111111111111";
const region: Region = {
  id: "reg-1",
  name: "Bhutan",
  countryCode: "BTN",
  active: true,
  revision: 2,
  boundary: {
    type: "Polygon",
    coordinates: [
      [
        [89, 27],
        [90, 27],
        [89, 28],
        [89, 27],
      ],
    ],
  },
  poolApproval: false,
  assignedAdmins: [],
};

function setup(result: unknown) {
  const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify({ ok: true, result }))),
  );
  return {
    fetch,
    client: createRegionsClient(createHttpClient({ baseUrl: "https://api.test", fetch })),
  };
}

describe("region transport", () => {
  it("reads only the signed-in viewer's scope with cancellation and no shared cache", async () => {
    const { fetch, client } = setup({ regions: [region] });
    const query = new QueryClient();
    const scope = myRegionsQueryOptions(client, staff);
    expect(await query.fetchQuery(scope)).toEqual([region]);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://api.test/api/v2/regions/me",
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(myRegionsQueryOptions(client, "").enabled).toBe(false);
    expect(myRegionsQueryOptions(client, "0xother").queryKey).not.toEqual(scope.queryKey);
    query.clear();
  });

  it("sends a preset reference or custom geometry and preserves the write revision", async () => {
    const { fetch, client } = setup({ region });
    const { name, boundary, countryCode, active, poolApproval, revision } = region;
    await client.create({ name, boundary, countryCode, active, poolApproval });
    await client.update(region.id, {
      name,
      boundary,
      countryCode: null,
      active,
      poolApproval,
      revision,
    });
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({
      name,
      countryCode,
      active,
      poolApproval,
    });
    expect(JSON.parse(fetch.mock.calls[1]?.[1]?.body as string)).toMatchObject({
      boundary,
      revision,
      countryCode: null,
    });
  });

  it("carries explicit conversion confirmation and rejects malformed server regions", async () => {
    const { fetch, client } = setup({ region });
    await client.setAssignment(region.id, staff, true, true);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `https://api.test/api/v2/admin/regions/${region.id}/assignments/${staff}`,
    );
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({
      assigned: true,
      confirmGlobalConversion: true,
    });
    const malformed = setup({ regions: [{ ...region, boundary: null }] });
    await expect(malformed.client.list()).rejects.toMatchObject({ kind: "protocol" });
  });

  it("keeps admin lists, country options, and selected boundaries separate by viewer", async () => {
    const bhutan = { code: "BTN", name: "Bhutan" };
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(input as string).pathname;
      const result = path.endsWith("/countries/BTN")
        ? { country: { ...bhutan, boundary: region.boundary } }
        : path.endsWith("/countries")
          ? { countries: [bhutan] }
          : { regions: [region] };
      return Promise.resolve(new Response(JSON.stringify({ ok: true, result })));
    });
    const client = createRegionsClient(createHttpClient({ baseUrl: "https://api.test", fetch }));
    const query = new QueryClient();
    const otherStaff = "0x2222222222222222222222222222222222222222";
    try {
      await expect(query.fetchQuery(adminRegionsQueryOptions(client, staff))).resolves.toEqual([
        region,
      ]);
      await expect(query.fetchQuery(regionCountriesQueryOptions(client, staff))).resolves.toEqual([
        bhutan,
      ]);
      expect(regionCountryQueryOptions(client, staff, "").enabled).toBe(false);
      const selected = regionCountryQueryOptions(client, staff, "BTN");
      await expect(query.fetchQuery(selected)).resolves.toEqual({
        ...bhutan,
        boundary: region.boundary,
      });
      expect(fetch.mock.calls.map(([url]) => new URL(url as string).pathname)).toEqual([
        "/api/v2/admin/regions",
        "/api/v2/admin/regions/countries",
        "/api/v2/admin/regions/countries/BTN",
      ]);
      expect(
        query.getQueryData(regionCountryQueryOptions(client, otherStaff, "BTN").queryKey),
      ).toBeUndefined();
      expect(query.getQueryData(myRegionsQueryOptions(client, staff).queryKey)).toBeUndefined();
    } finally {
      query.clear();
    }
  });
});
