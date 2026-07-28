import { Trans } from "@lingui/react/macro";

import { OfferingsPanel } from "#/components/offerings";
import { useVoucherOfferingsInfinite } from "#/features/home/hooks/use-voucher-offerings";

/**
 * One voucher's offerings. No tile names its voucher: every row on this screen
 * belongs to the voucher in the page header.
 */
export function VoucherOfferingsPanel({
  voucherAddress,
  voucherSymbol,
  isKnownEmpty,
}: {
  voucherAddress: string | undefined;
  voucherSymbol: string;
  /** `kind === "voucher"` already proves the result is empty — skip the request. */
  isKnownEmpty: boolean;
}) {
  const query = useVoucherOfferingsInfinite(isKnownEmpty ? undefined : voucherAddress);

  return (
    <OfferingsPanel
      id="voucher-panel-offerings"
      role="tabpanel"
      aria-labelledby="voucher-tab-offerings"
      query={query}
      suppressed={isKnownEmpty}
      fallbackSymbol={voucherSymbol}
      emptyState={<Trans>There is nothing available for exchange with this voucher yet.</Trans>}
    />
  );
}
