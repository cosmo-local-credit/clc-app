/**
 * Coordinates wallet-switching against sign-out.
 *
 * Wallet imports arrive via a `?w=` URL. On an already-connected session the
 * imported key is queued as a `pendingKey` and the user confirms a switch,
 * which runs `connect()` against the private-key connector. Sign-out runs
 * `disconnect()` and clears the auth token.
 *
 * If the switch's `connect()` resolves *after* sign-out's `disconnect()`, the
 * imported wallet silently takes over the session — "sign-out is hijacked" and
 * a second sign-out is required.
 *
 * `beginWalletSwitch` hands a switch an AbortSignal; `abortWalletSwitch`
 * (called by sign-out) aborts any in-flight switch so it can roll back its own
 * connect. The pair makes sign-out authoritative regardless of which async
 * resolves last.
 */

let switchController: AbortController | null = null;

/** Begins a pending wallet switch, aborting any prior switch. */
export function beginWalletSwitch(): AbortSignal {
  switchController?.abort();
  switchController = new AbortController();
  return switchController.signal;
}

/** Aborts any in-flight wallet switch. Called by sign-out. */
export function abortWalletSwitch(): void {
  switchController?.abort();
  switchController = null;
}
