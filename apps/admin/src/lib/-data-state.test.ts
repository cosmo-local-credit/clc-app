import { describe, expect, it } from "vite-plus/test";
import { type QueryLike, isFigureAvailable, resolveDataState } from "./data-state";

function query(overrides: Partial<QueryLike> = {}): QueryLike {
  return { isPending: false, isError: false, error: null, hasData: true, ...overrides };
}

describe("resolveDataState", () => {
  it("reports pending before any data arrives", () => {
    expect(resolveDataState(query({ isPending: true, hasData: false }), true)).toEqual({
      kind: "pending",
    });
  });

  it("reports error when a request failed with nothing cached", () => {
    const state = resolveDataState(
      query({ isError: true, error: new Error("Failed to fetch"), hasData: false }),
      true,
    );
    expect(state).toEqual({ kind: "error", message: "Failed to fetch" });
  });

  it("never reports empty for a failed request, even when the row list is empty", () => {
    // The regression this whole module exists to prevent: a failed request
    // rendering as a convincing "no rows" state.
    const state = resolveDataState(
      query({ isError: true, error: new Error("boom"), hasData: false }),
      true,
    );
    expect(state.kind).not.toBe("empty");
    expect(state.kind).toBe("error");
  });

  it("reports stale, not error, when a refresh fails but data is still cached", () => {
    const state = resolveDataState(
      query({ isError: true, error: new Error("network down"), hasData: true }),
      false,
    );
    expect(state).toEqual({ kind: "stale", message: "network down" });
  });

  it("distinguishes a successful empty result from a failure", () => {
    expect(resolveDataState(query(), true)).toEqual({ kind: "empty" });
  });

  it("reports ready when data is present and non-empty", () => {
    expect(resolveDataState(query(), false)).toEqual({ kind: "ready" });
  });

  it("treats a settled query with no cached data as pending rather than empty", () => {
    // enabled:false queries settle without data; they have not failed and have
    // no result, so they must not claim emptiness.
    expect(resolveDataState(query({ hasData: false }), true)).toEqual({ kind: "pending" });
  });

  it("falls back to a generic message for a non-Error rejection", () => {
    const state = resolveDataState(query({ isError: true, error: "nope", hasData: false }), true);
    expect(state).toEqual({ kind: "error", message: "Request failed." });
  });

  it("falls back to a generic message for an Error with a blank message", () => {
    const state = resolveDataState(
      query({ isError: true, error: new Error("   "), hasData: false }),
      true,
    );
    expect(state.kind === "error" && state.message).toBe("Request failed.");
  });
});

describe("isFigureAvailable", () => {
  it("allows a figure for ready, empty and stale data", () => {
    expect(isFigureAvailable({ kind: "ready" })).toBe(true);
    expect(isFigureAvailable({ kind: "empty" })).toBe(true);
    expect(isFigureAvailable({ kind: "stale", message: "x" })).toBe(true);
  });

  it("withholds a figure while pending or failed, so it cannot render as zero", () => {
    expect(isFigureAvailable({ kind: "pending" })).toBe(false);
    expect(isFigureAvailable({ kind: "error", message: "x" })).toBe(false);
  });
});
