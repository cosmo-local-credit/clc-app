import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  matchVoucherOfferingListKey,
  offeringListKeyShapes,
  patchVoucherOfferingCaches,
  removeVoucherOfferingFromCaches,
} from "./cache";
import type { Offering, OfferingPage } from "./client";
import { offeringKeys } from "./queries";

const VOUCHER = "0x4444444444444444444444444444444444444444";
const OTHER_VOUCHER = "0x5555555555555555555555555555555555555555";
const PER_PAGE = 20;

function row(id: string, overrides: Partial<Offering> = {}): Offering {
  return {
    id,
    sourceId: null,
    voucherId: "10",
    voucherAddress: VOUCHER as Offering["voucherAddress"],
    voucherName: "Kilifi",
    voucherSymbol: "KLV",
    voucherDecimals: 6,
    sellerAddress: "0x6666666666666666666666666666666666666666" as Offering["sellerAddress"],
    name: `Offering ${id}`,
    commodityType: "GOOD",
    description: "",
    quantity: "1",
    unit: "kg",
    unitLabel: "kg",
    frequency: null,
    pricePerUnit: "10",
    available: true,
    locationName: null,
    geoLat: null,
    geoLng: null,
    imageUrl: null,
    tags: [],
    ...overrides,
  };
}

function page(ids: string[], overrides: Partial<OfferingPage> = {}): OfferingPage {
  return {
    offerings: ids.map((id) => row(id)),
    first: Number(ids.at(0) ?? 0),
    last: Number(ids.at(-1) ?? 0),
    receivedCount: ids.length,
    ...overrides,
  };
}

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient();
});

/** Seeds one entry of every list shape, for both vouchers. */
function seedEveryShape() {
  client.setQueryData(offeringKeys.byVoucher(VOUCHER, PER_PAGE), page(["3", "2"]));
  client.setQueryData(offeringKeys.byVoucherManaged(VOUCHER, PER_PAGE), page(["3", "2"]));
  client.setQueryData(offeringKeys.byVoucherInfinite(VOUCHER, PER_PAGE), {
    pages: [page(["3", "2"]), page(["1"])],
    pageParams: [undefined, 2],
  });
  client.setQueryData(offeringKeys.byVoucherManagedInfinite(VOUCHER, PER_PAGE), {
    pages: [page(["3", "2"]), page(["1"])],
    pageParams: [undefined, 2],
  });
  client.setQueryData(offeringKeys.byVoucher(OTHER_VOUCHER, PER_PAGE), page(["9"]));
  client.setQueryData(offeringKeys.byVoucherInfinite(OTHER_VOUCHER, PER_PAGE), {
    pages: [page(["9"])],
    pageParams: [undefined],
  });
}

describe("matchVoucherOfferingListKey", () => {
  // The guard this file exists for: adding a key factory without teaching the
  // patcher about it must fail here rather than shipping a shape that goes stale
  // with nothing to catch it.
  it("matches every list key factory under the voucher root", () => {
    const factories = [
      offeringKeys.byVoucher(VOUCHER, PER_PAGE),
      offeringKeys.byVoucherInfinite(VOUCHER, PER_PAGE),
      offeringKeys.byVoucherManaged(VOUCHER, PER_PAGE),
      offeringKeys.byVoucherManagedInfinite(VOUCHER, PER_PAGE),
    ];
    expect(factories).toHaveLength(offeringListKeyShapes.length);
    for (const key of factories) {
      expect(matchVoucherOfferingListKey(key, VOUCHER)).not.toBeNull();
    }
  });

  it("reports which shapes hold pages", () => {
    expect(matchVoucherOfferingListKey(offeringKeys.byVoucher(VOUCHER, PER_PAGE), VOUCHER)).toEqual(
      { infinite: false },
    );
    expect(
      matchVoucherOfferingListKey(offeringKeys.byVoucherInfinite(VOUCHER, PER_PAGE), VOUCHER),
    ).toEqual({ infinite: true });
    expect(
      matchVoucherOfferingListKey(offeringKeys.byVoucherManaged(VOUCHER, PER_PAGE), VOUCHER),
    ).toEqual({ infinite: false });
    expect(
      matchVoucherOfferingListKey(
        offeringKeys.byVoucherManagedInfinite(VOUCHER, PER_PAGE),
        VOUCHER,
      ),
    ).toEqual({ infinite: true });
  });

  // The detail key shares the root. Treating it as a page would overwrite an
  // Offering with an OfferingPage-shaped object and corrupt it silently.
  it("does not match the detail key", () => {
    expect(matchVoucherOfferingListKey(offeringKeys.detail(VOUCHER, "3"), VOUCHER)).toBeNull();
  });

  it("does not match another voucher, a pool, or the root itself", () => {
    for (const key of [
      offeringKeys.byVoucher(OTHER_VOUCHER, PER_PAGE),
      offeringKeys.byPool(VOUCHER, PER_PAGE),
      offeringKeys.byPoolInfinite(VOUCHER, PER_PAGE),
      offeringKeys.voucherRoot(VOUCHER),
      offeringKeys.all,
      ["clc", "vouchers", "voucher", VOUCHER.toLowerCase(), "page", PER_PAGE],
    ]) {
      expect(matchVoucherOfferingListKey(key, VOUCHER)).toBeNull();
    }
  });

  // Case folding, because the same voucher reaches the client checksummed from a
  // session and lower-cased from the catalog.
  it("matches regardless of address casing on either side", () => {
    expect(
      matchVoucherOfferingListKey(
        offeringKeys.byVoucher(VOUCHER.toUpperCase(), PER_PAGE),
        VOUCHER.toLowerCase(),
      ),
    ).not.toBeNull();
  });

  it("rejects a key whose last segment is not a page size", () => {
    expect(
      matchVoucherOfferingListKey([...offeringKeys.voucherRoot(VOUCHER), "page", "20"], VOUCHER),
    ).toBeNull();
  });
});

describe("patchVoucherOfferingCaches", () => {
  it("updates an existing row in every shape and leaves other vouchers alone", () => {
    seedEveryShape();

    const touched = patchVoucherOfferingCaches(client, VOUCHER, row("2", { name: "Renamed" }));
    expect(touched).toBe(4);

    for (const key of [
      offeringKeys.byVoucher(VOUCHER, PER_PAGE),
      offeringKeys.byVoucherManaged(VOUCHER, PER_PAGE),
    ]) {
      const cached = client.getQueryData<OfferingPage>(key);
      expect(cached?.offerings.map((entry) => entry.name)).toEqual(["Offering 3", "Renamed"]);
    }
    for (const key of [
      offeringKeys.byVoucherInfinite(VOUCHER, PER_PAGE),
      offeringKeys.byVoucherManagedInfinite(VOUCHER, PER_PAGE),
    ]) {
      const cached = client.getQueryData<{ pages: OfferingPage[] }>(key);
      expect(cached?.pages[0]?.offerings.map((entry) => entry.name)).toEqual([
        "Offering 3",
        "Renamed",
      ]);
    }

    // Another voucher's pages are untouched.
    expect(
      client.getQueryData<OfferingPage>(offeringKeys.byVoucher(OTHER_VOUCHER, PER_PAGE))?.offerings,
    ).toHaveLength(1);
  });

  // Newest first, matching every offering statement's ORDER BY o.id DESC.
  it("inserts a new row at the head of the first page only", () => {
    seedEveryShape();

    patchVoucherOfferingCaches(client, VOUCHER, row("4"));

    expect(
      client
        .getQueryData<OfferingPage>(offeringKeys.byVoucher(VOUCHER, PER_PAGE))
        ?.offerings.map((entry) => entry.id),
    ).toEqual(["4", "3", "2"]);

    const infinite = client.getQueryData<{ pages: OfferingPage[] }>(
      offeringKeys.byVoucherInfinite(VOUCHER, PER_PAGE),
    );
    expect(infinite?.pages[0]?.offerings.map((entry) => entry.id)).toEqual(["4", "3", "2"]);
    // Not appended to a later page: that would put the row on the wrong side of a
    // cursor boundary.
    expect(infinite?.pages[1]?.offerings.map((entry) => entry.id)).toEqual(["1"]);
  });

  // A row updated on a later page is updated in place, not moved or duplicated.
  it("updates a row that lives on a later page", () => {
    client.setQueryData(offeringKeys.byVoucherInfinite(VOUCHER, PER_PAGE), {
      pages: [page(["3", "2"]), page(["1"])],
      pageParams: [undefined, 2],
    });

    patchVoucherOfferingCaches(client, VOUCHER, row("1", { name: "Deep" }));

    const infinite = client.getQueryData<{ pages: OfferingPage[] }>(
      offeringKeys.byVoucherInfinite(VOUCHER, PER_PAGE),
    );
    expect(infinite?.pages[1]?.offerings.map((entry) => entry.name)).toEqual(["Deep"]);
    expect(infinite?.pages[0]?.offerings.map((entry) => entry.id)).toEqual(["3", "2"]);
  });

  // receivedCount counts rows the backend sent. Bumping it for a locally inserted
  // row would tell the cursor a short page was full and stop the paginator.
  it("leaves receivedCount alone when it inserts", () => {
    client.setQueryData(offeringKeys.byVoucher(VOUCHER, PER_PAGE), page(["3"]));

    patchVoucherOfferingCaches(client, VOUCHER, row("4"));

    const cached = client.getQueryData<OfferingPage>(offeringKeys.byVoucher(VOUCHER, PER_PAGE));
    expect(cached?.receivedCount).toBe(1);
    expect(cached?.offerings).toHaveLength(2);
  });

  it("seeds the detail key from the saved row", () => {
    patchVoucherOfferingCaches(client, VOUCHER, row("7", { name: "Seeded" }));

    expect(client.getQueryData<Offering>(offeringKeys.detail(VOUCHER, "7"))?.name).toBe("Seeded");
  });

  // Nothing cached is not an error: the patch is authoritative either way, and a
  // screen that has not read yet will read fresh.
  it("is a no-op against an empty cache", () => {
    expect(patchVoucherOfferingCaches(client, VOUCHER, row("1"))).toBe(0);
  });
});

describe("removeVoucherOfferingFromCaches", () => {
  it("removes the row from every shape and page", () => {
    seedEveryShape();

    const touched = removeVoucherOfferingFromCaches(client, VOUCHER, "2");
    expect(touched).toBe(4);

    for (const key of [
      offeringKeys.byVoucher(VOUCHER, PER_PAGE),
      offeringKeys.byVoucherManaged(VOUCHER, PER_PAGE),
    ]) {
      expect(client.getQueryData<OfferingPage>(key)?.offerings.map((entry) => entry.id)).toEqual([
        "3",
      ]);
    }
    for (const key of [
      offeringKeys.byVoucherInfinite(VOUCHER, PER_PAGE),
      offeringKeys.byVoucherManagedInfinite(VOUCHER, PER_PAGE),
    ]) {
      const cached = client.getQueryData<{ pages: OfferingPage[] }>(key);
      expect(cached?.pages.flatMap((entry) => entry.offerings.map((o) => o.id))).toEqual([
        "3",
        "1",
      ]);
    }
    expect(
      client
        .getQueryData<OfferingPage>(offeringKeys.byVoucher(OTHER_VOUCHER, PER_PAGE))
        ?.offerings.map((entry) => entry.id),
    ).toEqual(["9"]);
  });

  it("removes a row that lives on a later page", () => {
    client.setQueryData(offeringKeys.byVoucherInfinite(VOUCHER, PER_PAGE), {
      pages: [page(["3", "2"]), page(["1"])],
      pageParams: [undefined, 2],
    });

    removeVoucherOfferingFromCaches(client, VOUCHER, "1");

    const infinite = client.getQueryData<{ pages: OfferingPage[] }>(
      offeringKeys.byVoucherInfinite(VOUCHER, PER_PAGE),
    );
    expect(infinite?.pages[1]?.offerings).toEqual([]);
  });

  // Removed, not set to null: "not fetched" already means the same thing, and a
  // cached null is a value every reader would have to handle.
  it("drops the detail entry entirely", () => {
    client.setQueryData(offeringKeys.detail(VOUCHER, "2"), row("2"));

    removeVoucherOfferingFromCaches(client, VOUCHER, "2");

    expect(client.getQueryState(offeringKeys.detail(VOUCHER, "2"))).toBeUndefined();
  });

  it("leaves another voucher's identically numbered row in place", () => {
    client.setQueryData(offeringKeys.byVoucher(VOUCHER, PER_PAGE), page(["2"]));
    client.setQueryData(offeringKeys.byVoucher(OTHER_VOUCHER, PER_PAGE), page(["2"]));

    removeVoucherOfferingFromCaches(client, VOUCHER, "2");

    expect(
      client.getQueryData<OfferingPage>(offeringKeys.byVoucher(VOUCHER, PER_PAGE))?.offerings,
    ).toEqual([]);
    expect(
      client.getQueryData<OfferingPage>(offeringKeys.byVoucher(OTHER_VOUCHER, PER_PAGE))?.offerings,
    ).toHaveLength(1);
  });
});
