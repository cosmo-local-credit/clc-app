import type { AccountActivityItem } from "@clc/api/features/accounts/client";
import { z } from "zod";

/**
 * What the person has already seen of their activity feed, as one high-water
 * mark: the newest `dateBlock` they were shown, plus the rows that share exactly
 * that timestamp. Rows in one block share a timestamp and the indexer can deliver
 * them apart, so the keys keep a late sibling from passing as seen.
 */
const seenMarkerSchema = z.object({
  at: z.string(),
  keys: z.array(z.string()),
});

export type SeenMarker = z.infer<typeof seenMarkerSchema>;

/** Where an account with no activity starts: anything that arrives is new. */
const EMPTY_FEED_MARKER: SeenMarker = { at: new Date(0).toISOString(), keys: [] };

function seenKey(item: AccountActivityItem): string {
  return `${item.id}:${item.txHash}`;
}

function timeOf(value: string): number {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

export function parseSeenMarker(raw: string | null): SeenMarker | null {
  if (raw === null) return null;
  try {
    const parsed = seenMarkerSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Whether a row is something that happened *to* `me`, rather than something
 * `me` did. Only these count as unread.
 *
 * A swap appears in an account's feed when the account started it or is the
 * pool, so it counts only when someone else started it. A mint is left out
 * because the feed cannot say who minted, and it is usually the issuer's own.
 */
export function isIncomingActivity(item: AccountActivityItem, me: string): boolean {
  if (!item.success) return false;
  if (item.kind === "swapped") {
    return item.initiatorAddress !== undefined && item.initiatorAddress !== me;
  }
  if (item.kind === "creation" || item.senderAddress === item.recipientAddress) return false;
  return item.direction
    ? item.direction === "IN"
    : item.kind === "received" || item.kind === "pool_payout";
}

export function isUnseen(item: AccountActivityItem, marker: SeenMarker): boolean {
  const at = timeOf(item.dateBlock);
  const seen = timeOf(marker.at);
  return at > seen || (at === seen && !marker.keys.includes(seenKey(item)));
}

export function countUnseenIncoming(
  items: readonly AccountActivityItem[],
  marker: SeenMarker,
  me: string,
): number {
  return items.filter((item) => isIncomingActivity(item, me) && isUnseen(item, marker)).length;
}

/**
 * The marker once `items` have been seen. It only moves forward, and it returns
 * `marker` itself when nothing in `items` is newer, so a caller can skip the
 * write. With no marker it seeds one from `items`, or from the epoch for an
 * empty feed.
 */
export function advanceSeenMarker(
  items: readonly AccountActivityItem[],
  marker: SeenMarker | null,
): SeenMarker {
  const base = marker ?? EMPTY_FEED_MARKER;
  const seen = timeOf(base.at);
  let newest: AccountActivityItem | undefined;
  for (const item of items) {
    if (!newest || timeOf(item.dateBlock) > timeOf(newest.dateBlock)) newest = item;
  }
  if (!newest || timeOf(newest.dateBlock) < seen) return marker ?? base;

  const top = timeOf(newest.dateBlock);
  const atTop = items.filter((item) => timeOf(item.dateBlock) === top).map(seenKey);
  if (top > seen) return { at: newest.dateBlock, keys: [...new Set(atTop)] };

  const added = atTop.filter((key) => !base.keys.includes(key));
  if (added.length === 0) return marker ?? base;
  return { at: base.at, keys: [...base.keys, ...new Set(added)] };
}
