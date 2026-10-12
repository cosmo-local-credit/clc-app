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
