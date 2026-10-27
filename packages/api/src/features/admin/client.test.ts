import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createHttpClient } from "../../client/http-client";
import { type AdminUser, createAdminClient } from "./client";

const BASE_URL = "http://localhost:5003";
const ADDRESS = "0x33a573149db22e759fB9A38Bcc461C12855c2645";

function user(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 1,
    ethereumAddress: ADDRESS,
    name: "Superadmin",
    email: "devops@grassecon.org",
    phone: "",
    country: "",
    role: "SUPERADMIN",
    status: "APPROVED",
    maxPools: 10,
    maxTokens: 20,
    maxCatalogs: 1,
    maxOffers: 3,
    maxWants: 3,
    createdAt: "2026-07-24T10:43:16.051912+03:00",
    updatedAt: "2026-07-24T10:43:16.051912+03:00",
    avatarUrl: null,
    locationName: null,
    geoLat: null,
    geoLng: null,
    ...overrides,
  };
}

function ok(result: unknown) {
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

function client() {
  return createAdminClient(createHttpClient({ baseUrl: BASE_URL, fetch: fetchMock as never }));
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

beforeEach(() => {
  fetchMock = vi.fn();
});

describe("retained pool administration", () => {
  it("reads retired pool pages through the protected catalog with status and search", async () => {
    fetchMock.mockResolvedValue(
      ok({ pools: [{ address: ADDRESS, active: false }], first: 7, last: 7 }),
    );
    const page = await client().listPools({
      perPage: 10,
      status: "retired",
      filter: { term: "community", tags: [], tagMatch: "any", vouchers: [], voucherMatch: "any" },
    });
    const { url, init } = lastCall();
    expect(new URL(url).pathname).toBe("/api/v2/admin/pool-catalog");
    expect(new URL(url).searchParams.get("status")).toBe("retired");
    expect(new URL(url).searchParams.get("q")).toBe("community");
    expect(init.cache).toBe("no-store");
    expect(page.pools[0]?.active).toBe(false);
    expect(page.receivedCount).toBe(1);
  });

  it("keeps a retired pool detail available to admin restoration", async () => {
    fetchMock.mockResolvedValue(ok({ pool: { address: ADDRESS, active: false } }));
    const pool = await client().getPoolByAddress(ADDRESS);
    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/pools/${ADDRESS}`);
    expect(pool.active).toBe(false);
  });

  it("serializes every pool-catalog filter and preserves cancellation", async () => {
    fetchMock.mockResolvedValue(ok({ pools: null }));
    const controller = new AbortController();

    const page = await client().listPools(
      {
        perPage: 10,
        cursor: 9,
        next: true,
        status: "active",
        owner: ADDRESS,
        filter: {
          term: "market",
          tags: ["food", "local"],
          tagMatch: "all",
          vouchers: [],
          voucherMatch: "any",
        },
      },
      controller.signal,
    );

    const { url, init } = lastCall();
    const search = new URL(url).searchParams;
    expect(search.get("q")).toBe("market");
    expect(search.get("tags")).toBe("food,local");
    expect(search.get("tagMatch")).toBe("all");
    expect(search.get("status")).toBe("active");
    expect(search.get("owner")).toBe(ADDRESS);
    expect(search.get("cursor")).toBe("9");
    expect(search.get("next")).toBe("true");
    expect(init.signal).toBe(controller.signal);
    expect(page).toMatchObject({ pools: [], receivedCount: 0 });
  });

  it("rejects a pool detail response without a usable address", async () => {
    fetchMock.mockResolvedValue(ok({ pool: { name: "Broken" } }));

    await expect(client().getPoolByAddress(ADDRESS)).rejects.toThrow(
      "Pool response did not include a valid address.",
    );
  });
});

describe("listUsers", () => {
  it("requests one page and returns its cursor bounds", async () => {
    fetchMock.mockResolvedValue(ok({ users: [user()], first: 42, last: 42 }));

    const page = await client().listUsers({ perPage: 25 });

    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/users?perPage=25`);
    expect(page.users).toHaveLength(1);
    expect(page).toMatchObject({ first: 42, last: 42, receivedCount: 1 });
  });

  it("passes the cursor and direction through", async () => {
    fetchMock.mockResolvedValue(ok({ users: [] }));

    await client().listUsers({ perPage: 25, cursor: 4187, next: true });

    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/users?perPage=25&cursor=4187&next=true`);
  });

  it("sends a search term as q", async () => {
    fetchMock.mockResolvedValue(ok({ users: [] }));

    await client().listUsers({ perPage: 25, q: "ada lovelace" });

    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/users?perPage=25&q=ada+lovelace`);
  });

  it("sends an approval status only when one is selected", async () => {
    fetchMock.mockResolvedValue(ok({ users: [] }));

    await client().listUsers({ perPage: 25, status: "PENDING" });

    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/users?perPage=25&status=PENDING`);
  });

  it("sends selected administrative roles together", async () => {
    fetchMock.mockResolvedValue(ok({ users: [] }));

    await client().listUsers({ perPage: 25, roles: ["ADMIN", "SUPERADMIN"] });

    expect(new URL(lastCall().url).searchParams.get("roles")).toBe("ADMIN,SUPERADMIN");
  });

  it("omits q entirely when there is no term", async () => {
    // clc-core validates the term's length, so an empty q is a request it would
    // have to have an opinion about. There is nothing to ask.
    fetchMock.mockResolvedValue(ok({ users: [] }));

    await client().listUsers({ perPage: 25, q: "" });

    expect(lastCall().url).not.toContain("q=");
  });

  it("normalizes a null list to an empty page", async () => {
    // The backend answers `{"users": null}` for an empty result, which would
    // otherwise reach the UI as a crash rather than as "no rows".
    fetchMock.mockResolvedValue(ok({ users: null }));

    await expect(client().listUsers({ perPage: 25 })).resolves.toEqual({
      users: [],
      first: 0,
      last: 0,
      receivedCount: 0,
    });
  });

  it("fills in the location keys the response omits", async () => {
    // clc-core omits them rather than sending null, so without this every
    // consumer would have to tell "absent" from "empty".
    const { locationName: _n, geoLat: _a, geoLng: _o, ...withoutLocation } = user();
    fetchMock.mockResolvedValue(ok({ users: [withoutLocation] }));

    const page = await client().listUsers({ perPage: 25 });

    expect(page.users[0]).toMatchObject({ locationName: null, geoLat: null, geoLng: null });
  });

  it("keeps a complete coordinate pair", async () => {
    fetchMock.mockResolvedValue(
      ok({ users: [user({ locationName: "Nairobi", geoLat: -1.2921, geoLng: 36.8219 })] }),
    );

    const page = await client().listUsers({ perPage: 25 });

    expect(page.users[0]).toMatchObject({
      locationName: "Nairobi",
      geoLat: -1.2921,
      geoLng: 36.8219,
    });
  });

  it("reports a half coordinate pair as no location", async () => {
    // A latitude with no longitude cannot be shown as a pair or on a map, and the
    // database will not store one, so it is not a location.
    fetchMock.mockResolvedValue(ok({ users: [user({ geoLat: -1.2921, geoLng: null })] }));

    const page = await client().listUsers({ perPage: 25 });

    expect(page.users[0]).toMatchObject({ geoLat: null, geoLng: null });
  });

  it("passes an abort signal to the transport", async () => {
    fetchMock.mockResolvedValue(ok({ users: [] }));
    const controller = new AbortController();

    await client().listUsers({ perPage: 25 }, controller.signal);

    expect(lastCall().init.signal).toBe(controller.signal);
  });
});

describe("pool administration", () => {
  it("pages an account's pools through the admin route and preserves dropped-row counts", async () => {
    fetchMock.mockResolvedValue(
      ok({
        pools: [{ address: ADDRESS, name: "Kawangware", symbol: "KAW" }, { name: "Invalid" }],
        first: 10,
        last: 11,
      }),
    );

    const page = await client().getAccountPools(ADDRESS, {
      perPage: 25,
      cursor: 9,
      next: true,
    });

    expect(lastCall().url).toBe(
      `${BASE_URL}/api/v2/admin/users/${ADDRESS}/pools?perPage=25&cursor=9&next=true`,
    );
    expect(page.pools).toHaveLength(1);
    expect(page).toMatchObject({ first: 10, last: 11, receivedCount: 2 });
  });

  it("sends the pool images only when the caller has an opinion about them", async () => {
    const base = {
      description: "A pool",
      unitOfAccount: "KES",
      email: "steward@example.test",
      website: "",
      phone: "",
      terms: "",
      locationName: "Kilifi",
      geoLat: -3.5,
      geoLng: 39.9,
      tags: ["food"],
    };

    // Omitted: the columns are COALESCEd, so an absent key is what tells clc-core
    // to leave the stored image alone. This was the bug — the fields existed on
    // the type but were never serialized, so pool images silently never saved.
    fetchMock.mockResolvedValue(ok({ pool: { address: ADDRESS } }));
    await client().updatePoolProfile(ADDRESS, base);
    let body = JSON.parse(lastCall().init.body as string) as Record<string, unknown>;
    expect("imageUrl" in body).toBe(false);
    expect("bannerUrl" in body).toBe(false);

    fetchMock.mockResolvedValue(ok({ pool: { address: ADDRESS } }));
    await client().updatePoolProfile(ADDRESS, {
      ...base,
      imageUrl: "https://cdn.test/pool/a_400_ab.webp",
      bannerUrl: "https://cdn.test/pool/b_1280_ab.webp",
    });
    body = JSON.parse(lastCall().init.body as string) as Record<string, unknown>;
    expect(body.imageUrl).toBe("https://cdn.test/pool/a_400_ab.webp");
    expect(body.bannerUrl).toBe("https://cdn.test/pool/b_1280_ab.webp");

    // "" survives as "": it is how this endpoint removes an image, so the blanks
    // -> null rule the other fields follow would turn a removal into a no-op.
    fetchMock.mockResolvedValue(ok({ pool: { address: ADDRESS } }));
    await client().updatePoolProfile(ADDRESS, { ...base, imageUrl: "" });
    body = JSON.parse(lastCall().init.body as string) as Record<string, unknown>;
    expect(body.imageUrl).toBe("");
  });

  it("PUTs the whole pool profile and sends blanks as null", async () => {
    fetchMock.mockResolvedValue(ok({ pool: { address: ADDRESS } }));

    await client().updatePoolProfile(ADDRESS, {
      description: "A pool",
      unitOfAccount: "KES",
      email: "  ",
      website: "",
      phone: " +254700000000 ",
      terms: "",
      locationName: "Kilifi",
      geoLat: -3.5,
      geoLng: 39.9,
      tags: ["food"],
    });

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE_URL}/api/v2/admin/pools/${ADDRESS}/profile`);
    expect(init.method).toBe("PUT");
    expect(typeof init.body).toBe("string");
    if (typeof init.body !== "string") throw new Error("Expected a JSON request body");
    expect(JSON.parse(init.body)).toEqual({
      description: "A pool",
      unitOfAccount: "KES",
      email: null,
      website: null,
      phone: "+254700000000",
      terms: null,
      locationName: "Kilifi",
      geoLat: -3.5,
      geoLng: 39.9,
      tags: ["food"],
    });
  });
});

describe("voucher administration", () => {
  const base = {
    description: "A basket of fresh food",
    voucherUoa: "KES",
    voucherValue: 10,
    email: "issuer@example.test",
    website: "",
    phone: "",
    terms: "",
    locationName: "Kilifi",
    geoLat: -3.5,
    geoLng: 39.9,
    tags: ["food"],
  };

  it("PUTs the whole voucher profile and sends blanks as null", async () => {
    fetchMock.mockResolvedValue(ok({ voucher: { id: 1, address: ADDRESS, kind: "goods" } }));

    await client().updateVoucherProfile(ADDRESS, {
      ...base,
      email: "  ",
      phone: " +254700000000 ",
    });

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE_URL}/api/v2/admin/vouchers/${ADDRESS}/profile`);
    expect(init.method).toBe("PUT");
    if (typeof init.body !== "string") throw new Error("Expected a JSON request body");
    expect(JSON.parse(init.body)).toEqual({
      description: "A basket of fresh food",
      voucherUoa: "KES",
      voucherValue: 10,
      email: null,
      website: null,
      phone: "+254700000000",
      terms: null,
      locationName: "Kilifi",
      geoLat: -3.5,
      geoLng: 39.9,
      tags: ["food"],
    });
  });

  it("sends the voucher images only when the caller has an opinion about them", async () => {
    // Omitted: the columns are COALESCEd, so an absent key is what tells clc-core
    // to leave the stored image alone.
    fetchMock.mockResolvedValue(ok({ voucher: { id: 1, address: ADDRESS, kind: "goods" } }));
    await client().updateVoucherProfile(ADDRESS, base);
    let body = JSON.parse(lastCall().init.body as string) as Record<string, unknown>;
    expect("iconUrl" in body).toBe(false);
    expect("bannerUrl" in body).toBe(false);

    fetchMock.mockResolvedValue(ok({ voucher: { id: 1, address: ADDRESS, kind: "goods" } }));
    await client().updateVoucherProfile(ADDRESS, {
      ...base,
      iconUrl: "https://cdn.test/voucher/a_400_ab.webp",
      bannerUrl: "https://cdn.test/voucher/b_1280_ab.webp",
    });
    body = JSON.parse(lastCall().init.body as string) as Record<string, unknown>;
    expect(body.iconUrl).toBe("https://cdn.test/voucher/a_400_ab.webp");
    expect(body.bannerUrl).toBe("https://cdn.test/voucher/b_1280_ab.webp");

    // "" survives as "": it is how this endpoint removes an image, so the blanks
    // -> null rule the other fields follow would turn a removal into a no-op.
    fetchMock.mockResolvedValue(ok({ voucher: { id: 1, address: ADDRESS, kind: "goods" } }));
    await client().updateVoucherProfile(ADDRESS, { ...base, iconUrl: "" });
    body = JSON.parse(lastCall().init.body as string) as Record<string, unknown>;
    expect(body.iconUrl).toBe("");
  });

  // Omitting the key is what tells clc-core to keep an owner's override; a form
  // that never showed the field must not erase it.
  it("sends the display name only when the caller supplied one", async () => {
    fetchMock.mockResolvedValue(ok({ voucher: { id: 1, address: ADDRESS, kind: "goods" } }));
    await client().updateVoucherProfile(ADDRESS, base);
    let body = JSON.parse(lastCall().init.body as string) as Record<string, unknown>;
    expect("displayName" in body).toBe(false);

    fetchMock.mockResolvedValue(ok({ voucher: { id: 1, address: ADDRESS, kind: "goods" } }));
    await client().updateVoucherProfile(ADDRESS, { ...base, displayName: "Malii Fresh" });
    body = JSON.parse(lastCall().init.body as string) as Record<string, unknown>;
    expect(body.displayName).toBe("Malii Fresh");
  });

  // A null value is how the catalog records "no stated value", and 0 is a price.
  it("passes a cleared value through as null", async () => {
    fetchMock.mockResolvedValue(ok({ voucher: { id: 1, address: ADDRESS, kind: "goods" } }));

    await client().updateVoucherProfile(ADDRESS, { ...base, voucherValue: null });

    const body = JSON.parse(lastCall().init.body as string) as Record<string, unknown>;
    expect(body.voucherValue).toBeNull();
  });

  it("returns the saved catalog row so a console can seed its cache", async () => {
    fetchMock.mockResolvedValue(
      ok({
        voucher: {
          id: 2710,
          chainId: 42220,
          address: ADDRESS,
          name: "Kilifi Harvest",
          symbol: "KHV",
          voucherValue: "10",
          terms: "https://kilifi.example/terms",
          tags: ["food", "care"],
          kind: "goods",
        },
      }),
    );

    const voucher = await client().updateVoucherProfile(ADDRESS, base);

    expect(voucher).toMatchObject({
      id: "2710",
      address: ADDRESS,
      name: "Kilifi Harvest",
      voucherValue: "10",
      terms: "https://kilifi.example/terms",
      tags: ["food", "care"],
      kind: "goods",
    });
  });

  it("rejects a response with no usable address", async () => {
    fetchMock.mockResolvedValue(ok({ voucher: { id: 1, kind: "goods" } }));

    await expect(client().updateVoucherProfile(ADDRESS, base)).rejects.toThrow(
      /did not include a valid address/,
    );
  });
});

describe("getStats", () => {
  const payload = {
    range: {
      preset: "1d",
      since: "2026-08-12T00:00:00Z",
      until: "2026-08-13T00:00:00Z",
      bucket: "1h",
    },
    pools: 4,
    vouchers: 20,
    reports: 3,
    accounts: 9,
    transactions: 100,
    catalogSeries: [],
    transactionSeries: [],
  };

  it("requests the dashboard aggregate with the selected range", async () => {
    fetchMock.mockResolvedValue(ok(payload));

    const stats = await client().getStats({ range: "1h" });

    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/dashboard/stats?range=1h`);
    expect(stats.transactions).toBe(100);
    expect(stats.catalogSeries).toEqual([]);
    expect(stats.transactionSeries).toEqual([]);
  });

  it("treats a missing transaction total as null, not zero", async () => {
    fetchMock.mockResolvedValue(ok({ ...payload, transactions: null }));

    await expect(client().getStats({ range: "1d" })).resolves.toMatchObject({ transactions: null });
  });
});

describe("user mutations", () => {
  it("approves by address and returns the updated row", async () => {
    fetchMock.mockResolvedValue(ok({ user: user({ status: "APPROVED" }) }));

    const updated = await client().approveUser(ADDRESS);

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE_URL}/api/v2/admin/users/${ADDRESS}/approve`);
    expect(init.method).toBe("PUT");
    expect(updated.status).toBe("APPROVED");
  });

  it("sends no body when approving, so no JSON content type is set", async () => {
    fetchMock.mockResolvedValue(ok({ user: user() }));

    await client().approveUser(ADDRESS);

    const { init } = lastCall();
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("rejects by address", async () => {
    fetchMock.mockResolvedValue(ok({ user: user({ status: "REJECTED" }) }));

    const updated = await client().rejectUser(ADDRESS);

    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/users/${ADDRESS}/reject`);
    expect(updated.status).toBe("REJECTED");
  });

  it("updates a user role with the dedicated body", async () => {
    fetchMock.mockResolvedValue(ok({ user: user({ role: "ADMIN" }) }));

    const updated = await client().updateUserRole(ADDRESS, "ADMIN");

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE_URL}/api/v2/admin/users/${ADDRESS}/role`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ role: "ADMIN" });
    expect(updated.role).toBe("ADMIN");
  });

  it("sends both limits, because the backend replaces rather than patches them", async () => {
    fetchMock.mockResolvedValue(ok({ user: user({ maxPools: 3, maxTokens: 7 }) }));

    const updated = await client().updateUserLimits(ADDRESS, { maxPools: 3, maxTokens: 7 });

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE_URL}/api/v2/admin/users/${ADDRESS}/limits`);
    expect(JSON.parse(init.body as string)).toEqual({ maxPools: 3, maxTokens: 7 });
    expect(updated.maxPools).toBe(3);
  });

  it("updates a profile through the superadmin endpoint, not the self-service one", async () => {
    // PUT /auth/profile edits whoever is signed in, so an operator correcting
    // someone else's details must not be routed through it.
    fetchMock.mockResolvedValue(ok({ user: user({ name: "Ada Lovelace" }) }));

    const updated = await client().updateUserProfile(ADDRESS, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+254700000000",
      country: "KE",
      preferredCurrency: "KES",
      bio: "Community organiser",
      website: "https://ada.example",
    });

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE_URL}/api/v2/admin/users/${ADDRESS}/profile`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+254700000000",
      country: "KE",
      preferredCurrency: "KES",
      bio: "Community organiser",
      website: "https://ada.example",
    });
    expect(updated.name).toBe("Ada Lovelace");
  });

  it("sends no location keys, so a stored location is preserved", async () => {
    // The endpoint keeps a stored place when the keys are absent. Sending an empty
    // name would clear the label and leave the coordinates pointing at it.
    fetchMock.mockResolvedValue(ok({ user: user() }));

    await client().updateUserProfile(ADDRESS, {
      name: "Ada",
      email: "",
      phone: "",
      country: "KE",
    });

    const body = JSON.parse(lastCall().init.body as string);
    expect(body).not.toHaveProperty("locationName");
    expect(body).not.toHaveProperty("geoLat");
    expect(body).not.toHaveProperty("geoLng");
  });

  it("encodes the address so a malformed one cannot alter the route", async () => {
    fetchMock.mockResolvedValue(ok({ user: user() }));

    await client().approveUser("../../tokens");

    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/users/..%2F..%2Ftokens/approve`);
  });
});

describe("listVoucherTransactions", () => {
  const row = {
    id: 8_100_000_002,
    txId: 8100,
    logIndex: 2,
    txHash: "0xdeadbeef",
    t: "2026-08-13T11:00:00Z",
    success: true,
    type: "transfer",
    voucher: ADDRESS,
    voucherName: "Sarafu",
    voucherSymbol: "SRF",
    voucherDecimals: 6,
    from: ADDRESS,
    to: ADDRESS,
    amount: "1000000",
  };

  it("sends the cursor, filters and backend search term", async () => {
    fetchMock.mockResolvedValue(
      ok({ transactions: [row], first: 8_100_000_002, last: 8_100_000_002 }),
    );

    const page = await client().listVoucherTransactions({
      perPage: 25,
      cursor: 8_100_000_003,
      next: true,
      type: "mint",
      voucher: ADDRESS,
      q: "0xdead",
    });

    expect(lastCall().url).toBe(
      `${BASE_URL}/api/v2/admin/transactions/vouchers?perPage=25&cursor=8100000003&next=true&type=mint&voucher=${ADDRESS}&q=0xdead`,
    );
    expect(page).toMatchObject({ first: 8_100_000_002, last: 8_100_000_002, receivedCount: 1 });
  });

  it("omits a filter that was not asked for", async () => {
    fetchMock.mockResolvedValue(ok({ transactions: [], first: 0, last: 0 }));

    await client().listVoucherTransactions({ perPage: 10 });

    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/transactions/vouchers?perPage=10`);
  });

  it("reports unknown decimals as null so an amount is never shown at the wrong scale", async () => {
    fetchMock.mockResolvedValue(ok({ transactions: [{ ...row, voucherDecimals: null }] }));

    const page = await client().listVoucherTransactions({ perPage: 10 });

    expect(page.transactions[0]?.voucherDecimals).toBeNull();
  });

  it("keeps a burn's missing recipient null rather than an empty address", async () => {
    fetchMock.mockResolvedValue(ok({ transactions: [{ ...row, type: "burn", to: null }] }));

    const page = await client().listVoucherTransactions({ perPage: 10 });

    expect(page.transactions[0]?.to).toBeNull();
  });

  it("drops the scale a NUMERIC column would render, which formatTokenAmount rejects", async () => {
    fetchMock.mockResolvedValue(ok({ transactions: [{ ...row, amount: "1000000.000" }] }));

    const page = await client().listVoucherTransactions({ perPage: 10 });

    expect(page.transactions[0]?.amount).toBe("1000000");
  });

  it("reads an empty page from a null list", async () => {
    fetchMock.mockResolvedValue(ok({ transactions: null }));

    const page = await client().listVoucherTransactions({ perPage: 10 });

    expect(page).toMatchObject({ transactions: [], first: 0, last: 0, receivedCount: 0 });
  });
});

describe("listPoolTransactions", () => {
  const swap = {
    id: 9_000_000_001,
    txId: 9000,
    logIndex: 1,
    txHash: "0xfeed",
    t: "2026-08-13T11:00:00Z",
    success: true,
    type: "swap",
    pool: ADDRESS,
    initiator: ADDRESS,
    tokenIn: ADDRESS,
    tokenInSymbol: "SRF",
    tokenInDecimals: 6,
    amountIn: "1000000",
    tokenOut: ADDRESS,
    tokenOutSymbol: "CKS",
    tokenOutDecimals: 6,
    amountOut: "990000",
    fee: "10000",
  };

  it("sends the pool filter and backend search term", async () => {
    fetchMock.mockResolvedValue(ok({ transactions: [swap], first: 1, last: 1 }));

    await client().listPoolTransactions({
      perPage: 25,
      type: "swap",
      pool: ADDRESS,
      q: "0xfeed",
    });

    expect(lastCall().url).toBe(
      `${BASE_URL}/api/v2/admin/transactions/pools?perPage=25&type=swap&pool=${ADDRESS}&q=0xfeed`,
    );
  });

  it("keeps protocol fee precision and distinguishes zero from missing history", async () => {
    fetchMock.mockResolvedValue(
      ok({
        transactions: [
          { ...swap, protocolFee: "123456789012345678901" },
          { ...swap, protocolFee: "0" },
          { ...swap, protocolFee: null },
          { ...swap },
        ],
      }),
    );
    const page = await client().listPoolTransactions({ perPage: 10 });
    expect(page.transactions.map((row) => row.protocolFee)).toEqual([
      "123456789012345678901",
      "0",
      null,
      null,
    ]);
  });

  it("leaves a deposit's out side null, since nothing left the pool", async () => {
    fetchMock.mockResolvedValue(
      ok({
        transactions: [
          {
            ...swap,
            type: "deposit",
            tokenOut: null,
            tokenOutDecimals: null,
            amountOut: null,
            fee: null,
          },
        ],
      }),
    );

    const page = await client().listPoolTransactions({ perPage: 10 });

    expect(page.transactions[0]).toMatchObject({
      type: "deposit",
      tokenOut: null,
      tokenOutDecimals: null,
      amountOut: null,
      fee: null,
    });
  });
});

describe("listOTX", () => {
  const otx = {
    id: 12,
    trackingId: "2c1f1f0e-0000-4000-8000-000000000000",
    otxType: "RELAY_EXEC",
    signer: ADDRESS,
    txHash: "0xcafe",
    nonce: 41,
    replaced: false,
    status: "SUCCESS",
    createdAt: "2026-08-13T11:00:00Z",
    updatedAt: "2026-08-13T11:00:05Z",
  };

  it("sends both filters and a backend search term", async () => {
    fetchMock.mockResolvedValue(ok({ otx: [otx], first: 12, last: 12 }));

    const page = await client().listOTX({
      perPage: 25,
      type: "RELAY_EXEC",
      status: "SUCCESS",
      q: "2c1f",
    });

    expect(lastCall().url).toBe(
      `${BASE_URL}/api/v2/admin/transactions/otx?perPage=25&type=RELAY_EXEC&status=SUCCESS&q=2c1f`,
    );
    expect(page).toMatchObject({ first: 12, last: 12, receivedCount: 1 });
  });

  it("reads an empty page from a null list", async () => {
    fetchMock.mockResolvedValue(ok({ otx: null }));

    const page = await client().listOTX({ perPage: 10 });

    expect(page).toMatchObject({ otx: [], receivedCount: 0 });
  });
});

describe("operator desk administration", () => {
  const deployment = (id: number) => ({
    id,
    userId: id + 100,
    trackingId: `tracking-${id}`,
    resourceType: "voucher",
    createdAt: "2026-08-13T11:00:00Z",
    ethereumAddress: ADDRESS,
    userName: "Operator",
  });

  it("pages review notifications and resolves a selected action", async () => {
    const controller = new AbortController();
    fetchMock
      .mockResolvedValueOnce(
        ok({
          notifications: [
            {
              id: 7,
              reviewId: 8,
              voucherAddress: ADDRESS,
              reason: "spam",
              stars: 1,
              comment: "review",
              reportedStars: 5,
              reportedComment: "reported",
              createdAt: "2026-08-13T11:00:00Z",
            },
          ],
          next: 6,
        }),
      )
      .mockResolvedValueOnce(ok({}));

    const page = await client().listReviewNotifications({ before: 9 }, controller.signal);
    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/review-notifications?before=9`);
    expect(lastCall().init.signal).toBe(controller.signal);
    expect(page).toMatchObject({ next: 6 });
    expect(page.notifications).toHaveLength(1);

    await client().resolveReviewFlag(7, "hide");
    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/review-notifications/7`);
    expect(lastCall().init.method).toBe("PUT");
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ action: "hide" });
  });

  it("normalizes empty review pages and absent cursors", async () => {
    fetchMock.mockResolvedValue(ok({ notifications: null, next: "old" }));
    await expect(client().listReviewNotifications({})).resolves.toEqual({
      notifications: [],
      next: null,
    });
    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/review-notifications`);
  });

  it("uses server deployment cursors when available", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(ok({ deployments: [deployment(8)], first: 8, last: 8 }));

    const page = await client().listDeployments(
      { perPage: 5, cursor: 9, next: true },
      controller.signal,
    );

    expect(lastCall().url).toBe(
      `${BASE_URL}/api/v2/admin/deployments?perPage=5&cursor=9&next=true`,
    );
    expect(lastCall().init.signal).toBe(controller.signal);
    expect(page).toMatchObject({ first: 8, last: 8, receivedCount: 1 });
  });

  it("pages legacy deployment dumps in both directions", async () => {
    const rows = [deployment(6), deployment(10), deployment(8), deployment(4)];
    fetchMock.mockResolvedValue(ok({ deployments: rows }));
    await expect(client().listDeployments({ perPage: 2 })).resolves.toMatchObject({
      deployments: [deployment(10), deployment(8)],
      first: 10,
      last: 8,
    });

    fetchMock.mockResolvedValue(ok({ deployments: rows }));
    await expect(
      client().listDeployments({ perPage: 2, cursor: 9, next: true }),
    ).resolves.toMatchObject({ deployments: [deployment(8), deployment(6)] });

    fetchMock.mockResolvedValue(ok({ deployments: rows }));
    await expect(
      client().listDeployments({ perPage: 2, cursor: 7, next: false }),
    ).resolves.toMatchObject({ deployments: [deployment(10), deployment(8)] });

    fetchMock.mockResolvedValue(ok({ deployments: null }));
    await expect(client().listDeployments({ perPage: 2 })).resolves.toMatchObject({
      deployments: [],
      first: 0,
      last: 0,
      receivedCount: 0,
    });
  });

  it("queues token and pool upgrades with canonical addresses", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ trackingId: "token-upgrade", address: ADDRESS }))
      .mockResolvedValueOnce(ok({ trackingId: "pool-upgrade", upgrades: [], skipped: [] }));

    await expect(client().upgradeToken(ADDRESS.toLowerCase())).resolves.toMatchObject({
      trackingId: "token-upgrade",
    });
    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/contracts/upgrade/token`);
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ address: ADDRESS });

    await expect(client().upgradePool(ADDRESS.toLowerCase())).resolves.toMatchObject({
      trackingId: "pool-upgrade",
    });
    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/contracts/upgrade/pool`);
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ address: ADDRESS });
  });
});
