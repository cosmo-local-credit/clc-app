import { describe, expect, it } from "vite-plus/test";

import { IMAGE_UPLOAD_CONCURRENCY, uploadInOrder } from "./batch";

/** A worker that finishes in a deliberately different order than it started. */
function staggered(delays: readonly number[], onStart?: () => void, onEnd?: () => void) {
  return (item: number) => {
    onStart?.();
    return new Promise<string>((resolve) => {
      setTimeout(() => {
        onEnd?.();
        resolve(`done-${item}`);
      }, delays[item] ?? 0);
    });
  };
}

describe("uploadInOrder", () => {
  it("returns results in input order even when requests finish out of order", async () => {
    const items = [0, 1, 2, 3];
    // Item 0 is the slowest, so completion order is the reverse of input order.
    const results = await uploadInOrder(items, staggered([40, 30, 20, 10]));

    expect(
      results.map((result) => (result.status === "fulfilled" ? result.value : result.reason)),
    ).toEqual(["done-0", "done-1", "done-2", "done-3"]);
  });

  it("never runs more than the configured number at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = [0, 1, 2, 3, 4, 5, 6];

    await uploadInOrder(
      items,
      staggered(
        [5, 5, 5, 5, 5, 5, 5],
        () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
        },
        () => {
          inFlight -= 1;
        },
      ),
    );

    expect(peak).toBe(IMAGE_UPLOAD_CONCURRENCY);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("keeps successes when one item fails, so a retry re-sends only the failure", async () => {
    const results = await uploadInOrder([0, 1, 2], async (item) => {
      if (item === 1) throw new Error("upload failed");
      return `done-${item}`;
    });

    expect(results[0]).toEqual({ status: "fulfilled", value: "done-0" });
    expect(results[1]?.status).toBe("rejected");
    expect(results[2]).toEqual({ status: "fulfilled", value: "done-2" });
  });

  it("does nothing, and starts no workers, for an empty selection", async () => {
    let started = 0;
    const results = await uploadInOrder([], async () => {
      started += 1;
      return "unreachable";
    });

    expect(results).toEqual([]);
    expect(started).toBe(0);
  });
});
