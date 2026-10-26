import type { PretiumCashTransaction } from "@clc/api/features/pretium/client";

/** Wallet and phone ledgers overlap. IDs are scoped to each direction. */
export function mergeCashMovements(
  ...groups: PretiumCashTransaction[][]
): PretiumCashTransaction[] {
  const seen = new Set<string>();
  return groups.flat().filter((movement) => {
    const keys = [
      ...(movement.id === null ? [] : [`${movement.kind}:id:${movement.id}`]),
      ...(movement.reference ? [`${movement.kind}:ref:${movement.reference}`] : []),
    ];
    const duplicate = keys.some((key) => seen.has(key));
    for (const key of keys) seen.add(key);
    return !duplicate;
  });
}
