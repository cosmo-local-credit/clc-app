import type { PoolVoucher } from "@clc/api/features/pools/client";
import type { MarketLocation } from "#/components/catalog-map/market-data";

export function poolVoucherCoordinates(
  voucher: Pick<PoolVoucher, "geoLat" | "geoLng">,
): { lat: number; lng: number } | null {
  if (typeof voucher.geoLat !== "number" || typeof voucher.geoLng !== "number") return null;
  return { lat: voucher.geoLat, lng: voucher.geoLng };
}

export function poolVoucherToMarketLocation(voucher: PoolVoucher): MarketLocation | null {
  const coordinates = poolVoucherCoordinates(voucher);
  if (!coordinates) return null;
  return {
    id: voucher.tokenAddress.toLowerCase(),
    name: voucher.name,
    kind: "voucher",
    lat: coordinates.lat,
    lng: coordinates.lng,
    locationName: voucher.locationName,
  };
}
