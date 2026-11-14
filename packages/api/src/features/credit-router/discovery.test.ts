import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import { createHttpClient } from "../../client/http-client";
import { createCatalogsClient } from "../catalogs/client";
import { catalogKeys } from "../catalogs/queries";
import { createMarketClient } from "../market/client";
import { voucherKeys } from "../market/queries";
import { createOfferingsClient } from "../offerings/client";
import { offeringKeys } from "../offerings/queries";
import { createWantsClient } from "../wants/client";
import { wantKeys } from "../wants/queries";
import type { CreditScope } from "./client";

/**
 * The four list endpoints that narrow by Credit with `creditDepth` instead of
 * a pool list: the voucher catalog, offerings, Wants and curated catalogs.
 */

const http = () => createHttpClient({ baseUrl: "https://api.test" });
const ALICE: CreditScope = { depth: 2, wallet: `0x${"A1".repeat(20)}`, digest: "0xAB" };
const POOL = { chainId: 100, address: `0x${"b".repeat(40)}` };

function respond(result: unknown) {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ ok: true, result }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

const endpoints = [
  {
    name: "vouchers",
    path: "/api/v2/vouchers",
    body: { vouchers: [], first: 0, last: 0 },
    call: (params: { credit?: CreditScope; pools?: (typeof POOL)[] }) =>
      createMarketClient(http()).getFilteredMarketVouchers({
        perPage: 20,
        filter: EMPTY_CATALOG_FILTER,
        ...params,
      }),
  },
  {
    name: "offerings",
    path: "/api/v2/offerings",
    body: { offerings: [], nextCursor: null },
    call: (params: { credit?: CreditScope; pools?: (typeof POOL)[] }) =>
      createOfferingsClient(http()).getOfferings({ perPage: 20, ...params }),
  },
  {
    name: "wants",
    path: "/api/v2/wants",
    body: { wants: [], first: 0, last: 0 },
    call: (params: { credit?: CreditScope; pools?: (typeof POOL)[] }) =>
      createWantsClient(http()).list({ perPage: 20, ...params }),
  },
  {
    name: "catalogs",
    path: "/api/v2/catalogs",
    body: { catalogs: [], nextCursor: null },
    call: (params: { credit?: CreditScope; pools?: (typeof POOL)[] }) =>
      createCatalogsClient(http()).list({ perPage: 20, ...params }),
  },
];

describe.each(endpoints)("$name Credit depth", ({ path, body, call }) => {
  it.each([1, 2] as const)(
    "sends creditDepth=%i with the session cookie, uncached, and no pool list",
    async (depth) => {
      const fetcher = respond(body);
      await call({ credit: { ...ALICE, depth } });
      const [url, init] = fetcher.mock.calls[0]!;
      const parsed = new URL(String(url));
      expect(parsed.pathname).toBe(path);
      expect(parsed.searchParams.get("creditDepth")).toBe(String(depth));
      expect(parsed.searchParams.has("pools")).toBe(false);
      expect(parsed.search).not.toContain(ALICE.wallet.slice(2));
      expect(init).toMatchObject({ credentials: "include", cache: "no-store" });
    },
  );

  it("refuses creditDepth together with pools before any request", async () => {
    const fetcher = respond(body);
    await expect(call({ credit: ALICE, pools: [POOL] })).rejects.toThrow(/creditDepth/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps a public request without Credit anonymous", async () => {
    const fetcher = respond(body);
    await call({});
    const [url, init] = fetcher.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.has("creditDepth")).toBe(false);
    expect(init.credentials).toBe("omit");
  });
});

describe("Credit depth cache identity", () => {
  const bob: CreditScope = { ...ALICE, wallet: `0x${"b2".repeat(20)}` };
  const shallower: CreditScope = { ...ALICE, depth: 1 };
  const moved: CreditScope = { ...ALICE, digest: "0xCD" };
  const sameWalletLower: CreditScope = { ...ALICE, wallet: ALICE.wallet.toLowerCase() };

  it.each([
    [
      "vouchers",
      (credit?: CreditScope) => voucherKeys.filtered(EMPTY_CATALOG_FILTER, 20, undefined, credit),
    ],
    ["offerings", (credit?: CreditScope) => offeringKeys.discovery({ perPage: 20, credit })],
    ["wants", (credit?: CreditScope) => wantKeys.list({ perPage: 20, credit })],
    ["catalogs", (credit?: CreditScope) => catalogKeys.list({ credit })],
  ] as const)("keys %s on the wallet, the depth and the reach digest", (_, key) => {
    const alice = key(ALICE);
    for (const other of [bob, shallower, moved, undefined]) {
      expect(key(other)).not.toEqual(alice);
    }
    expect(key(sameWalletLower)).toEqual(alice);
    expect(JSON.stringify(alice)).not.toContain(ALICE.wallet);
  });
});
