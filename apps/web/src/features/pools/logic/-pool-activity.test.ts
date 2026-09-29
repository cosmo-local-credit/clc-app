import { describe, expect, it } from "vite-plus/test";

import { type PoolTransfer, buildPoolActivity } from "./pool-activity";

const TRADER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const PROTOCOL = "0x3333333333333333333333333333333333333333";
const POOL = "0xdD97a5282D11e55d7271d466C80963d6793B276f";
const KAW = "0xAAA0000000000000000000000000000000000001";
const SAR = "0xBbB0000000000000000000000000000000000002";
const ZERO = "0x0000000000000000000000000000000000000000";

let nextId = 1;

/**
 * One row as `/api/v2/accounts/<pool>/transfers` returns it: `direction` and
 * `counterpartyAddress` are already relative to the pool.
 */
function transfer(overrides: Partial<PoolTransfer> = {}): PoolTransfer {
  const direction = overrides.direction ?? "IN";
  const counterparty = overrides.counterpartyAddress ?? TRADER;
  return {
    id: nextId++,
    txHash: "0xtx1",
    dateBlock: "2026-09-01T10:00:00Z",
    direction,
    counterpartyAddress: counterparty,
    senderAddress: direction === "IN" ? counterparty : POOL,
    recipientAddress: direction === "IN" ? POOL : counterparty,
    tokenAddress: KAW,
    tokenSymbol: "KAW",
    tokenName: "Kawangware",
    tokenDecimals: 6,
    amount: "1000000",
    success: true,
    hasNote: false,
    ...overrides,
  };
}

/** The two ERC-20 legs `SwapPool._swap` leaves behind, seen from the pool. */
function swapLegs(overrides: { txHash?: string; counterparty?: string } = {}) {
  const txHash = overrides.txHash ?? "0xtx1";
  const counterparty = overrides.counterparty ?? TRADER;
  return [
    transfer({ txHash, direction: "IN", counterpartyAddress: counterparty, amount: "5000000" }),
    transfer({
      txHash,
      direction: "OUT",
      counterpartyAddress: counterparty,
      tokenAddress: SAR,
      tokenSymbol: "SAR",
      tokenName: "Sarafu",
      amount: "4500000",
    }),
  ];
}

describe("buildPoolActivity", () => {
  it("folds a swap's two legs back into the one event they were", () => {
    // clc-core exposes swaps to non-superadmins only as raw ERC-20 legs, so a
    // list that did not reassemble them would claim the pool received and sent
    // unrelated things.
    const entries = buildPoolActivity(swapLegs());

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "swap",
      counterpartyAddress: TRADER,
      received: { tokenSymbol: "KAW", amount: "5000000" },
      sent: { tokenSymbol: "SAR", amount: "4500000" },
      protocolFee: null,
    });
  });

  it("pairs legs whichever order the indexer inserted them in", () => {
    // Twenty concurrent workers write these rows, and the response carries no
    // log index, so the only ordering is insertion sequence.
    const [received, sent] = swapLegs();
    const forwards = buildPoolActivity([received as PoolTransfer, sent as PoolTransfer]);
    const backwards = buildPoolActivity([sent as PoolTransfer, received as PoolTransfer]);

    expect(forwards[0]).toMatchObject({ kind: "swap", received: { tokenSymbol: "KAW" } });
    expect(backwards[0]).toMatchObject({ kind: "swap", received: { tokenSymbol: "KAW" } });
  });

  it("attaches the protocol fee rather than leaving it as a stray payout", () => {
    // `_swap` pays the protocol its cut in the out token, to an address that is
    // not the trader; nothing else produces a second outbound leg of that token.
    const entries = buildPoolActivity([
      ...swapLegs(),
      transfer({
        direction: "OUT",
        counterpartyAddress: PROTOCOL,
        tokenAddress: SAR,
        tokenSymbol: "SAR",
        amount: "50000",
      }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "swap",
      protocolFee: { tokenSymbol: "SAR", amount: "50000" },
    });
  });

  it("does not invent a trade between two people who share a transaction", () => {
    // A relayed batch carries unrelated transfers through one hash. Pairing on
    // the hash alone would report them as a swap.
    const entries = buildPoolActivity([
      transfer({ direction: "IN", counterpartyAddress: TRADER }),
      transfer({
        direction: "OUT",
        counterpartyAddress: OTHER,
        tokenAddress: SAR,
        tokenSymbol: "SAR",
      }),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.kind)).toEqual(["transfer", "transfer"]);
  });

  it("keeps legs in different transactions apart", () => {
    const entries = buildPoolActivity([
      transfer({ txHash: "0xtxA", direction: "IN" }),
      transfer({ txHash: "0xtxB", direction: "OUT", tokenAddress: SAR, tokenSymbol: "SAR" }),
    ]);

    expect(entries).toHaveLength(2);
  });

  it("treats a voucher sent back out as itself as a correction, not a trade", () => {
    const entries = buildPoolActivity([
      transfer({ direction: "IN", counterpartyAddress: TRADER }),
      transfer({ direction: "OUT", counterpartyAddress: TRADER }),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.kind === "transfer")).toBe(true);
  });

  it("pairs each swap separately when one transaction carries two", () => {
    const entries = buildPoolActivity([
      ...swapLegs({ counterparty: TRADER }),
      ...swapLegs({ counterparty: OTHER }),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.kind)).toEqual(["swap", "swap"]);
  });

  it("names an issuance rather than crediting the zero address", () => {
    // `token_transfer` carries no zero-address exclusion, so a mint arrives as
    // an ordinary IN from 0x0.
    const entries = buildPoolActivity([
      transfer({ direction: "IN", counterpartyAddress: ZERO, amount: "9000000" }),
    ]);

    expect(entries[0]).toMatchObject({ kind: "mint", leg: { amount: "9000000" } });
  });

  it("reports one-sided movements as the transfers they are", () => {
    // A deposit, a fee sweep and a liquidity withdrawal are genuinely one-sided,
    // and the last two emit nothing the indexer records.
    const entries = buildPoolActivity([
      transfer({ txHash: "0xtxA", direction: "IN" }),
      transfer({ txHash: "0xtxB", direction: "OUT" }),
    ]);

    expect(entries).toMatchObject([
      { kind: "transfer", direction: "IN" },
      { kind: "transfer", direction: "OUT" },
    ]);
  });

  it("fails a swap whose legs did not both succeed", () => {
    const [received, sent] = swapLegs();
    const entries = buildPoolActivity([
      received as PoolTransfer,
      { ...(sent as PoolTransfer), success: false },
    ]);

    expect(entries[0]).toMatchObject({ kind: "swap", success: false });
  });

  it("keeps a merged swap in the position of its first leg", () => {
    // Order must survive so paging stays stable as later pages append.
    const entries = buildPoolActivity([
      transfer({ txHash: "0xtxA", direction: "IN", amount: "1" }),
      ...swapLegs({ txHash: "0xtxB" }),
      transfer({ txHash: "0xtxC", direction: "OUT", amount: "3" }),
    ]);

    expect(entries.map((entry) => entry.kind)).toEqual(["transfer", "swap", "transfer"]);
  });

  it("drops nothing it cannot explain", () => {
    const rows = [
      ...swapLegs({ txHash: "0xtxA" }),
      transfer({ txHash: "0xtxB", direction: "IN", counterpartyAddress: ZERO }),
      transfer({ txHash: "0xtxC", direction: "OUT", counterpartyAddress: OTHER }),
    ];

    const entries = buildPoolActivity(rows);
    const accounted = entries.reduce(
      (total, entry) => total + (entry.kind === "swap" ? (entry.protocolFee ? 3 : 2) : 1),
      0,
    );
    expect(accounted).toBe(rows.length);
  });
});
