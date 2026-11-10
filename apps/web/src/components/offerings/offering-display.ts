import type { Offering, OfferingFrequency } from "@clc/api/features/offerings/client";
import {
  formatOfferingDisplayPrice,
  formatOfferingDisplayValue,
  formatOfferingPrice,
} from "@clc/core/features/market/logic";
import { useLingui } from "@lingui/react/macro";

import type { OfferingVoucherRate } from "#/components/offerings/offerings-panel";

/** An offering's price in its voucher's unit of account, localized; null when it has none. */
export function resolveOfferingDisplayPrice(
  offering: Offering,
  voucherRate: OfferingVoucherRate | null,
  locale: string,
): { value: string; unit: string } | null {
  if (!formatOfferingPrice(offering.pricePerUnit)) return null;

  const converted = voucherRate
    ? formatOfferingDisplayPrice(offering.pricePerUnit, voucherRate.value, voucherRate.unit, "")
    : offering.priceInUnitOfAccount && offering.voucherUoa
      ? {
          value: formatOfferingPrice(offering.priceInUnitOfAccount)?.value ?? "",
          unit: offering.voucherUoa.trim(),
        }
      : null;
  if (!converted?.value || !converted.unit) return null;

  const localized = formatOfferingDisplayValue(converted.value, locale);
  return localized ? { value: localized, unit: converted.unit } : null;
}

/** The offering's restock frequency as a word, or null when it has none. */
export function useOfferingFrequencyLabel(frequency: OfferingFrequency | null): string | null {
  const { t } = useLingui();
  switch (frequency) {
    case "day":
      return t`Daily`;
    case "week":
      return t`Weekly`;
    case "month":
      return t`Monthly`;
    case "year":
      return t`Yearly`;
    case null:
      return null;
  }
}
