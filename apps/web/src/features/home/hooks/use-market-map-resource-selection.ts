import { useCallback, useEffect, useMemo, useState } from "react";

import { readOwnerScoped, writeOwnerScoped } from "#/lib/storage/owner-scoped-storage";

const STORAGE_NAME = "market-map-resources.v1";

export const MARKET_MAP_RESOURCE_KINDS = ["voucher", "want", "pool", "catalog", "post"] as const;

export type MarketMapResourceKind = (typeof MARKET_MAP_RESOURCE_KINDS)[number];

export const DEFAULT_MARKET_MAP_RESOURCES: readonly MarketMapResourceKind[] = ["voucher", "want"];

export function normalizeMarketMapResources(value: unknown): MarketMapResourceKind[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every(isMarketMapResourceKind)) return null;
  const selected = new Set(value);
  return MARKET_MAP_RESOURCE_KINDS.filter((kind) => selected.has(kind));
}

function isMarketMapResourceKind(value: unknown): value is MarketMapResourceKind {
  return (
    typeof value === "string" && (MARKET_MAP_RESOURCE_KINDS as readonly string[]).includes(value)
  );
}

function readSelection(owner: string): MarketMapResourceKind[] {
  const raw = readOwnerScoped(owner, STORAGE_NAME);
  if (!raw) return [...DEFAULT_MARKET_MAP_RESOURCES];
  try {
    return normalizeMarketMapResources(JSON.parse(raw)) ?? [...DEFAULT_MARKET_MAP_RESOURCES];
  } catch {
    return [...DEFAULT_MARKET_MAP_RESOURCES];
  }
}

export function useMarketMapResourceSelection(owner: string) {
  const [snapshot, setSnapshot] = useState<{ owner: string; selected: MarketMapResourceKind[] }>(
    () => ({ owner, selected: readSelection(owner) }),
  );

  useEffect(() => {
    if (snapshot.owner === owner) return;
    setSnapshot({ owner, selected: readSelection(owner) });
  }, [owner, snapshot.owner]);

  const selected = snapshot.owner === owner ? snapshot.selected : readSelection(owner);
  const save = useCallback(
    (next: readonly MarketMapResourceKind[]) => {
      const canonical = normalizeMarketMapResources(next) ?? [...DEFAULT_MARKET_MAP_RESOURCES];
      writeOwnerScoped(owner, STORAGE_NAME, JSON.stringify(canonical));
      setSnapshot({ owner, selected: canonical });
    },
    [owner],
  );

  const toggle = useCallback(
    (kind: MarketMapResourceKind) => {
      save(
        selected.includes(kind) ? selected.filter((value) => value !== kind) : [...selected, kind],
      );
    },
    [save, selected],
  );

  const allSelected = selected.length === MARKET_MAP_RESOURCE_KINDS.length;
  const toggleAll = useCallback(() => {
    save(allSelected ? ["voucher"] : MARKET_MAP_RESOURCE_KINDS);
  }, [allSelected, save]);

  return useMemo(
    () => ({ selected, toggle, toggleAll, allSelected }),
    [allSelected, selected, toggle, toggleAll],
  );
}
