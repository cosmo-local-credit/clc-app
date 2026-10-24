import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { BackendApiError } from "../../client/errors";
import { createWantsClient } from "./client";

const api = createWantsClient(createHttpClient({ baseUrl: "https://api.test" }));
const row = {
  id: 7,
  // Old backends may return these during the app-first rollout. The schema
  // accepts the response but strips identity and automatic image fields.
  ownerUserId: 3,
  name: "Bicycle repair",
  description: "Looking for help repairing a wheel",
  locationName: "Nairobi",
  geoLat: -1.286,
  geoLng: 36.817,
  startsAt: "2026-10-24T08:00:00.000Z",
  expiresAt: null,
  status: "OPEN",
  state: "active",
  tags: ["Repair"],
  imageUrl: null,
  effectiveImageUrl: null,
  markerIcon: "question",
  markerColor: "orange",
  ownerName: "Amina",
  ownerUsername: "amina",
  contactText: "Meet near the market",
  email: "amina@example.test",
  phone: null,
};

function respond(result: unknown) {
  const fetcher = vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

describe("Wants HTTP contract", () => {
  it("serializes public discovery filters and uses the session only for nearby discovery", async () => {
    const fetcher = respond({ wants: [row], first: 7, last: 7, tagFacets: [] });
    const page = await api.list({
      perPage: 50,
      cursor: 9,
      next: true,
      q: "  repair  ",
      tags: ["Repair", "Bicycle"],
      tagMatch: "all",
      facets: true,
      bbox: { minLng: 36, minLat: -2, maxLng: 37, maxLat: -1 },
      pools: [{ chainId: 100, address: `0x${"a".repeat(40)}` }],
    });
    expect(page.wants[0]).toMatchObject({ id: "7", contact: { email: "amina@example.test" } });
    expect(page.wants[0]).not.toHaveProperty("ownerUserId");
    expect(page.wants[0]).not.toHaveProperty("ownerName");
    expect(page.wants[0]).not.toHaveProperty("ownerUsername");
    expect(page.wants[0]).not.toHaveProperty("effectiveImageUrl");
    const url = new URL(fetcher.mock.calls[0]?.[0]);
    expect(url.searchParams.get("cursor")).toBe("9");
    expect(url.searchParams.get("next")).toBe("true");
    expect(url.searchParams.get("q")).toBe("repair");
    expect(url.searchParams.get("tags")).toBe("Repair,Bicycle");
    expect(url.searchParams.get("tagMatch")).toBe("all");
    expect(url.searchParams.get("bbox")).toBe("36,-2,37,-1");
    expect(url.searchParams.get("pools")).toBe(`100:0x${"a".repeat(40)}`);
    expect(fetcher.mock.calls[0]?.[1].credentials).toBe("omit");

    await api.list({ nearby: true });
    expect(fetcher.mock.calls[1]?.[1].credentials).toBe("include");
  });

  it("uses public detail and pool routes without credentials", async () => {
    const fetcher = respond({ want: row });
    expect((await api.detail("7")).contact?.text).toBe("Meet near the market");
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.test/api/v2/wants/7");
    expect(fetcher.mock.calls[0]?.[1].credentials).toBe("omit");

    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { wants: [], first: 0, last: 0 } }), {
        status: 200,
      }),
    );
    await api.pool(`0x${"b".repeat(40)}`, { perPage: 20 });
    expect(fetcher.mock.calls[1]?.[0]).toContain(`/api/v2/pools/0x${"b".repeat(40)}/wants`);
    expect(fetcher.mock.calls[1]?.[1].credentials).toBe("omit");
  });

  it("loads paginated creator vouchers and pools from the public Want routes", async () => {
    const voucherAddress = `0x${"c".repeat(40)}`;
    const poolAddress = `0x${"d".repeat(40)}`;
    const fetcher = respond({
      vouchers: [
        {
          id: 11,
          chainId: 100,
          address: voucherAddress,
          name: "Amina Hours",
          symbol: "AH",
          decimals: 6,
          iconUrl: null,
          active: true,
        },
      ],
      first: 11,
      last: 11,
    });

    expect(await api.creatorVouchers("7", { perPage: 3, cursor: 12, next: true })).toMatchObject({
      vouchers: [{ id: "11", address: voucherAddress }],
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.test/api/v2/wants/7/vouchers?perPage=3&cursor=12&next=true",
    );
    expect(fetcher.mock.calls[0]?.[1].credentials).toBe("omit");

    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            pools: [
              {
                id: 13,
                chainId: 100,
                address: poolAddress,
                name: "Shared Pool",
                symbol: "SP",
                locationName: null,
                imageUrl: null,
                voucherCount: 2,
                tags: [],
              },
            ],
            first: 13,
            last: 13,
          },
        }),
        { status: 200 },
      ),
    );
    expect(await api.creatorPools("7", { perPage: 3 })).toMatchObject({
      pools: [{ id: "13", address: poolAddress }],
    });
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://api.test/api/v2/wants/7/pools?perPage=3");
    expect(fetcher.mock.calls[1]?.[1].credentials).toBe("omit");
  });

  it("writes canonical form fields and exposes owner lifecycle endpoints", async () => {
    const fetcher = respond({ want: row });
    const input = {
      name: "Bicycle repair",
      description: "Looking for help repairing a wheel",
      location: { lat: -1.286, lng: 36.817, locationName: "Nairobi", country: "KE" },
      startsAt: "2026-10-24T08:00:00.000Z",
      expiresAt: null,
      imageUrl: null,
      contactText: "Meet near the market",
      shareEmail: false,
      sharePhone: false,
      markerIcon: "question" as const,
      markerColor: "orange" as const,
      tags: ["Repair"],
    };
    await api.create(input);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.test/api/v2/users/me/wants");
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toMatchObject({
      locationName: "Nairobi",
      geoLat: -1.286,
      geoLng: 36.817,
    });
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).not.toHaveProperty("location");

    await api.update("7", input);
    await api.reopen("7", input);
    await api.close("7");
    await api.remove("7");
    expect(fetcher.mock.calls.slice(1).map((call) => [call[0], call[1].method])).toEqual([
      ["https://api.test/api/v2/users/me/wants/7", "PUT"],
      ["https://api.test/api/v2/users/me/wants/7/reopen", "POST"],
      ["https://api.test/api/v2/users/me/wants/7/close", "POST"],
      ["https://api.test/api/v2/users/me/wants/7", "DELETE"],
    ]);
  });

  it("rejects malformed server responses instead of silently broadening state", async () => {
    respond({ wants: [{ ...row, markerIcon: "voucher" }], first: 7, last: 7 });
    await expect(api.list({})).rejects.toBeInstanceOf(BackendApiError);
  });
});
