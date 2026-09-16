import { describe, expect, it } from "vite-plus/test";
import { derivePageCursors } from "./cursor-page";

describe("derivePageCursors", () => {
  it("offers a next cursor while the page came back full", () => {
    const cursors = derivePageCursors({ first: 100, last: 80, receivedCount: 25 }, 25, true);
    expect(cursors.nextCursor).toBe(80);
    expect(cursors.mightHaveMore).toBe(true);
  });

  it("offers no next cursor on a short page", () => {
    const cursors = derivePageCursors({ first: 100, last: 90, receivedCount: 12 }, 25, true);
    expect(cursors.nextCursor).toBeUndefined();
    expect(cursors.mightHaveMore).toBe(false);
  });

  it("offers no next cursor when the backend gave no upper bound", () => {
    const cursors = derivePageCursors({ first: 100, receivedCount: 25 }, 25, true);
    expect(cursors.nextCursor).toBeUndefined();
    expect(cursors.mightHaveMore).toBe(false);
  });

  it("offers no previous cursor on the first page", () => {
    expect(
      derivePageCursors({ first: 100, last: 80, receivedCount: 25 }, 25, true).previousCursor,
    ).toBeUndefined();
  });

  it("offers a previous cursor once past the first page", () => {
    expect(
      derivePageCursors({ first: 100, last: 80, receivedCount: 25 }, 25, false).previousCursor,
    ).toBe(100);
  });

  it("counts rows the backend sent, not rows that survived normalization", () => {
    // receivedCount is the honest measure. Using the normalized row count would
    // stop paging early whenever a page contained a malformed row.
    const cursors = derivePageCursors({ first: 100, last: 80, receivedCount: 25 }, 25, true);
    expect(cursors.mightHaveMore).toBe(true);
  });

  it("treats an over-full page as having more, rather than assuming exactness", () => {
    const cursors = derivePageCursors({ first: 100, last: 70, receivedCount: 26 }, 25, true);
    expect(cursors.mightHaveMore).toBe(true);
  });

  it("stops at an empty page", () => {
    const cursors = derivePageCursors({ receivedCount: 0 }, 25, false);
    expect(cursors.nextCursor).toBeUndefined();
    expect(cursors.mightHaveMore).toBe(false);
  });
});
