import { describe, expect, it } from "vite-plus/test";

import {
  canonicalCreditableBrowseSearch,
  pickCreditableBrowseSearch,
} from "./creditable-browse-search";
import { parsePoolCreditable } from "./pool-search";

describe("Credit browse URL state", () => {
  it.each([
    [undefined, { ok: true, enabled: null }],
    ["", { ok: true, enabled: null }],
    ["   ", { ok: true, enabled: null }],
    [true, { ok: true, enabled: true }],
    [false, { ok: true, enabled: false }],
    [" TRUE ", { ok: true, enabled: true }],
    [" False ", { ok: true, enabled: false }],
  ])("parses %j", (value, expected) => {
    expect(parsePoolCreditable(value)).toEqual(expected);
  });

  it.each([["yes"], [["true", "false"]], [["true"]], [42]])(
    "rejects malformed or repeated value %j",
    (value) => {
      expect(parsePoolCreditable(value as never)).toEqual({ ok: false });
    },
  );

  it("keeps catalog search and tag state while picking Credit", () => {
    expect(
      pickCreditableBrowseSearch({
        q: " maize ",
        tags: "food,local",
        tagMatch: "all",
        creditable: "true",
        ignored: "value",
      }),
    ).toEqual({
      q: " maize ",
      tags: "food,local",
      tagMatch: "all",
      creditable: "true",
    });
  });

  it("normalizes valid repeated values and marks every malformed shape invalid", () => {
    expect(pickCreditableBrowseSearch(null)).toEqual({});
    expect(pickCreditableBrowseSearch({ creditable: [true, "false"] })).toEqual({
      creditable: [true, "false"],
    });
    expect(pickCreditableBrowseSearch({ creditable: [true, 1] })).toEqual({
      creditable: ["__invalid__"],
    });
    expect(pickCreditableBrowseSearch({ creditable: 1 })).toEqual({
      creditable: ["__invalid__"],
    });
  });

  it("canonicalizes case and whitespace without dropping other filters", () => {
    expect(
      canonicalCreditableBrowseSearch({
        q: " maize ",
        tags: "food,local",
        creditable: " TRUE ",
      }),
    ).toEqual({ q: "maize", tags: "food,local", creditable: true });
  });

  it("removes empty Credit values and leaves invalid values for inline feedback", () => {
    expect(canonicalCreditableBrowseSearch({ q: "maize", creditable: " " })).toEqual({
      q: "maize",
      creditable: undefined,
    });
    expect(
      canonicalCreditableBrowseSearch({ q: "maize", creditable: ["true", "false"] }),
    ).toBeNull();
  });
});
