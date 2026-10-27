import type { VoucherRef } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ProgressiveImage } from "#/components/ui/progressive-image";
import { Button } from "#/components/ui/button";
import { TagBadge } from "#/components/ui/tag-badge";
import { hueFromSeed } from "#/components/wallet/wallet-data";
import {
  DeskPanel,
  DeskRow,
  DeskRowList,
  DeskSection,
  deskSectionLinkClass,
} from "#/desktop/ui/page";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useVoucherReportsInfinite } from "#/features/home/hooks/use-reports";
import { formatReportDate } from "#/lib/report-display";

/**
 * Posts that name this voucher, three at a time, signed-in only as on the
 * phone. Its issuer gets "Write a post" in the header.
 */
export function VoucherPostsDesk({
  voucher,
  voucherName,
  voucherDataPending,
  canWritePost,
  layout,
}: {
  voucher: VoucherRef | undefined;
  voucherName: string;
  voucherDataPending: boolean;
  canWritePost: boolean;
  layout: "page" | "panel";
}) {
  const { t, i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const auth = useAuthStatus();
  const reportsQuery = useVoucherReportsInfinite(voucher, 3, auth.isAuthenticated && !!voucher);
  const reports = reportsQuery.data?.pages.flatMap((page) => page.reports) ?? [];

  const notice = (children: ReactNode) => (
    <DeskPanel>
      <p className="text-sm text-muted-foreground">{children}</p>
    </DeskPanel>
  );
  let content: ReactNode;
  if (auth.isLoading || (auth.isAuthenticated && !voucher && voucherDataPending)) {
    content = notice(<Trans>Loading posts…</Trans>);
  } else if (!auth.isAuthenticated) {
    content = notice(<Trans>Sign in to view posts.</Trans>);
  } else if (!voucher) {
    content = notice(<Trans>Posts aren't available for this voucher.</Trans>);
  } else if (reportsQuery.isPending) {
    content = notice(<Trans>Loading posts…</Trans>);
  } else if (reportsQuery.isError) {
    content = (
      <DeskPanel className="grid justify-items-start gap-3">
        <p className="text-sm text-muted-foreground">
          <Trans>Couldn't load posts.</Trans>
        </p>
        <Button
          variant="outline"
          pending={reportsQuery.isFetching}
          onClick={() => void reportsQuery.refetch()}
        >
          <Trans>Try again</Trans>
        </Button>
      </DeskPanel>
    );
  } else if (reports.length === 0) {
    content = notice(<Trans>No posts yet.</Trans>);
  } else {
    content = (
      <DeskRowList>
        {reports.map((report) => {
          const updated = formatReportDate(report.updatedAt, locale);
          return (
            <Link
              key={report.id}
              to="/posts/$reportId"
              params={{ reportId: report.id }}
              className="block hover:bg-muted/60"
            >
              <DeskRow
                lead={
                  <span className="relative block size-10 shrink-0 overflow-hidden bg-muted">
                    {report.imageUrl ? (
                      <ProgressiveImage
                        src={report.imageUrl}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 size-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 flex items-center justify-center font-heading text-sm font-bold text-white"
                        style={{ background: hueFromSeed(report.id) }}
                      >
                        {report.title.trim().slice(0, 1).toLocaleUpperCase() || "R"}
                      </span>
                    )}
                  </span>
                }
                title={<span className="[overflow-wrap:anywhere]">{report.title}</span>}
                subtitle={
                  updated && report.updatedAt ? (
                    <time dateTime={report.updatedAt} className="font-mono">
                      {updated}
                    </time>
                  ) : null
                }
                trail={
                  report.tags.length > 0 ? (
                    <span className="flex max-w-56 min-w-0 shrink items-center gap-1 overflow-hidden">
                      {report.tags.slice(0, 2).map((tag) => (
                        <TagBadge
                          key={tag}
                          tag={tag}
                          size="sm"
                          labelClassName="block min-w-0 truncate"
                          className="min-w-0 max-w-28 shrink overflow-hidden"
                        />
                      ))}
                    </span>
                  ) : null
                }
              />
            </Link>
          );
        })}
      </DeskRowList>
    );
  }

  const write =
    canWritePost && voucher ? (
      <Link
        to="/posts/new"
        search={{ voucher: voucher.address, chainId: voucher.chainId, voucherName }}
        className={deskSectionLinkClass()}
      >
        <Trans>Write a post</Trans>
      </Link>
    ) : null;

  const body = (
    <div className="grid gap-2">
      {content}
      {reportsQuery.hasNextPage ? (
        <Button
          variant="outline"
          className="justify-self-start"
          pending={reportsQuery.isFetchingNextPage}
          onClick={() => void reportsQuery.fetchNextPage()}
        >
          {reportsQuery.isFetchingNextPage ? t`Loading…` : t`Load more`}
        </Button>
      ) : null}
    </div>
  );

  if (layout === "panel") {
    return (
      <div className="grid gap-3">
        {write ? <div className="flex h-[30px] items-center justify-end">{write}</div> : null}
        {body}
      </div>
    );
  }
  return (
    <DeskSection title={<Trans>Posts</Trans>} action={write}>
      {body}
    </DeskSection>
  );
}
