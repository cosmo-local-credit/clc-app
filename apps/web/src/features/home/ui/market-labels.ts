import { formatDistance, haversineMeters } from "@clc/core/lib/geo/distance";
import { useLingui } from "@lingui/react/macro";

import type { MarketVoucherKind } from "@clc/api/features/market/client";

type Coordinates = { lat: number; lng: number };

export function useMarketKindLabel(kind: MarketVoucherKind): string {
  const { t } = useLingui();
  switch (kind) {
    case "goods":
      return t`Goods`;
    case "services":
      return t`Services`;
    case "voucher":
      return t`Voucher`;
  }
}

/**
 * Distance is only labelled from a live or persisted GPS fix. IP and country
 * centroids are useful camera fallbacks, but would fabricate user proximity.
 */
export function useMarketDistanceLabel(from: Coordinates | null, to: Coordinates): string | null {
  const { i18n, t } = useLingui();
  if (!from) return null;

  try {
    const distance = formatDistance(haversineMeters(from, to));
    const localized = {
      value: new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale, {
        minimumFractionDigits: distance.fractionDigits,
        maximumFractionDigits: distance.fractionDigits,
      }).format(distance.value),
    };
    return distance.unit === "m" ? t`${localized.value} m` : t`${localized.value} km`;
  } catch {
    return null;
  }
}
