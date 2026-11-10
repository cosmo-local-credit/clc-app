import type { AccountActivityItem } from "@clc/api/features/accounts/client";
import { describe, expect, it } from "vite-plus/test";

import {
  advanceSeenMarker,
  countUnseenIncoming,
  isIncomingActivity,
  isUnseen,
  parseSeenMarker,
  type SeenMarker,
} from "./activity-unseen";

const ME = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";
const OTHER = "0x6E4c0f6A3eAb2d7e1C2b4c5B9c4a1E2d3F4a5B6c";
const POOL = "0x3fA1000000000000000000000000000000000c92";

const leg = {
  tokenAddress: POOL,
  tokenName: "KFP",
  tokenSymbol: "KFP",
  tokenDecimals: 6,
  amount: "1000000",
};

function direct(
  id: number,
  dateBlock: string,
  overrides: Partial<Exclude<AccountActivityItem, { kind: "swapped" }>> = {},
): AccountActivityItem {
  return {
    kind: "received",
    direction: "IN",
    id,
    txHash: `0x${id.toString(16).padStart(2, "0")}`,
    dateBlock,
    success: true,
    transfer: leg,
    senderAddress: OTHER,
    recipientAddress: ME,
    counterpartyAddress: OTHER,
    hasNote: false,
    ...overrides,
  };
}

function swap(id: number, dateBlock: string, initiatorAddress?: string): AccountActivityItem {
  return {
    kind: "swapped",
    id,
    txHash: `0x${id.toString(16).padStart(2, "0")}`,
    dateBlock,
    success: true,
    sent: leg,
    received: leg,
    poolAddresses: [POOL],
    ...(initiatorAddress ? { initiatorAddress } : {}),
  };
}

const T1 = "2026-11-09T10:00:00Z";
const T2 = "2026-11-09T10:00:05Z";
const T3 = "2026-11-09T10:00:10Z";

describe("isIncomingActivity", () => {
  it("counts what others did to the account", () => {
    expect(isIncomingActivity(direct(1, T1), ME)).toBe(true);
    expect(isIncomingActivity(direct(1, T1, { kind: "pool_payout" }), ME)).toBe(true);
    expect(isIncomingActivity(direct(1, T1, { kind: "deposited" }), ME)).toBe(true);
    expect(isIncomingActivity(swap(1, T1, OTHER), ME)).toBe(true);
  });

  it("leaves out what the account did itself", () => {
    expect(isIncomingActivity(direct(1, T1, { kind: "sent", direction: "OUT" }), ME)).toBe(false);
    expect(isIncomingActivity(direct(1, T1, { kind: "deposited", direction: "OUT" }), ME)).toBe(
      false,
    );
    expect(isIncomingActivity(swap(1, T1, ME), ME)).toBe(false);
    expect(isIncomingActivity(swap(1, T1), ME)).toBe(false);
  });

  it("leaves out mints, self-transfers and failed transfers", () => {
    expect(isIncomingActivity(direct(1, T1, { kind: "creation" }), ME)).toBe(false);
    expect(isIncomingActivity(direct(1, T1, { senderAddress: ME }), ME)).toBe(false);
    expect(isIncomingActivity(direct(1, T1, { success: false }), ME)).toBe(false);
  });

  it("falls back to the kind when the row carries no direction", () => {
    expect(isIncomingActivity(direct(1, T1, { direction: undefined }), ME)).toBe(true);
    expect(isIncomingActivity(direct(1, T1, { kind: "sent", direction: undefined }), ME)).toBe(
      false,
    );
  });
});

describe("isUnseen", () => {
  const marker: SeenMarker = { at: T2, keys: ["2:0x02"] };

  it("treats a later row as unseen and an earlier one as seen", () => {
    expect(isUnseen(direct(3, T3), marker)).toBe(true);
    expect(isUnseen(direct(1, T1), marker)).toBe(false);
  });

  it("keeps a late row from the same block unseen", () => {
    expect(isUnseen(direct(2, T2), marker)).toBe(false);
    expect(isUnseen(direct(4, T2), marker)).toBe(true);
  });

  it("compares instants, not strings", () => {
    expect(isUnseen(direct(2, "2026-11-09T13:00:05+03:00"), marker)).toBe(false);
  });
});

describe("countUnseenIncoming", () => {
  it("counts only incoming rows newer than the marker", () => {
    const items = [
      direct(5, T3),
      direct(4, T3, { kind: "sent", direction: "OUT" }),
      swap(3, T3, OTHER),
      direct(1, T1),
    ];
    expect(countUnseenIncoming(items, { at: T2, keys: [] }, ME)).toBe(2);
  });
});

describe("advanceSeenMarker", () => {
  it("seeds from the newest row, keeping every row in its block", () => {
    expect(advanceSeenMarker([direct(3, T2), direct(2, T2), direct(1, T1)], null)).toEqual({
      at: T2,
      keys: ["3:0x03", "2:0x02"],
    });
  });

  it("seeds an empty feed from the epoch, so the first arrival is new", () => {
    const seeded = advanceSeenMarker([], null);
    expect(seeded.at).toBe(new Date(0).toISOString());
    expect(isUnseen(direct(1, T1), seeded)).toBe(true);
  });

  it("never moves back", () => {
    const marker: SeenMarker = { at: T3, keys: ["9:0x09"] };
    expect(advanceSeenMarker([direct(1, T1)], marker)).toBe(marker);
  });

  it("returns the same marker when nothing is new", () => {
    const marker: SeenMarker = { at: T2, keys: ["2:0x02"] };
    expect(advanceSeenMarker([direct(2, T2), direct(1, T1)], marker)).toBe(marker);
  });

  it("adds a late row from the marker's block", () => {
    const marker: SeenMarker = { at: T2, keys: ["2:0x02"] };
    expect(advanceSeenMarker([direct(4, T2), direct(2, T2)], marker)).toEqual({
      at: T2,
      keys: ["2:0x02", "4:0x04"],
    });
  });

  it("moves to a newer block and drops the old block's keys", () => {
    const marker: SeenMarker = { at: T2, keys: ["2:0x02"] };
    expect(advanceSeenMarker([direct(5, T3), direct(2, T2)], marker)).toEqual({
      at: T3,
      keys: ["5:0x05"],
    });
  });
});

describe("parseSeenMarker", () => {
  it("reads a stored marker", () => {
    expect(parseSeenMarker(JSON.stringify({ at: T1, keys: [] }))).toEqual({ at: T1, keys: [] });
  });

  it("treats nothing, junk and the wrong shape as no marker", () => {
    expect(parseSeenMarker(null)).toBeNull();
    expect(parseSeenMarker("{not json")).toBeNull();
    expect(parseSeenMarker(JSON.stringify({ at: 1 }))).toBeNull();
  });
});
