import { catalogIdSchema } from "@clc/core/features/catalogs/logic";
import { isAddress } from "viem";

export type CatalogMemberCandidate = {
  id: string;
  chainId: number;
  address: `0x${string}`;
  name: string;
  symbol: string;
  imageUrl: string | null;
};

export type CatalogMemberIdentity = {
  id: string;
  address: string;
};

/** Drop a malformed API row before it can become a membership write. */
export function toCatalogMemberCandidate(input: {
  id: string | number;
  chainId: number | null | undefined;
  address: string;
  name: string;
  symbol: string;
  imageUrl: string | null | undefined;
}): CatalogMemberCandidate | null {
  const id = catalogIdSchema.safeParse(input.id);
  if (
    !id.success ||
    !Number.isInteger(input.chainId) ||
    (input.chainId ?? 0) <= 0 ||
    !isAddress(input.address, { strict: false })
  ) {
    return null;
  }

  const symbol = input.symbol.trim();
  const name = input.name.trim();
  if (symbol === "" || name === "") return null;

  return {
    id: id.data,
    chainId: input.chainId as number,
    address: input.address as `0x${string}`,
    name,
    symbol,
    imageUrl: input.imageUrl ?? null,
  };
}

/**
 * Existing members are removed before the priority pass. A resource that
 * occurs in two suggestion sources stays only in the first source.
 */
export function prioritizeCatalogMemberCandidates(
  groups: readonly (readonly CatalogMemberCandidate[])[],
  members: readonly CatalogMemberIdentity[],
): CatalogMemberCandidate[][] {
  const ids = new Set(members.map((member) => member.id));
  const addresses = new Set(members.map((member) => member.address.toLowerCase()));

  return groups.map((group) => {
    const rows: CatalogMemberCandidate[] = [];
    for (const candidate of group) {
      const address = candidate.address.toLowerCase();
      if (ids.has(candidate.id) || addresses.has(address)) continue;
      ids.add(candidate.id);
      addresses.add(address);
      rows.push(candidate);
    }
    return rows;
  });
}

export function excludeCatalogMembers(
  candidates: readonly CatalogMemberCandidate[],
  members: readonly CatalogMemberIdentity[],
): CatalogMemberCandidate[] {
  return prioritizeCatalogMemberCandidates([candidates], members)[0] ?? [];
}
