import { describe, expect, it } from "vite-plus/test";

import {
  classifyOccupiedCard,
  createWriterModel,
  issuanceCounts,
  issuanceOf,
  type WriterContext,
  type WriterEvent,
  type WriterModel,
  writerTransition,
} from "./issuance";
import type { NfcReading } from "./logic";

const context: WriterContext = { readyIds: [0, 1, 2], preparing: false };

function run(events: WriterEvent[], model = createWriterModel(), ctx = context): WriterModel {
  return events.reduce((current, event) => writerTransition(current, event, ctx), model);
}

function urlReading(url: string, serialNumber: string | null = null): NfcReading {
  return {
    serialNumber,
    records: [
      { recordType: "url", mediaType: null, encoding: null, data: new TextEncoder().encode(url) },
    ],
  };
}

describe("writerTransition", () => {
  it("writes, verifies and advances one row at a time", () => {
    let model = run([{ type: "start" }]);
    expect(model.phase).toMatchObject({ phase: "waiting", rowId: 0, overwrite: false });
    model = run([{ type: "write-succeeded", rowId: 0 }], model);
    expect(model.phase).toMatchObject({ phase: "verifying", rowId: 0, retap: false });
    expect(issuanceOf(model, 0).status).toBe("written");
    model = run([{ type: "verify-read", rowId: 0, matches: true }], model);
    expect(issuanceOf(model, 0).status).toBe("verified");
    expect(model.phase).toMatchObject({ phase: "waiting", rowId: 1 });
  });

  it("gives each arm a fresh id so its effect runs once", () => {
    const first = run([{ type: "start" }]);
    const second = run([{ type: "write-succeeded", rowId: 0 }], first);
    const third = run([{ type: "verify-read", rowId: 0, matches: true }], second);
    const ids = [first, second, third].map((model) =>
      "armId" in model.phase ? model.phase.armId : null,
    );
    expect(new Set(ids).size).toBe(3);
  });

  it("ignores a late result for a row that is no longer current", () => {
    const model = run([{ type: "start" }, { type: "write-succeeded", rowId: 0 }]);
    expect(run([{ type: "write-succeeded", rowId: 0 }], model)).toEqual(model);
    expect(run([{ type: "verify-read", rowId: 1, matches: true }], model)).toEqual(model);
  });

  it("finishes when the queue is empty, or waits while rows are preparing", () => {
    const fast = createWriterModel(false);
    const done = run(
      [
        { type: "start" },
        { type: "write-succeeded", rowId: 0 },
        { type: "write-succeeded", rowId: 1 },
        { type: "write-succeeded", rowId: 2 },
      ],
      fast,
    );
    expect(done.phase).toEqual({ phase: "finished" });
    expect(issuanceCounts(done, context.readyIds)).toMatchObject({
      issued: 3,
      written: 3,
      verified: 0,
    });

    const partial: WriterContext = { readyIds: [0], preparing: true };
    const starved = run([{ type: "start" }, { type: "write-succeeded", rowId: 0 }], fast, partial);
    expect(starved.phase).toEqual({ phase: "starved" });
    const woken = writerTransition(starved, { type: "rows-changed" }, { readyIds: [0, 1], preparing: true });
    expect(woken.phase).toMatchObject({ phase: "waiting", rowId: 1 });
  });

  it("keeps the row queued when a card is refused, then re-arms the same row", () => {
    const blocked = run([
      { type: "start" },
      {
        type: "write-failed",
        rowId: 0,
        error: "tag-occupied",
        occupied: { reason: "already-issued", issuedRowId: 2 },
      },
    ]);
    expect(blocked.phase).toMatchObject({ phase: "blocked", rowId: 0, issuedRowId: 2 });
    expect(issuanceOf(blocked, 0).status).toBe("pending");
    // A stale timer for an earlier block does nothing.
    expect(run([{ type: "rearm", armId: -1 }], blocked)).toEqual(blocked);
    const armId = blocked.phase.phase === "blocked" ? blocked.phase.armId : -1;
    expect(run([{ type: "rearm", armId }], blocked).phase).toMatchObject({
      phase: "waiting",
      rowId: 0,
      overwrite: false,
    });
  });

  it("never enables overwrite after a refusal; only a deliberate rewrite does", () => {
    const blocked = run([
      { type: "start" },
      { type: "write-failed", rowId: 0, error: "tag-occupied" },
    ]);
    const armId = blocked.phase.phase === "blocked" ? blocked.phase.armId : -1;
    expect(run([{ type: "rearm", armId }], blocked).phase).toMatchObject({ overwrite: false });
    expect(run([{ type: "rewrite", rowId: 0 }], blocked).phase).toMatchObject({
      phase: "waiting",
      rowId: 0,
      overwrite: true,
    });
  });

  it("holds an uncertain write for the operator and retries the same row", () => {
    const attention = run([
      { type: "start" },
      { type: "write-failed", rowId: 0, error: "transfer-failed" },
    ]);
    expect(attention.phase).toEqual({ phase: "attention", rowId: 0, reason: "transfer-failed" });
    expect(run([{ type: "retry" }], attention).phase).toMatchObject({ rowId: 0, overwrite: false });
    const setAside = run([{ type: "set-aside" }], attention);
    expect(setAside.setAside).toBe(1);
    expect(setAside.phase).toMatchObject({ phase: "waiting", rowId: 0 });
    expect(issuanceOf(setAside, 0)).toMatchObject({ status: "pending", note: expect.any(String) });
  });

  it("does not issue a row whose verification read mismatched", () => {
    const mismatch = run([
      { type: "start" },
      { type: "write-succeeded", rowId: 0 },
      { type: "verify-read", rowId: 0, matches: false },
    ]);
    expect(issuanceOf(mismatch, 0).status).toBe("pending");
    expect(issuanceOf(mismatch, 1).status).toBe("pending");
    expect(mismatch.phase).toEqual({ phase: "attention", rowId: 0, reason: "verify-mismatch" });
  });

  it("asks for a retap once, then lets the operator keep it unverified", () => {
    const verifying = run([{ type: "start" }, { type: "write-succeeded", rowId: 0 }]);
    const retap = run([{ type: "verify-timeout", rowId: 0 }], verifying);
    expect(retap.phase).toMatchObject({ phase: "verifying", retap: true });
    expect(run([{ type: "verify-timeout", rowId: 0 }], retap)).toEqual(retap);
    const skipped = run([{ type: "skip-verify" }], retap);
    expect(issuanceOf(skipped, 0).status).toBe("written");
    expect(skipped.phase).toMatchObject({ phase: "waiting", rowId: 1 });
  });

  it("pauses on abort and resumes the same unwritten row", () => {
    const paused = run([{ type: "start" }, { type: "write-failed", rowId: 0, error: "aborted" }]);
    expect(paused.phase).toEqual({ phase: "paused", rowId: 0 });
    expect(run([{ type: "start" }], paused).phase).toMatchObject({ phase: "waiting", rowId: 0 });
  });

  it("pausing mid-verification moves on from the written row", () => {
    const paused = run([
      { type: "start" },
      { type: "write-succeeded", rowId: 0 },
      { type: "pause" },
    ]);
    expect(paused.phase).toEqual({ phase: "paused", rowId: null });
    expect(run([{ type: "start" }], paused).phase).toMatchObject({ rowId: 1 });
  });

  it("stops on a permission or hardware failure", () => {
    expect(
      run([{ type: "start" }, { type: "write-failed", rowId: 0, error: "permission-denied" }]).phase,
    ).toEqual({ phase: "stopped", error: "permission-denied" });
  });

  it("leaves a skipped row unissued until requeued", () => {
    const skipped = run([{ type: "start" }, { type: "skip-row" }]);
    expect(issuanceOf(skipped, 0).status).toBe("skipped");
    expect(skipped.phase).toMatchObject({ rowId: 1 });
    expect(issuanceCounts(skipped, context.readyIds)).toMatchObject({ skipped: 1, issued: 0 });
    expect(issuanceOf(run([{ type: "requeue-skipped" }], skipped), 0).status).toBe("pending");
  });

  it("writes only registered rows", () => {
    expect(run([{ type: "rewrite", rowId: 7 }]).phase).toEqual({ phase: "idle" });
  });
});

describe("classifyOccupiedCard", () => {
  const rowForUrl = (url: string) => (url === "https://x/?w=b" ? 1 : null);

  it("recognizes the card that was just written by serial number", () => {
    expect(
      classifyOccupiedCard({
        observed: urlReading("https://x/?w=zzz", "04:aa"),
        previousCard: { serialNumber: "04:aa", url: "https://x/?w=a" },
        rowForUrl,
      }),
    ).toEqual({ reason: "card-still-present" });
  });

  it("falls back to the payload when serials are missing", () => {
    expect(
      classifyOccupiedCard({
        observed: urlReading("https://x/?w=a"),
        previousCard: { serialNumber: null, url: "https://x/?w=a" },
        rowForUrl,
      }),
    ).toEqual({ reason: "card-still-present" });
  });

  it("never treats two missing serials as the same card", () => {
    expect(
      classifyOccupiedCard({
        observed: urlReading("https://example.com"),
        previousCard: { serialNumber: null, url: "https://x/?w=a" },
        rowForUrl,
      }),
    ).toEqual({ reason: "occupied" });
  });

  it("names the row whose wallet a card already carries", () => {
    const key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const issued = `https://x/?w=${key}`;
    expect(
      classifyOccupiedCard({
        observed: urlReading(issued),
        previousCard: null,
        rowForUrl: (url) => (url === issued ? 4 : null),
      }),
    ).toEqual({ reason: "already-issued", issuedRowId: 4 });
  });

  it("reports plain occupancy when nothing was observed", () => {
    expect(classifyOccupiedCard({ observed: null, previousCard: null, rowForUrl })).toEqual({
      reason: "occupied",
    });
  });
});
