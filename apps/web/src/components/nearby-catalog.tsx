import {
  canonicalMarketBounds,
  marketBoundsKey,
  type MarketBoundingBox,
  type NearbyRequest,
} from "@clc/core/features/catalog/nearby";
import { Trans } from "@lingui/react/macro";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { removeStorageItem } from "#/lib/storage/local-storage";
import {
  readOwnerScoped,
  removeOwnerScoped,
  writeOwnerScoped,
} from "#/lib/storage/owner-scoped-storage";

const MARKET_AREA_STORAGE_NAME = "market-discovery-area.v1";
const OBSOLETE_VISIBILITY_KEY = "clc.catalog-visibility.v1";

export type MarketDiscoveryArea = {
  owner: string;
  center: { lat: number; lng: number };
  zoom: number;
  boxes: readonly MarketBoundingBox[];
};

type MarketDiscoveryAreaValue = {
  area: MarketDiscoveryArea | null;
  setArea: (area: Omit<MarketDiscoveryArea, "owner">) => void;
  clearArea: () => void;
};

const NearbyCatalogContext = createContext<NearbyRequest | undefined>(undefined);
const MarketDiscoveryAreaContext = createContext<MarketDiscoveryAreaValue | null>(null);

export function useNearbyCatalog() {
  return useContext(NearbyCatalogContext);
}

export function useMarketDiscoveryArea() {
  const value = useContext(MarketDiscoveryAreaContext);
  if (!value) throw new Error("NearbyCatalog is required");
  return value;
}

export function nearbyQueryKey<T extends readonly unknown[]>(
  key: T,
  scope: NearbyRequest | undefined,
) {
  return scope?.scope ? ([...key, scope.scope] as const) : key;
}

export function nearbyQueryPolicy(scope: NearbyRequest | undefined) {
  return scope
    ? {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnMount: true,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      }
    : {};
}

export function clearMarketDiscoveryArea(owner: string): void {
  removeOwnerScoped(owner.toLowerCase(), MARKET_AREA_STORAGE_NAME);
}

export function NearbyCatalog({ children }: { children: ReactNode }) {
  const owner = useStorageOwner();
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    area: MarketDiscoveryArea | null;
  } | null>(null);

  useEffect(() => {
    // A radius cannot be faithfully migrated into a rectangular map view.
    removeStorageItem(OBSOLETE_VISIBILITY_KEY);
    if (!owner) return;
    setSnapshot({ owner, area: readMarketArea(owner) });
  }, [owner]);

  const setArea = useCallback(
    (next: Omit<MarketDiscoveryArea, "owner">) => {
      if (!owner) return;
      const area = normalizeMarketArea({ ...next, owner });
      if (!area) return;
      setSnapshot((current) => {
        if (current?.owner === owner && equalMarketAreas(current.area, area)) return current;
        writeOwnerScoped(owner, MARKET_AREA_STORAGE_NAME, JSON.stringify(area));
        return { owner, area };
      });
    },
    [owner],
  );

  const clearArea = useCallback(() => {
    if (!owner) return;
    removeOwnerScoped(owner, MARKET_AREA_STORAGE_NAME);
    setSnapshot((current) =>
      current?.owner === owner && current.area !== null ? { owner, area: null } : current,
    );
  }, [owner]);

  const areaValue = useMemo(
    () => ({
      area: snapshot && snapshot.owner === owner ? snapshot.area : null,
      setArea,
      clearArea,
    }),
    [clearArea, owner, setArea, snapshot],
  );

  if (!owner || snapshot?.owner !== owner) {
    return (
      <p role="status" className="sr-only">
        <Trans>Loading…</Trans>
      </p>
    );
  }

  const bounds = snapshot.area?.boxes;
  const scope = `viewport:${owner}:${marketBoundsKey(bounds)}`;
  const request: NearbyRequest = { nearby: false, scope, ...(bounds ? { bounds } : {}) };

  return (
    <NearbyCatalogContext.Provider value={request}>
      <MarketDiscoveryAreaContext.Provider value={areaValue}>
        {children}
      </MarketDiscoveryAreaContext.Provider>
    </NearbyCatalogContext.Provider>
  );
}

function readMarketArea(owner: string): MarketDiscoveryArea | null {
  const raw = readOwnerScoped(owner, MARKET_AREA_STORAGE_NAME);
  if (!raw) return null;
  try {
    const area = normalizeMarketArea(JSON.parse(raw));
    if (area?.owner === owner) return area;
  } catch {
    // Corrupt or obsolete state is equivalent to never having visited the map.
  }
  removeOwnerScoped(owner, MARKET_AREA_STORAGE_NAME);
  return null;
}

function normalizeMarketArea(value: unknown): MarketDiscoveryArea | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MarketDiscoveryArea>;
  const owner = typeof candidate.owner === "string" ? candidate.owner.toLowerCase() : "";
  const center = candidate.center;
  const zoom = typeof candidate.zoom === "number" ? candidate.zoom : Number.NaN;
  const rawBoxes = candidate.boxes;
  const boxes = Array.isArray(rawBoxes) ? canonicalMarketBounds(rawBoxes) : [];
  if (
    !owner ||
    !center ||
    !Number.isFinite(center.lat) ||
    !Number.isFinite(center.lng) ||
    Math.abs(center.lat) > 90 ||
    Math.abs(center.lng) > 180 ||
    !Number.isFinite(zoom) ||
    zoom < 0 ||
    zoom > 24 ||
    !Array.isArray(rawBoxes) ||
    rawBoxes.length === 0 ||
    rawBoxes.length > 2 ||
    boxes.length !== rawBoxes.length ||
    coversWholeWorld(boxes)
  ) {
    return null;
  }
  return {
    owner,
    center: { lat: roundMapValue(center.lat, 6), lng: roundMapValue(center.lng, 6) },
    zoom: roundMapValue(zoom, 3),
    boxes,
  };
}

function coversWholeWorld(boxes: readonly MarketBoundingBox[]): boolean {
  return boxes.some((box) => box.minLng === -180 && box.maxLng === 180);
}

function equalMarketAreas(left: MarketDiscoveryArea | null, right: MarketDiscoveryArea): boolean {
  return (
    left !== null &&
    left.owner === right.owner &&
    left.center.lat === right.center.lat &&
    left.center.lng === right.center.lng &&
    left.zoom === right.zoom &&
    marketBoundsKey(left.boxes) === marketBoundsKey(right.boxes)
  );
}

function roundMapValue(value: number, precision: number): number {
  return Number(value.toFixed(precision));
}
