import { MetricCard } from "#/components/admin/metric-card";
import { formatFeePpm } from "#/lib/format";
import type { PoolComposition } from "../pool-posture";

/**
 * Six figures about the pool, at detail-screen density.
 *
 * Five of them are counted over the fetched voucher page rather than asked of
 * the backend, so a page that did not arrive must not render as six zeros:
 * `available` is false in that case and the tiles say unavailable. A page that
 * arrived but does not cover every voucher says so in the tile's detail line,
 * because a coverage figure quoted from a partial page is a wrong figure.
 */
export function PoolSummaryMetrics({
  composition,
  feePpm,
  available,
}: {
  composition: PoolComposition;
  feePpm: number | null;
  available: boolean;
}) {
  const partial = available && composition.loaded < composition.total;
  const coverage = partial ? `of ${composition.loaded} loaded` : undefined;

  return (
    <section
      aria-label="Pool summary"
      // Rows size to their content rather than dividing the band's height, and
      // three across rather than two: six figures then cost two rows instead of
      // three, which is what keeps the whole visual column inside the height of
      // the record beside it.
      className="grid auto-rows-min grid-cols-2 gap-3 sm:grid-cols-3"
    >
      {/* The pool record's own count, so it stands whether or not the voucher
          page loaded. */}
      <MetricCard label="Vouchers" size="sm" value={composition.total} />
      <MetricCard
        label="Priced"
        size="sm"
        value={available ? composition.priced : 0}
        unavailable={!available || composition.pricing === null}
        tone={composition.unpriced > 0 ? "warning" : "neutral"}
        detail={
          coverage ?? (composition.unpriced > 0 ? `${composition.unpriced} unpriced` : undefined)
        }
      />
      <MetricCard
        label="Zero cap"
        size="sm"
        value={available ? composition.blocked : 0}
        unavailable={!available}
        tone={composition.blocked > 0 ? "danger" : "neutral"}
        detail={coverage ?? (composition.blocked > 0 ? "deposits blocked" : undefined)}
      />
      <MetricCard
        label={composition.pricing === "oracle" ? "Price feeds" : "Pricing"}
        size="sm"
        value={
          composition.pricing === "oracle"
            ? composition.feeds
            : composition.pricing === "relative"
              ? "Relative"
              : "Decimals"
        }
        unavailable={!available || composition.pricing === null}
        detail={composition.pricing === "oracle" ? coverage : undefined}
      />
      <MetricCard
        label="Offers"
        size="sm"
        value={available ? composition.offers : 0}
        unavailable={!available}
        detail={coverage ?? `${composition.liveOffers} live`}
      />
      <MetricCard
        label="Swap fee"
        size="sm"
        value={feePpm === null ? 0 : formatFeePpm(feePpm)}
        unavailable={feePpm === null}
      />
    </section>
  );
}
