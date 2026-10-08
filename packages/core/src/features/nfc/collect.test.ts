import { describe, expect, it } from "vite-plus/test";

import {
  armCollectIntent,
  beginCollectUnlock,
  canArmCollectIntent,
  cancelCollectUnlock,
  claimCollectIntent,
  completeCollectUnlock,
  type CollectIntent,
  type CollectSession,
  disarmCollectIntent,
  finishCollectCustomer,
  INITIAL_COLLECT_SESSION,
  recordCollectRejected,
  recordCollectSubmitted,
  recordCollectUncertain,
  recordCollectUnknown,
  resolveCollectPayment,
} from "./collect";

const COLLECTOR = "0x1111111111111111111111111111111111111111";
const PAYER = "0x2222222222222222222222222222222222222222";
const OTHER_PAYER = "0x3333333333333333333333333333333333333333";

function intent(id: string, amountRaw = "500"): CollectIntent {
  return {
    id,
    collector: COLLECTOR,
    token: { address: "0x4444444444444444444444444444444444444444", symbol: "SRF", decimals: 6 },
    amountRaw,
    amountLabel: "0.0005",
  };
}

function armed(id = "a", source: "card" | "retained" = "card", base = INITIAL_COLLECT_SESSION) {
  const session = armCollectIntent(base, intent(id), source);
  if (!session) throw new Error("expected to arm");
  return session;
}

function claimed(
  session: CollectSession,
  payer: `0x${string}` = PAYER,
  source: "card" | "retained" = "card",
) {
  const claim = claimCollectIntent(session, payer, source);
  if (!claim.ok) throw new Error(`expected a claim, got ${claim.reason}`);
  return claim.session;
}

describe("arming", () => {
  it("arms only a positive amount", () => {
    expect(armCollectIntent(INITIAL_COLLECT_SESSION, intent("a", "0"), "card")).toBeNull();
    expect(armed().state).toMatchObject({ phase: "armed", source: "card" });
  });

  it("refuses to arm over a waiting or in-flight intent", () => {
    const session = armed();
    expect(armCollectIntent(session, intent("b"), "card")).toBeNull();
    const processing = claimed(session);
    expect(canArmCollectIntent(processing)).toBe(false);
    expect(canArmCollectIntent(recordCollectUncertain(processing, "a"))).toBe(false);
    expect(canArmCollectIntent(recordCollectSubmitted(processing, "a", "t1"))).toBe(true);
  });

  it("disarms back to editing when the page hides", () => {
    expect(disarmCollectIntent(armed()).state).toEqual({ phase: "idle" });
    const processing = claimed(armed());
    expect(disarmCollectIntent(processing)).toBe(processing);
  });
});

describe("claiming", () => {
  it("lets one event claim one armed intent", () => {
    const session = claimed(armed());
    expect(session.state).toMatchObject({ phase: "processing", payer: PAYER });
    // The duplicate event from the same tap finds nothing armed.
    expect(claimCollectIntent(session, PAYER, "card")).toEqual({ ok: false, reason: "not-armed" });
  });

  it("refuses the collector's own wallet and keeps the intent armed", () => {
    const session = armed();
    expect(claimCollectIntent(session, COLLECTOR.toUpperCase() as `0x${string}`, "card")).toEqual({
      ok: false,
      reason: "self-payment",
    });
    expect(claimCollectIntent(session, OTHER_PAYER, "card").ok).toBe(true);
  });

  it("latches the card that just paid against the next armed intent", () => {
    const paid = recordCollectSubmitted(claimed(armed()), "a", "t1");
    const settled = resolveCollectPayment(paid, "a");
    const next = armed("b", "card", finishCollectCustomer(settled));
    expect(claimCollectIntent(next, PAYER, "card")).toEqual({ ok: false, reason: "latched" });
    // A different card is unaffected.
    expect(claimCollectIntent(next, OTHER_PAYER, "card").ok).toBe(true);
  });

  it("releases the latch only through the retained-key collect-again", () => {
    const paid = resolveCollectPayment(recordCollectSubmitted(claimed(armed()), "a", "t1"), "a");
    const again = armed("b", "retained", paid);
    // A tap does not satisfy an intent armed for the retained key.
    expect(claimCollectIntent(again, OTHER_PAYER, "card")).toEqual({
      ok: false,
      reason: "wrong-source",
    });
    expect(claimCollectIntent(again, PAYER, "retained").ok).toBe(true);
  });

  it("allows one unresolved payment per payer", () => {
    const pending = recordCollectSubmitted(claimed(armed()), "a", "t1");
    const again = armed("b", "retained", pending);
    expect(claimCollectIntent(again, PAYER, "retained")).toEqual({
      ok: false,
      reason: "payer-unresolved",
    });
    const settled = resolveCollectPayment(again, "a");
    expect(claimCollectIntent(settled, PAYER, "retained").ok).toBe(true);
  });

  it("keeps an uncertain submission unresolved", () => {
    const checking = recordCollectUncertain(claimed(armed()), "a");
    expect(checking.state.phase).toBe("checking");
    expect(checking.unresolved[PAYER.toLowerCase()]).toBe("a");
    // Reconciling it to a tracking id keeps it unresolved until tracking ends.
    const submitted = recordCollectSubmitted(checking, "a", "t1");
    expect(submitted.state).toMatchObject({ phase: "submitted", trackingId: "t1" });
    expect(submitted.unresolved[PAYER.toLowerCase()]).toBe("a");
  });
});

describe("outcomes", () => {
  it("ignores results for an intent that is no longer current", () => {
    const session = armed("b", "card", recordCollectSubmitted(claimed(armed()), "a", "t1"));
    expect(recordCollectSubmitted(session, "a", "t2")).toBe(session);
    expect(recordCollectUncertain(session, "a")).toBe(session);
  });

  it("never returns an uncertain submission to signing", () => {
    const checking = recordCollectUncertain(claimed(armed()), "a");
    expect(recordCollectUncertain(checking, "a")).toBe(checking);
    expect(claimCollectIntent(checking, PAYER, "card")).toEqual({ ok: false, reason: "not-armed" });
  });

  it("frees the payer when nothing was deducted", () => {
    const rejected = recordCollectRejected(claimed(armed()), "a", "insufficient-balance");
    expect(rejected.state).toMatchObject({ phase: "rejected", reason: "insufficient-balance" });
    expect(rejected.unresolved).toEqual({});
    const reconciled = recordCollectRejected(
      recordCollectUncertain(claimed(armed()), "a"),
      "a",
      "relay-rejected",
    );
    expect(reconciled.unresolved).toEqual({});
  });

  it("does not let Done abandon a payment in flight", () => {
    const processing = claimed(armed());
    expect(finishCollectCustomer(processing)).toBe(processing);
    const checking = recordCollectUncertain(processing, "a");
    expect(finishCollectCustomer(checking)).toBe(checking);
  });
});

describe("encrypted cards", () => {
  function unlocking(base = INITIAL_COLLECT_SESSION) {
    const begun = beginCollectUnlock(armed("a", "card", base));
    if (!begun.ok) throw new Error("expected to begin unlock");
    return begun.session;
  }

  it("consumes the armed intent before the payer is known", () => {
    const session = unlocking();
    expect(session.state.phase).toBe("unlocking");
    expect(claimCollectIntent(session, PAYER, "card")).toEqual({ ok: false, reason: "not-armed" });
    expect(beginCollectUnlock(session)).toEqual({ ok: false, reason: "not-armed" });
  });

  it("claims for the unlocked payer, latching it", () => {
    const result = completeCollectUnlock(unlocking(), "a", PAYER);
    expect(result.ok).toBe(true);
    expect(result.session.state).toMatchObject({ phase: "processing", payer: PAYER });
    expect(result.session.latchedPayer).toBe(PAYER);
  });

  it("re-arms when the unlocked wallet is the collector's own", () => {
    const result = completeCollectUnlock(unlocking(), "a", COLLECTOR);
    expect(result).toMatchObject({ ok: false, reason: "self-payment" });
    expect(result.session.state).toMatchObject({ phase: "armed", source: "card" });
  });

  it("refuses a payer whose previous payment is unresolved", () => {
    const pending = recordCollectSubmitted(claimed(armed("p")), "p", "t1");
    expect(completeCollectUnlock(unlocking(pending), "a", PAYER)).toMatchObject({
      ok: false,
      reason: "payer-unresolved",
    });
  });

  it("records a cancelled unlock as nothing charged", () => {
    expect(cancelCollectUnlock(unlocking(), "a").state).toMatchObject({
      phase: "rejected",
      reason: "unlock-cancelled",
      payer: null,
    });
  });
});

describe("unknown outcomes", () => {
  it("frees the payer once checking gives up at the deadline", () => {
    const unknown = recordCollectUnknown(recordCollectUncertain(claimed(armed()), "a"), "a");
    expect(unknown.state).toMatchObject({ phase: "unknown", payer: PAYER });
    expect(unknown.unresolved).toEqual({});
    expect(canArmCollectIntent(unknown)).toBe(true);
  });

  it("resolves a background payment without touching the current intent", () => {
    const background = recordCollectUncertain(claimed(armed()), "a");
    const moved = { ...background, state: { phase: "idle" as const } };
    const resolved = recordCollectUnknown(moved, "a");
    expect(resolved.state).toEqual({ phase: "idle" });
    expect(resolved.unresolved).toEqual({});
  });
});
