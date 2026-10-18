export type PartitionedTokens<T> = {
  holdings: T[];
  issued: T[];
};

/**
 * Split an account's vouchers into the ones it issued and everything else.
 *
 * `issued` is the account's own list from the catalog, not a subset of its
 * balances: a voucher whose opening supply was never created, or whose issuer
 * handed out every unit, has no balance and is still theirs to manage. Holdings
 * are the balances minus that set, in the balance list's order.
 */
export function partitionTokensByIssuer<T extends { id: string; catalogActive?: boolean }>(
  balances: readonly T[],
  issued: readonly T[],
): PartitionedTokens<T> {
  // Retirement hides the catalog voucher, but does not erase its chain balance.
  const visible = (token: T) => token.catalogActive !== false;
  const issuedIds = new Set(issued.map((token) => token.id.toLowerCase()));
  return {
    holdings: balances.filter((token) => visible(token) && !issuedIds.has(token.id.toLowerCase())),
    issued: issued.filter(visible),
  };
}
