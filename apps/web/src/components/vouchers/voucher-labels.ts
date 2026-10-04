import type { MarkerColor, MarkerIcon } from "@clc/core/features/markers/logic";
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
export function useMarketDistanceLabel(
  from: Coordinates | null,
  to: Coordinates | null,
): string | null {
  const { i18n, t } = useLingui();
  if (!from || !to) return null;

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

/** Names for the map pin choices, read by assistive tech and the review rows. */
export function useMarkerLabels() {
  const { t } = useLingui();
  return {
    icon(icon: MarkerIcon): string {
      switch (icon) {
        case "basket":
          return t`Shopping`;
        case "hand-coin":
          return t`Services`;
        case "coupon":
          return t`Voucher`;
        case "food":
          return t`Food`;
        case "farm":
          return t`Farming`;
        case "tools":
          return t`Tools`;
        case "health":
          return t`Health`;
        case "education":
          return t`Education`;
      }
    },
    color(color: MarkerColor): string {
      switch (color) {
        case "blue":
          return t`Blue`;
        case "purple":
          return t`Purple`;
        case "orange":
          return t`Orange`;
        case "pink":
          return t`Pink`;
        case "cyan":
          return t`Cyan`;
        case "brown":
          return t`Brown`;
      }
    },
  };
}
