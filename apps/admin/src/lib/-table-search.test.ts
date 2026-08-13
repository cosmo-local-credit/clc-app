import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_PAGE_SIZE,
  firstPageSearch,
  isFirstPage,
  nextPageSearch,
  pageSizeSearch,
  parsePageSize,
  parseTableSearch,
  previousPageSearch,
  sortSearch,
} from "./table-search";

describe("parsePageSize", () => {
  it("accepts only supported sizes", () => {
    expect(parsePageSize(10)).toBe(10);
    expect(parsePageSize(25)).toBe(25);
    expect(parsePageSize(50)).toBe(50);
    expect(parsePageSize(100)).toBe(100);
  });

  it("reads a size from a URL string", () => {
    expect(parsePageSize("50")).toBe(50);
  });

  it("falls back instead of honouring an arbitrary size from the URL", () => {
    // A hand-edited ?perPage=100000 must not be able to request the world.
    expect(parsePageSize(100_000)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize(-25)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("all")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe("parseTableSearch", () => {
  it("defaults to the first page at the default size", () => {
    expect(parseTableSearch({})).toEqual({ perPage: DEFAULT_PAGE_SIZE });
  });

  it("reads a cursor and direction together", () => {
    expect(parseTableSearch({ cursor: "480", dir: "next", perPage: "50" })).toEqual({
      perPage: 50,
      cursor: 480,
      dir: "next",
    });
  });

  it("drops a cursor with no direction, which names no page", () => {
    expect(parseTableSearch({ cursor: "480" })).toEqual({ perPage: DEFAULT_PAGE_SIZE });
  });

  it("drops a direction with no cursor", () => {
    expect(parseTableSearch({ dir: "next" })).toEqual({ perPage: DEFAULT_PAGE_SIZE });
  });

  it("rejects a non-integer or negative cursor rather than sending it upstream", () => {
    expect(parseTableSearch({ cursor: "abc", dir: "next" }).cursor).toBeUndefined();
    expect(parseTableSearch({ cursor: "-5", dir: "next" }).cursor).toBeUndefined();
    expect(parseTableSearch({ cursor: "1.5", dir: "next" }).cursor).toBeUndefined();
  });

  it("defaults a sorted column to ascending", () => {
    expect(parseTableSearch({ sort: "name" })).toEqual({
      perPage: DEFAULT_PAGE_SIZE,
      sort: "name",
      order: "asc",
    });
  });

  it("drops an order with no column", () => {
    expect(parseTableSearch({ order: "desc" })).toEqual({ perPage: DEFAULT_PAGE_SIZE });
  });

  it("ignores an unrecognized direction or order instead of failing", () => {
    expect(parseTableSearch({ cursor: "1", dir: "sideways" }).dir).toBeUndefined();
    expect(parseTableSearch({ sort: "name", order: "random" }).order).toBe("asc");
  });
});

describe("navigation transitions", () => {
  const sorted = { perPage: 50 as const, sort: "name", order: "desc" as const };

  it("keeps page size and ordering when stepping forward", () => {
    expect(nextPageSearch(sorted, 480)).toEqual({ ...sorted, cursor: 480, dir: "next" });
  });

  it("steps backward with the opposite direction", () => {
    expect(previousPageSearch({ ...sorted, cursor: 480, dir: "next" }, 500)).toEqual({
      ...sorted,
      cursor: 500,
      dir: "prev",
    });
  });

  it("returns to the first page without losing size or ordering", () => {
    expect(firstPageSearch({ ...sorted, cursor: 480, dir: "next" })).toEqual(sorted);
  });

  it("resets to the first page when the page size changes", () => {
    // A cursor was issued for the old size and does not address the same rows.
    expect(pageSizeSearch({ ...sorted, cursor: 480, dir: "next" }, 25)).toEqual({
      perPage: 25,
      sort: "name",
      order: "desc",
    });
  });
});

describe("sortSearch", () => {
  it("cycles a column ascending, then descending, then off", () => {
    const base = { perPage: 25 as const };
    const asc = sortSearch(base, "name");
    expect(asc).toEqual({ perPage: 25, sort: "name", order: "asc" });

    const desc = sortSearch(asc, "name");
    expect(desc).toEqual({ perPage: 25, sort: "name", order: "desc" });

    expect(sortSearch(desc, "name")).toEqual({ perPage: 25 });
  });

  it("starts a different column ascending", () => {
    const current = { perPage: 25 as const, sort: "name", order: "desc" as const };
    expect(sortSearch(current, "symbol")).toEqual({ perPage: 25, sort: "symbol", order: "asc" });
  });

  it("returns to the first page when sorting changes", () => {
    // Sorting applies to the fetched page only, so keeping a cursor would present
    // one arbitrary page's ordering as the resource's ordering.
    const paged = { perPage: 25 as const, cursor: 480, dir: "next" as const };
    expect(sortSearch(paged, "name").cursor).toBeUndefined();
    expect(sortSearch(paged, "name").dir).toBeUndefined();
  });
});

describe("isFirstPage", () => {
  it("is true only without a cursor", () => {
    expect(isFirstPage({ perPage: 25 })).toBe(true);
    expect(isFirstPage({ perPage: 25, cursor: 0, dir: "next" })).toBe(false);
  });
});
