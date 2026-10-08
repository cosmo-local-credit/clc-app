import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { VoucherReviewsPanel } from "#/components/reviews/voucher-reviews-panel";
import { Button } from "#/components/ui/button";
import { VoucherOfferingsPanel } from "#/components/vouchers/voucher-offerings-panel";

/** The voucher page's own search: where Back leads once it is open. */
export type VoucherPageOrigin = { from?: "wallet" | "vouchers"; poolAddress?: string };

/**
 * The continuous content beneath the voucher summary. It is split into its own
 * chunk so a closed card does not ship the review editor and offerings surface.
 */
export function VoucherSheetFull({
  address,
  detail,
  origin,
}: {
  address: `0x${string}`;
  detail: MarketVoucherDetail | undefined;
  origin: VoucherPageOrigin | undefined;
}) {
  const symbol = detail?.symbol ?? "";

  return (
    <div className="space-y-6 px-4 pb-6 pt-2">
      <section aria-labelledby="voucher-sheet-offerings">
        <h3
          id="voucher-sheet-offerings"
          className="mb-3 font-heading text-[1.125rem] font-semibold tracking-[-0.015em]"
        >
          <Trans>Offerings</Trans>
        </h3>
        <VoucherOfferingsPanel
          voucherAddress={detail?.address ?? address}
          voucherSymbol={symbol}
          voucherValue={detail?.voucherValue ?? null}
          voucherUoa={detail?.voucherUoa ?? null}
          ownerAddress={detail?.ownerAddress ?? null}
          isKnownEmpty={detail?.kind === "voucher"}
          maxItems={3}
          autoLoadMore={false}
          presentation="section"
          readOnly
        />
      </section>

      <section aria-labelledby="voucher-sheet-reviews">
        <h3
          id="voucher-sheet-reviews"
          className="mb-3 font-heading text-[1.125rem] font-semibold tracking-[-0.015em]"
        >
          <Trans>Reviews</Trans>
        </h3>
        <VoucherReviewsPanel key={address} address={address} presentation="section" />
      </section>

      <Button asChild className="h-11 w-full">
        <Link
          to="/vouchers/$voucherAddress"
          params={{ voucherAddress: address }}
          search={{ from: origin?.from, poolAddress: origin?.poolAddress }}
        >
          <Trans>Open voucher page</Trans>
        </Link>
      </Button>
    </div>
  );
}
