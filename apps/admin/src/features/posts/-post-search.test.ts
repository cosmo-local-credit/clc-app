import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_POST_SEARCH,
  isPostFirstPage,
  normalizePostTerm,
  parsePostSearch,
  postCursorParam,
  postFilterSearch,
  postFirstPageSearch,
  postNextPageSearch,
  postNextParam,
  postPageSizeSearch,
  postPreviousPageSearch,
  postSortSearch,
  postStatusParam,
  type PostSearch,
} from "./post-search";

const CURSOR = { updatedAt: "2026-08-20T10:00:00Z", id: "4633" };

function search(overrides: Partial<PostSearch> = {}): PostSearch {
  return { ...DEFAULT_POST_SEARCH, ...overrides };
}

describe("parsePostSearch", () => {
  // The queue is the work: an operator opening this screen is here to review
  // what is waiting.
  it("defaults to the awaiting-approval queue", () => {
    expect(parsePostSearch({})).toEqual({ perPage: 10, status: "SUBMITTED" });
    expect(parsePostSearch({ status: "nonsense" }).status).toBe("SUBMITTED");
  });

  it("accepts every status and the ALL sentinel", () => {
    for (const status of ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ALL"] as const) {
      expect(parsePostSearch({ status }).status).toBe(status);
    }
  });

  it("keeps a valid author and drops a malformed one", () => {
    const address = "0xAbC0000000000000000000000000000000000123";
    expect(parsePostSearch({ author: address }).author).toBe(address);
    expect(parsePostSearch({ author: "0xnope" }).author).toBeUndefined();
    expect(parsePostSearch({ author: 42 }).author).toBeUndefined();
  });

  // The URL keeps the raw draft so the field does not lose a character while
  // the term is still too short to search; `normalizePostTerm` is what drops it
  // before a request, since clc-core answers 400 under two characters.
  it("keeps the raw term and normalizes only for the request", () => {
    expect(parsePostSearch({ q: "h" }).q).toBe("h");
    expect(normalizePostTerm(parsePostSearch({ q: "h" }).q)).toBeUndefined();

    expect(parsePostSearch({ q: "  harvest  " }).q).toBe("harvest");
    expect(normalizePostTerm("a  b")).toBe("a b");
    expect(normalizePostTerm("x".repeat(80))).toHaveLength(64);
  });

  // The router's default parser reads a bare number as a number.
  it("coerces a numeric cursor id back to text", () => {
    const parsed = parsePostSearch({
      cursorUpdatedAt: CURSOR.updatedAt,
      cursorId: 4633,
      dir: "next",
    });
    expect(postCursorParam(parsed)).toEqual(CURSOR);
  });

  // One half of a keyset position names no page, and clc-core rejects it.
  it("keeps the cursor pair together or drops it", () => {
    const complete = parsePostSearch({
      cursorUpdatedAt: CURSOR.updatedAt,
      cursorId: CURSOR.id,
      dir: "next",
    });
    expect(postCursorParam(complete)).toEqual(CURSOR);
    expect(postNextParam(complete)).toBe(true);

    for (const partial of [
      { cursorUpdatedAt: CURSOR.updatedAt, dir: "next" },
      { cursorId: CURSOR.id, dir: "next" },
      { cursorUpdatedAt: CURSOR.updatedAt, cursorId: CURSOR.id },
      { cursorUpdatedAt: CURSOR.updatedAt, cursorId: CURSOR.id, dir: "sideways" },
    ]) {
      const parsed = parsePostSearch(partial);
      expect(postCursorParam(parsed)).toBeUndefined();
      expect(postNextParam(parsed)).toBeUndefined();
      expect(isPostFirstPage(parsed)).toBe(true);
    }
  });

  it("maps the URL direction to the API's boolean", () => {
    expect(postNextParam(search({ ...cursorFields(), dir: "prev" }))).toBe(false);
    expect(postNextParam(search({ ...cursorFields(), dir: "next" }))).toBe(true);
    // Without a cursor there is no direction to send.
    expect(postNextParam(search({ dir: "next" }))).toBeUndefined();
  });

  it("pairs a sort order with its column and never alone", () => {
    expect(parsePostSearch({ sort: "title" })).toMatchObject({ sort: "title", order: "asc" });
    expect(parsePostSearch({ sort: "title", order: "desc" })).toMatchObject({ order: "desc" });
    expect(parsePostSearch({ order: "desc" }).sort).toBeUndefined();
  });
});

describe("postStatusParam", () => {
  // ALL is a URL sentinel, not a wire value: clc-core would answer 400.
  it("omits the status for the ALL sentinel", () => {
    expect(postStatusParam("ALL")).toBeUndefined();
    expect(postStatusParam("SUBMITTED")).toBe("SUBMITTED");
    expect(postStatusParam("APPROVED")).toBe("APPROVED");
  });
});

describe("navigation helpers", () => {
  const paged = search({ ...cursorFields(), dir: "next", q: "harvest", sort: "title" });

  // A cursor named a page of the old result set.
  it("drops both cursor halves on any filter change", () => {
    for (const next of [
      postFilterSearch(paged, { status: "APPROVED" }),
      postFilterSearch(paged, { q: "maize" }),
      postFilterSearch(paged, { author: "0xAbC0000000000000000000000000000000000123" }),
      postPageSizeSearch(paged, 50),
      postSortSearch(paged, "updatedAt"),
      postFirstPageSearch(paged),
    ]) {
      expect(next.cursorUpdatedAt).toBeUndefined();
      expect(next.cursorId).toBeUndefined();
      expect(next.dir).toBeUndefined();
    }
  });

  it("keeps the filters and page size across a page change", () => {
    const next = postNextPageSearch(paged, CURSOR);
    expect(next).toMatchObject({ q: "harvest", perPage: paged.perPage, dir: "next" });

    const previous = postPreviousPageSearch(paged, CURSOR);
    expect(previous).toMatchObject({ q: "harvest", dir: "prev" });
  });

  it("cycles a column through ascending, descending and unsorted", () => {
    const ascending = postSortSearch(search(), "title");
    expect(ascending).toMatchObject({ sort: "title", order: "asc" });

    const descending = postSortSearch(ascending, "title");
    expect(descending).toMatchObject({ sort: "title", order: "desc" });

    const cleared = postSortSearch(descending, "title");
    expect(cleared.sort).toBeUndefined();
    expect(cleared.order).toBeUndefined();
  });
});

describe("normalizePostTerm", () => {
  it("counts code points rather than UTF-16 units", () => {
    // Two emoji are two characters, not four, so this is a valid term.
    expect(normalizePostTerm("🌾🌾")).toBe("🌾🌾");
    expect(normalizePostTerm("🌾")).toBeUndefined();
  });
});

function cursorFields() {
  return { cursorUpdatedAt: CURSOR.updatedAt, cursorId: CURSOR.id };
}
