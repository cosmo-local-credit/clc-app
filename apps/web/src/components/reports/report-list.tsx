import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { TagBadge } from "#/components/ui/tag-badge";
import { hueFromSeed } from "#/components/wallet/wallet-data";
import type { ReportSummary } from "#/features/home/api/reports-client";
import { formatReportDate } from "#/lib/report-display";

const VISIBLE_TAGS = 2;
const VISIBLE_VOUCHERS = 1;

export function ReportList({
  reports,
  ariaLabel,
  busy = false,
}: {
  reports: ReportSummary[];
  ariaLabel: string;
  busy?: boolean;
}) {
  const { i18n } = useLingui();

  return (
    <section
      className={["border border-border bg-card", busy ? "opacity-60 transition-opacity" : ""].join(
        " ",
      )}
      aria-busy={busy}
      aria-label={ariaLabel}
    >
      {reports.map((report, index) => {
        const extraTags = report.tags.length - VISIBLE_TAGS;
        const extraVouchers = report.vouchers.length - VISIBLE_VOUCHERS;
        const updated = formatReportDate(report.updatedAt, i18n.locale);

        return (
          <Link
            key={report.id}
            to="/posts/$reportId"
            params={{ reportId: report.id }}
            className={[
              "flex gap-3 p-3 active:bg-muted",
              index === reports.length - 1 ? "" : "border-b border-border",
            ].join(" ")}
          >
            {report.imageUrl ? (
              <span className="relative block min-h-16 w-16 shrink-0 self-stretch overflow-hidden bg-muted">
                <ProgressiveImage
                  src={report.imageUrl}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover"
                />
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="flex min-h-16 w-16 shrink-0 self-stretch items-center justify-center font-heading text-xl font-bold text-white"
                style={{ background: hueFromSeed(report.id) }}
              >
                {report.title.trim().slice(0, 1).toLocaleUpperCase() || "R"}
              </span>
            )}

            <span className="flex min-w-0 flex-1 flex-col">
              <span className="line-clamp-1 font-heading text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
                {report.title}
              </span>

              {report.description ? (
                <span className="mt-0.5 line-clamp-1 text-muted-foreground text-xs leading-snug [overflow-wrap:anywhere]">
                  {report.description}
                </span>
              ) : null}

              {report.tags.length > 0 ? (
                <span className="mt-1.5 flex min-w-0 items-center gap-1 overflow-hidden">
                  {report.tags.slice(0, VISIBLE_TAGS).map((tag) => (
                    <TagBadge
                      key={tag}
                      tag={tag}
                      labelClassName="block min-w-0 truncate"
                      className="h-5 min-w-0 max-w-20 shrink overflow-hidden px-1.5 text-[0.625rem]"
                    />
                  ))}
                  {extraTags > 0 ? (
                    <span className="shrink-0 text-muted-foreground text-[0.625rem]">
                      +{extraTags}
                    </span>
                  ) : null}
                </span>
              ) : null}

              <span className="mt-1 flex h-5 min-w-0 items-center justify-between gap-2">
                {updated && report.updatedAt ? (
                  <time
                    dateTime={report.updatedAt}
                    className="inline-flex h-full shrink-0 items-center text-muted-foreground text-xs leading-none"
                  >
                    {updated}
                  </time>
                ) : null}
                {report.vouchers.length > 0 ? (
                  <span className="ml-auto flex h-full min-w-0 items-center justify-end gap-1">
                    {report.vouchers.slice(0, VISIBLE_VOUCHERS).map((voucher) => (
                      <Badge
                        key={voucher.address}
                        variant="outline"
                        className="h-full min-w-0 max-w-20 truncate px-1.5 font-mono text-[0.625rem] text-info"
                      >
                        {voucher.symbol}
                      </Badge>
                    ))}
                    {extraVouchers > 0 ? (
                      <Badge
                        variant="outline"
                        className="h-full px-1.5 font-mono text-[0.625rem] text-muted-foreground"
                      >
                        {extraVouchers}+
                      </Badge>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        );
      })}
    </section>
  );
}
