import { Trans } from "@lingui/react/macro";

import { OfferingsPanel } from "#/components/offerings";
import { usePoolOfferingsInfinite } from "#/features/home/hooks/use-voucher-offerings";

/**
 * Everything the pool's vouchers offer, in one grid.
 *
 * Unlike a voucher page every tile carries its own voucher symbol: these rows
 * come from different vouchers, and which voucher an offering is priced in
 * decides whether the reader can actually pay for it.
 */
export function PoolOfferingsPanel({ poolAddress }: { poolAddress: string }) {
  const query = usePoolOfferingsInfinite(poolAddress);

  return (
    <OfferingsPanel
      id="pool-panel-offerings"
      role="tabpanel"
      aria-labelledby="pool-tab-offerings"
      query={query}
      showVoucher
      emptyState={<Trans>No voucher in this pool is offering anything yet.</Trans>}
    />
  );
}
