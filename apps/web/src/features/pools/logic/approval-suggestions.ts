/**
 * A voucher the approve sheet can hand to the rate form.
 *
 * Narrower than a catalog row: a holding comes from the account balance list,
 * and a pool member comes from the pool's own rows. Both have a name, a symbol
 * and an address, which is all the form reads before it fetches decimals.
 */
export type ApprovalCandidate = {
  id: string;
  address: `0x${string}`;
  name: string;
  symbol: string;
};

export type ApprovalSuggestionGroups = {
  issued: ApprovalCandidate[];
  holdings: ApprovalCandidate[];
  inPool: ApprovalCandidate[];
};

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Drops a row the form could not address, and fills a blank name from the symbol. */
export function toApprovalCandidate(input: {
  id: string;
  address: string;
  name: string;
  symbol: string;
}): ApprovalCandidate | null {
  if (!HEX_ADDRESS.test(input.address)) return null;
  const symbol = input.symbol.trim();
  if (symbol === "") return null;
  const name = input.name.trim();
  return {
    id: input.id,
    address: input.address as `0x${string}`,
    name: name === "" ? symbol : name,
    symbol,
  };
}

/**
 * The vouchers worth offering before a search, in the order a steward scans.
 *
 * Issued first, then other vouchers they hold, then members of this pool that
 * are neither. One address appears once: the same voucher is often all three,
 * and a second row would approve the same token.
 */
export function suggestApprovalVouchers(input: {
  issued: readonly ApprovalCandidate[];
  holdings: readonly ApprovalCandidate[];
  inPool: readonly ApprovalCandidate[];
}): ApprovalSuggestionGroups {
  const seen = new Set<string>();
  return {
    issued: takeNew(input.issued, seen),
    holdings: takeNew(input.holdings, seen),
    inPool: takeNew(input.inPool, seen),
  };
}

function takeNew(rows: readonly ApprovalCandidate[], seen: Set<string>): ApprovalCandidate[] {
  const out: ApprovalCandidate[] = [];
  for (const row of rows) {
    const key = row.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
