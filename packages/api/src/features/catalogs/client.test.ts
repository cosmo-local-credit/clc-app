import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { BackendApiError } from "../../client/errors";
import { createCatalogsClient } from "./client";

const api = createCatalogsClient(createHttpClient({ baseUrl: "https://api.test" }));
const row = {
  id: 7,
  name: "Local",
  description: "A local directory",
  imageUrl: null,
  locationName: "Sarajevo",
  geoLat: 43,
  geoLng: 18,
  ownerAddress: `0x${"a".repeat(40)}`,
  poolCount: 1,
  voucherCount: 0,
  distanceMeters: null,
  createdAt: "2026-10-10",
  updatedAt: "2026-10-10",
};
function respond(result: unknown) {
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true, result }), { status: 200 })),
    );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());
describe("catalog HTTP contract", () => {
  it("keeps anonymous discovery public and nearby discovery session based", async () => {
    const fetcher = respond({ catalogs: [row], nextCursor: null });
    expect((await api.list({})).catalogs[0]?.id).toBe("7");
    expect(fetcher.mock.calls[0]?.[1].credentials).toBe("omit");
    await api.list({ nearby: true, cursor: "opaque+/=" });
    const url = new URL(fetcher.mock.calls[1]?.[0]);
    expect(url.searchParams.get("nearby")).toBe("true");
    expect(url.searchParams.get("cursor")).toBe("opaque+/=");
    expect(fetcher.mock.calls[1]?.[1].credentials).toBe("include");
    expect(url.searchParams.has("geoLat")).toBe(false);
  });
  it("trims catalog search and carries descriptions through reads and writes", async () => {
    const fetcher = respond({ catalogs: [row], nextCursor: null });
    const page = await api.list({ q: "  fresh food  " });
    expect(page.catalogs[0]?.description).toBe("A local directory");
    expect(new URL(fetcher.mock.calls[0]?.[0]).searchParams.get("q")).toBe("fresh food");

    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { catalog: row } }), { status: 200 }),
    );
    await api.create({
      name: "Local",
      description: "  A local directory  ",
      imageUrl: "",
      locationName: "Sarajevo",
      geoLat: 43,
      geoLng: 18,
      tags: [],
    });
    expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toMatchObject({
      name: "Local",
      description: "A local directory",
    });
  });
  it("serializes tags, facets and verified pool references without broadening the request", async () => {
    const fetcher = respond({ catalogs: [row], nextCursor: null, tagFacets: [] });
    await api.list({
      tags: ["Food", "Local"],
      tagMatch: "all",
      facets: true,
      pools: [
        { chainId: 100, address: `0x${"b".repeat(40)}` },
        { chainId: 42220, address: `0x${"c".repeat(40)}` },
      ],
    });

    const url = new URL(fetcher.mock.calls[0]?.[0]);
    expect(url.searchParams.get("tags")).toBe("Food,Local");
    expect(url.searchParams.get("tagMatch")).toBe("all");
    expect(url.searchParams.get("facets")).toBe("true");
    expect(url.searchParams.get("pools")).toBe(`100:0x${"b".repeat(40)},42220:0x${"c".repeat(40)}`);
  });
  it("reads both member kinds with an opaque cursor and updates an existing catalog", async () => {
    const fetcher = respond({ items: [], nextCursor: null });
    await api.members("7", "pool", "opaque+/=");
    await api.members("7", "voucher");
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.test/api/v2/catalogs/7/pools?perPage=20&cursor=opaque%2B%2F%3D",
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "https://api.test/api/v2/catalogs/7/vouchers?perPage=20",
    );

    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { catalog: row } }), { status: 200 }),
    );
    await api.update("7", {
      name: "Local",
      description: "Updated directory",
      imageUrl: "",
      locationName: "Sarajevo",
      geoLat: 43,
      geoLng: 18,
      tags: ["Local"],
    });
    expect(fetcher.mock.calls[2]?.[0]).toBe("https://api.test/api/v2/catalogs/7");
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({ method: "PUT" });
  });
  it("uses resource DB IDs and one pool-only membership write", async () => {
    const fetcher = respond({ added: true });
    await api.setMember("7", "pool", "12", true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.test/api/v2/catalogs/7/pools/12");
    expect(fetcher.mock.calls[0]?.[1].method).toBe("PUT");
    await api.setMember("7", "voucher", "13", false);
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://api.test/api/v2/catalogs/7/vouchers/13");
    expect(fetcher.mock.calls[1]?.[1].method).toBe("DELETE");
  });
  it("reads membership directly without downloading every member page", async () => {
    const fetcher = respond({ added: false });
    expect(await api.membership("7", "voucher", "13")).toEqual({ added: false });
    expect(fetcher.mock.calls[0]?.[0]).toContain("/7/membership?kind=voucher&resourceId=13");
  });
  it("unwraps a public detail and refuses malformed responses", async () => {
    const fetcher = respond({ catalog: row });
    expect((await api.detail("7")).name).toBe("Local");
    expect(fetcher.mock.calls[0]?.[1].credentials).toBe("omit");
    respond({ catalogs: [] });
    await expect(api.list({})).rejects.toBeInstanceOf(BackendApiError);
  });
});

it("loads every owned catalog page so raised limits remain usable", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { catalogs: [row], nextCursor: "next" } }), {
        status: 200,
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, result: { catalogs: [{ ...row, id: 8 }], nextCursor: null } }),
        { status: 200 },
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  expect((await api.mine()).catalogs.map((catalog) => catalog.id)).toEqual(["7", "8"]);
  expect(String(fetcher.mock.calls[1]?.[0])).toContain("/api/v2/users/me/catalogs?cursor=next");
});
