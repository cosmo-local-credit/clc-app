import { BackendApiError } from "@clc/api/client/errors";

/**
 * What the catalog says about who issued one balance.
 *
 * `missing` is a catalog 404: the token is not a voucher this network lists,
 * so it cannot be one the viewer issued. `failed` is any other read error,
 * and the row stays out of both lists rather than being filed as a holding.
 */
export type CatalogOwner =
  | { state: "pending" }
  | { state: "missing" }
  | { state: "failed" }
  | { state: "known"; ownerAddress: string | null };

export type PartitionedTokens<T> = {
  holdings: T[];
  issued: T[];
  pending: boolean;
  failed: boolean;
};

type DetailQuery = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data?: { ownerAddress: string | null } | undefined;
};

export function catalogOwnerFromDetail(query: DetailQuery): CatalogOwner {
  if (query.isPending) return { state: "pending" };
  if (query.isError) {
    return query.error instanceof BackendApiError && query.error.kind === "not-found"
      ? { state: "missing" }
      : { state: "failed" };
  }
  return { state: "known", ownerAddress: query.data?.ownerAddress ?? null };
}

/**
 * Split a balance list into vouchers the viewer issued and everything else.
 *
 * Order inside each group is the balance list's order. A row whose owner is
 * still loading or failed is in neither group: showing it under Holdings
 * would call the viewer's own voucher someone else's for as long as the
 * catalog read takes.
 */
export function partitionTokensByIssuer<T extends { id: string }>(
  tokens: readonly T[],
  owners: ReadonlyMap<string, CatalogOwner>,
  viewer: string | undefined,
): PartitionedTokens<T> {
  const holdings: T[] = [];
  const issued: T[] = [];
  let pending = false;
  let failed = false;
  const viewerKey = viewer?.toLowerCase();

  for (const token of tokens) {
    const owner = owners.get(token.id.toLowerCase());
    if (!owner || owner.state === "pending") {
      pending = true;
      continue;
    }
    if (owner.state === "failed") {
      failed = true;
      continue;
    }
    const issuedByViewer =
      owner.state === "known" &&
      viewerKey !== undefined &&
      owner.ownerAddress?.toLowerCase() === viewerKey;
    if (issuedByViewer) issued.push(token);
    else holdings.push(token);
  }

  return { holdings, issued, pending, failed };
}
