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
  holdings: ApprovalCandidate[];
  deposited: ApprovalCandidate[];
  issued: ApprovalCandidate[];
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
 * Holdings first, then unapproved deposits already at the pool, then other
 * vouchers the steward issued. One address appears once: the same voucher is
 * often in more than one source, and a second row would approve the same token.
 * Registry members are removed before that priority pass so an approved token
 * can never be offered as a new approval.
 */
export function suggestApprovalVouchers(input: {
  holdings: readonly ApprovalCandidate[];
  deposited: readonly ApprovalCandidate[];
  issued: readonly ApprovalCandidate[];
  approvedAddresses: readonly string[];
}): ApprovalSuggestionGroups {
  const seen = new Set(input.approvedAddresses.map((address) => address.toLowerCase()));
  return {
    holdings: takeNew(input.holdings, seen),
    deposited: takeNew(input.deposited, seen),
    issued: takeNew(input.issued, seen),
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
