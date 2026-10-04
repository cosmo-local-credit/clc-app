import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { VoucherReviewsPanel } from "#/components/reviews/voucher-reviews-panel";
import { Button } from "#/components/ui/button";
import { VoucherAbout } from "#/components/vouchers/voucher-about";
import { VoucherOfferingsPanel } from "#/components/vouchers/voucher-offerings-panel";
import type { MarketVoucherTab } from "#/lib/navigation/home-tabs";
import { cn } from "#/lib/utils";

const TABS: readonly MarketVoucherTab[] = ["overview", "offerings", "reviews"];

/**
 * The card at full: the voucher's page, short of what only the page holds.
 * Activity, Posts and the owner's contract actions stay there, one link away.
 *
 * Its own chunk, so the map does not ship the Markdown renderer and the review
 * editor until a card is pulled all the way up.
 */
export function MarketVoucherSheetFull({
  address,
  detail,
  activeTab,
}: {
  address: `0x${string}`;
  detail: MarketVoucherDetail | undefined;
  activeTab: MarketVoucherTab;
}) {
  const { t } = useLingui();
  const symbol = detail?.symbol ?? "";

  return (
    <div className="pb-6">
      <div className="sticky top-0 z-10 bg-card px-4 py-2">
        <div
          className="grid grid-cols-3 border border-border bg-card p-1"
          role="tablist"
          aria-label={t`Voucher details`}
        >
          {TABS.map((tab) => {
            const label =
              tab === "overview" ? (
                <Trans>Overview</Trans>
              ) : tab === "offerings" ? (
                <Trans>Offerings</Trans>
              ) : (
                <Trans>Reviews</Trans>
              );
            const className = cn(
              "flex h-10 min-w-0 items-center justify-center px-1 font-semibold text-[0.6875rem]",
              activeTab === tab ? "bg-foreground text-background" : "text-muted-foreground",
            );

            if (activeTab === tab) {
              return (
                <button
                  key={tab}
                  type="button"
                  id={`voucher-tab-${tab}`}
                  role="tab"
                  aria-selected="true"
                  aria-controls={`voucher-panel-${tab}`}
                  className={className}
                >
                  {label}
                </button>
              );
            }

            return (
              <Link
                key={tab}
                id={`voucher-tab-${tab}`}
                role="tab"
                aria-selected="false"
                aria-controls={`voucher-panel-${tab}`}
                to="/"
                search={(previous) => ({
                  ...previous,
                  tab: "market",
                  voucherTab: tab === "overview" ? undefined : tab,
                })}
                // A panel on the same card is not a navigation: Back must close
                // the card, not walk back through the tabs it showed.
                replace
                state
                resetScroll={false}
                className={className}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-1">
        {activeTab === "overview" ? (
          <div
            id="voucher-panel-overview"
            role="tabpanel"
            aria-labelledby="voucher-tab-overview"
            className="space-y-3"
          >
            {/* The rate heads the card and the description reads in full above
                the tabs, so Overview starts at the contact rows. */}
            <VoucherAbout
              rate={null}
              symbol={symbol}
              description={null}
              contractAddress={detail?.address ?? address}
              email={detail?.email ?? null}
              website={detail?.website ?? null}
              phone={detail?.phone ?? null}
              terms={detail?.terms ?? null}
              issuerAddress={detail?.ownerAddress ?? null}
            />
            {detail?.locationName ? (
              <div className="border border-border bg-card p-4">
                <p className="font-heading font-semibold text-sm leading-snug">
                  {detail.locationName}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
        {activeTab === "offerings" ? (
          <VoucherOfferingsPanel
            voucherAddress={detail?.address ?? address}
            voucherSymbol={symbol}
            voucherValue={detail?.voucherValue ?? null}
            voucherUoa={detail?.voucherUoa ?? null}
            ownerAddress={detail?.ownerAddress ?? null}
            isKnownEmpty={detail?.kind === "voucher"}
          />
        ) : null}
        {activeTab === "reviews" ? <VoucherReviewsPanel key={address} address={address} /> : null}

        <Button asChild variant="outline" className="mt-6 h-11 w-full bg-card">
          <Link
            to="/vouchers/$voucherAddress"
            params={{ voucherAddress: address }}
            search={{ from: "market" }}
          >
            <Trans>Open voucher page</Trans>
          </Link>
        </Button>
      </div>
    </div>
  );
}
