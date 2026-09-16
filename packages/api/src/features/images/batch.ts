/**
 * Bounded, order-preserving fan-out for a post's images.
 *
 * A report accepts up to 50 image rows, which is not a reason to open 50
 * simultaneous uploads from a phone. The service normalizes at most four images
 * at once process-wide, so three from one browser leaves room for other callers
 * while still overlapping the transfers.
 *
 * Results come back in input order however the requests finish, and failures are
 * returned rather than thrown: a partly uploaded selection must keep its
 * successes so a retry re-sends only what failed. Reading batch progress off the
 * last mutation observer would not do — Query allows consecutive mutations to
 * settle out of order.
 */

export const IMAGE_UPLOAD_CONCURRENCY = 3;

export type BatchResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

export async function uploadInOrder<TItem, TResult>(
  items: readonly TItem[],
  upload: (item: TItem, index: number) => Promise<TResult>,
  concurrency: number = IMAGE_UPLOAD_CONCURRENCY,
): Promise<Array<BatchResult<TResult>>> {
  // Every slot starts rejected and is replaced by the worker that claims it, so a
  // slot no worker reached can never be read as a success.
  const results: Array<BatchResult<TResult>> = Array.from({ length: items.length }, () => ({
    status: "rejected",
    reason: new Error("upload did not run"),
  }));
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      if (item === undefined) continue;
      try {
        results[index] = { status: "fulfilled", value: await upload(item, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker),
  );
  return results;
}
