import { emptyReportWrite } from "@clc/core/features/reports/logic";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  clearPostDraft,
  MAX_POST_DRAFT_AGE_MS,
  readPostDraft,
  writePostDraft,
} from "./post-draft-storage";

const OWNER = "0xabc0000000000000000000000000000000000123";
const STORAGE_KEY = "clc_post_draft_v1";

function draft(overrides: Partial<typeof emptyReportWrite> = {}) {
  return { ...emptyReportWrite, title: "Half-written", ...overrides };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("post draft storage", () => {
  it("round-trips an unfinished post", () => {
    writePostDraft(OWNER, draft({ title: "", body: "## Notes" }));

    // A blank title is what an unfinished post usually has; the write schema
    // would reject it and there would be nothing to restore.
    expect(readPostDraft(OWNER)).toMatchObject({ title: "", body: "## Notes" });
  });

  it("belongs to one author", () => {
    writePostDraft(OWNER, draft());

    expect(readPostDraft("0xdef0000000000000000000000000000000000456")).toBeNull();
    expect(readPostDraft(OWNER)).not.toBeNull();
  });

  it("forgets a draft nobody came back to, and stops offering it", () => {
    const stale = new Date(Date.now() - MAX_POST_DRAFT_AGE_MS - 1).toISOString();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ owner: OWNER, savedAt: stale, values: draft() }),
    );

    expect(readPostDraft(OWNER)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("ignores content it cannot trust", () => {
    window.localStorage.setItem(STORAGE_KEY, "not json");
    expect(readPostDraft(OWNER)).toBeNull();

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        owner: OWNER,
        savedAt: new Date().toISOString(),
        values: { ...draft(), tags: "Youth" },
      }),
    );
    expect(readPostDraft(OWNER)).toBeNull();
  });

  it("clears on request", () => {
    writePostDraft(OWNER, draft());
    clearPostDraft();

    expect(readPostDraft(OWNER)).toBeNull();
  });
});
