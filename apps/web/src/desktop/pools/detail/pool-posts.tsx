import type { UserPool } from "@clc/api/features/pools/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ProgressiveImage } from "#/components/ui/progressive-image";
import { Button } from "#/components/ui/button";
import { hueFromSeed } from "#/components/wallet/wallet-data";
import {
  DeskPanel,
  DeskRow,
  DeskRowList,
  DeskSection,
  deskSectionLinkClass,
} from "#/desktop/ui/page";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { usePoolReportsInfinite } from "#/features/home/hooks/use-reports";
import { formatReportDate } from "#/lib/report-display";

export function PoolPostsDesk({ pool }: { pool: UserPool }) {
  const { t, i18n } = useLingui();
  const auth = useAuthStatus();
  const poolRef =
    pool.chainId === null ? undefined : { chainId: pool.chainId, address: pool.address };
  const query = usePoolReportsInfinite(poolRef, 3, auth.isAuthenticated && !!poolRef);
  const reports = query.data?.pages.flatMap((page) => page.reports) ?? [];
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const notice = (children: ReactNode) => (
    <DeskPanel>
      <p className="text-sm text-muted-foreground">{children}</p>
    </DeskPanel>
  );

  let content: ReactNode;
  if (auth.isLoading || (auth.isAuthenticated && query.isPending)) {
    content = notice(<Trans>Loading posts…</Trans>);
  } else if (!auth.isAuthenticated) {
    content = notice(<Trans>Sign in to view posts.</Trans>);
  } else if (!poolRef) {
    content = notice(<Trans>Posts aren't available for this pool.</Trans>);
  } else if (query.isError) {
    content = (
      <DeskPanel className="grid justify-items-start gap-3">
        <p className="text-sm text-muted-foreground">
          <Trans>Couldn't load posts.</Trans>
        </p>
        <Button variant="outline" pending={query.isFetching} onClick={() => void query.refetch()}>
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
                        {report.title.trim().slice(0, 1).toLocaleUpperCase() || "P"}
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
              />
            </Link>
          );
        })}
      </DeskRowList>
    );
  }

  const viewAll = poolRef ? (
    <Link
      to="/"
      search={{
        tab: "posts",
        timing: "all",
        pools: `${poolRef.chainId}:${pool.address.toLowerCase()}`,
      }}
      className={deskSectionLinkClass()}
    >
      <Trans>View all</Trans>
    </Link>
  ) : null;

  return (
    <DeskSection title={<Trans>Posts</Trans>} action={viewAll}>
      <div className="grid gap-2">
        {content}
        {query.hasNextPage ? (
          <Button
            variant="outline"
            className="justify-self-start"
            pending={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? t`Loading…` : t`Load more`}
          </Button>
        ) : null}
      </div>
    </DeskSection>
  );
}
