/**
 * Collecting a payment from a bearer card: the collector stays signed in to
 * their own wallet, and the card's key is a transient signer for payments the
 * collector explicitly arms.
 *
 * Three rules keep a held card, a repeated tag event or a lost response from
 * becoming a second deduction, and every transition below enforces one of
 * them:
 *
 * 1. One card event claims one armed intent. Arming is a deliberate collector
 *    action with the amount on screen; nothing else arms.
 * 2. One payment per payer is unresolved at a time. A payer with a submission
 *    still pending or uncertain cannot be claimed again.
 * 3. A submitted intent is never signed again. An uncertain submission is
 *    reconciled by resending the same signed request, never by a new one.
 *
 * Because the payer's key is retained for the session, the card's physical
 * absence is not a guard. The same-wallet latch is: the last payer's card
 * cannot claim a fresh intent by being tapped (or left on the reader) — only
 * the collector's explicit "collect again from this card" can.
 */

export type CollectToken = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
};

/** What the collector froze on screen. Immutable once armed. */
export type CollectIntent = {
  /** Unique per intent. Also the relay operation id, so one intent is one signed request. */
  id: string;
  collector: `0x${string}`;
  token: CollectToken;
  /** Base units; positive. */
  amountRaw: string;
  /** The amount exactly as displayed when armed. */
  amountLabel: string;
};

/** How an armed intent expects to be paid: by a tapped card, or by the retained key. */
export type CollectSource = "card" | "retained";

export type CollectRejection =
  | "self-payment"
  | "insufficient-balance"
  | "unlock-cancelled"
  | "relay-rejected"
  | "chain-mismatch"
  | "failed";

export type CollectState =
  | { phase: "idle" }
  | { phase: "armed"; intent: CollectIntent; source: CollectSource }
  | { phase: "processing"; intent: CollectIntent; payer: `0x${string}` }
  /** The relay accepted the request and returned a tracking id. Not yet confirmed. */
  | { phase: "submitted"; intent: CollectIntent; payer: `0x${string}`; trackingId: string }
  /** The request may have reached the relay; its answer was lost. */
  | { phase: "checking"; intent: CollectIntent; payer: `0x${string}` }
  /** Ended before anything was submitted: nothing was deducted. */
  | {
      phase: "rejected";
      intent: CollectIntent;
      payer: `0x${string}` | null;
      reason: CollectRejection;
      detail?: string;
    };

export type CollectSession = {
  state: CollectState;
  /** The payer whose card most recently claimed an intent. */
  latchedPayer: `0x${string}` | null;
  /** Lower-cased payer address → the intent id still unresolved for it. */
  unresolved: Readonly<Record<string, string>>;
};

export const INITIAL_COLLECT_SESSION: CollectSession = {
  state: { phase: "idle" },
  latchedPayer: null,
  unresolved: {},
};

function samePayer(a: `0x${string}` | null, b: `0x${string}`): boolean {
  return a !== null && a.toLowerCase() === b.toLowerCase();
}

/** An intent can be armed only while no other is waiting or in flight. */
export function canArmCollectIntent(session: CollectSession): boolean {
  const { phase } = session.state;
  return phase === "idle" || phase === "submitted" || phase === "rejected";
}

/** A payer whose previous payment from this session is still pending or uncertain. */
export function isPayerUnresolved(session: CollectSession, payer: `0x${string}`): boolean {
  return payer.toLowerCase() in session.unresolved;
}

export function armCollectIntent(
  session: CollectSession,
  intent: CollectIntent,
  source: CollectSource,
): CollectSession | null {
  if (!canArmCollectIntent(session)) return null;
  if (BigInt(intent.amountRaw) <= 0n) return null;
  return { ...session, state: { phase: "armed", intent, source } };
}

/** Page hidden, route left, or the collector changed their mind: back to editing. */
export function disarmCollectIntent(session: CollectSession): CollectSession {
  if (session.state.phase !== "armed") return session;
  return { ...session, state: { phase: "idle" } };
}

export type CollectClaim =
  | { ok: true; session: CollectSession; intent: CollectIntent }
  | {
      ok: false;
      /**
       * - `not-armed`: no intent is waiting; the event is dropped.
       * - `wrong-source`: the intent waits for the retained key, not a tap.
       * - `latched`: the card that just paid; only an explicit action charges it again.
       * - `payer-unresolved`: this payer's previous payment is not settled yet.
       * - `self-payment`: the collector's own wallet; the intent stays armed.
       */
      reason: "not-armed" | "wrong-source" | "latched" | "payer-unresolved" | "self-payment";
    };

/**
 * Consumes the armed intent for `payer`. Synchronous and pure, so a store that
 * applies it in one `set` is the latch duplicate tag events need: the second
 * event finds the intent already claimed.
 */
export function claimCollectIntent(
  session: CollectSession,
  payer: `0x${string}`,
  source: CollectSource,
): CollectClaim {
  const { state } = session;
  if (state.phase !== "armed") return { ok: false, reason: "not-armed" };
  if (state.source !== source) return { ok: false, reason: "wrong-source" };
  if (source === "card" && samePayer(session.latchedPayer, payer)) {
    return { ok: false, reason: "latched" };
  }
  if (isPayerUnresolved(session, payer)) return { ok: false, reason: "payer-unresolved" };
  if (samePayer(state.intent.collector, payer)) return { ok: false, reason: "self-payment" };
  return {
    ok: true,
    intent: state.intent,
    session: {
      ...session,
      latchedPayer: payer,
      state: { phase: "processing", intent: state.intent, payer },
    },
  };
}

function isCurrent(session: CollectSession, intentId: string): boolean {
  const { state } = session;
  return state.phase !== "idle" && state.intent.id === intentId;
}

function withUnresolved(
  session: CollectSession,
  payer: `0x${string}`,
  intentId: string,
): CollectSession["unresolved"] {
  return { ...session.unresolved, [payer.toLowerCase()]: intentId };
}

/** The relay returned a tracking id. The payment is accepted, not confirmed. */
export function recordCollectSubmitted(
  session: CollectSession,
  intentId: string,
  trackingId: string,
): CollectSession {
  const { state } = session;
  if (!isCurrent(session, intentId)) return session;
  if (state.phase !== "processing" && state.phase !== "checking") return session;
  return {
    ...session,
    unresolved: withUnresolved(session, state.payer, intentId),
    state: { phase: "submitted", intent: state.intent, payer: state.payer, trackingId },
  };
}

/**
 * The request may have reached the relay but its answer did not come back.
 * From here the only way forward is resending the same signed request.
 */
export function recordCollectUncertain(session: CollectSession, intentId: string): CollectSession {
  const { state } = session;
  if (!isCurrent(session, intentId) || state.phase !== "processing") return session;
  return {
    ...session,
    unresolved: withUnresolved(session, state.payer, intentId),
    state: { phase: "checking", intent: state.intent, payer: state.payer },
  };
}

/**
 * Nothing was or will be deducted: the payment failed before submission, or
 * reconciling an uncertain one found the relay never accepted it. Frees the
 * payer again.
 */
export function recordCollectRejected(
  session: CollectSession,
  intentId: string,
  reason: CollectRejection,
  detail?: string,
): CollectSession {
  const { state } = session;
  if (!isCurrent(session, intentId)) return session;
  if (state.phase !== "processing" && state.phase !== "checking") return session;
  return {
    ...resolveCollectPayment(session, intentId),
    state: { phase: "rejected", intent: state.intent, payer: state.payer, reason, detail },
  };
}

/**
 * The tracked payment reached a final outcome, or an uncertain one was given
 * up after its deadline. Frees the payer for another payment; the visible state
 * is left alone, since the collector may already be on the next intent.
 */
export function resolveCollectPayment(session: CollectSession, intentId: string): CollectSession {
  const entry = Object.entries(session.unresolved).find(([, id]) => id === intentId);
  if (!entry) return session;
  const { [entry[0]]: _resolved, ...unresolved } = session.unresolved;
  return { ...session, unresolved };
}

/** "Done with this customer": back to editing. The latch outlives it on purpose. */
export function finishCollectCustomer(session: CollectSession): CollectSession {
  const { phase } = session.state;
  if (phase === "processing" || phase === "checking") return session;
  return { ...session, state: { phase: "idle" } };
}
