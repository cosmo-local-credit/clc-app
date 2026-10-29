import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { RiBookOpenLine } from "react-icons/ri";

import { ProgressiveImage } from "#/components/ui/progressive-image";
import { DeskRow, DeskRowList, DeskSection, deskSectionLinkClass } from "#/desktop/ui/page";
import {
  Empty,
  ErrorRetry,
  Loading,
  QuotaMeta,
  SectionActions,
} from "#/desktop/wallet/wallet-parts";
import { useMyCatalog } from "#/features/catalogs/hooks/use-my-catalog";
import type { useResourceUsage } from "#/hooks/use-resource-usage";

/**
 * The catalogs this account owns, as compact rows: the phone's My Catalogs
 * with the same allowance rules. Create appears only while the allowance has
 * room; a full or unreadable allowance says so instead of offering it.
 */
export function WalletCatalogs({ usage }: { usage: ReturnType<typeof useResourceUsage> }) {
  const query = useMyCatalog();
  const quota = usage.data?.catalogs;
  const creatable = quota?.canCreate === true && !usage.isError;

  return (
    <DeskSection
      title={<Trans>My Catalogs</Trans>}
      action={
        <SectionActions>
          <QuotaMeta usage={usage} kind="catalogs" />
          {creatable ? (
            <Link to="/catalogs/create" className={deskSectionLinkClass()}>
              <Trans>Create</Trans>
            </Link>
          ) : null}
        </SectionActions>
      }
    >
      {query.isPending ? (
        <Loading label={<Trans>Loading…</Trans>} />
      ) : query.isError ? (
        <ErrorRetry
          message={<Trans>Couldn't load catalogs.</Trans>}
          pending={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : query.catalogs.length === 0 ? (
        <Empty quota={quota}>
          <Trans>You haven't created a catalog yet.</Trans>
        </Empty>
      ) : (
        <div className="grid min-w-0 gap-2">
          <DeskRowList>
            {query.catalogs.map((catalog) => (
              <Link
                key={catalog.id}
                to="/catalogs/$catalogId"
                params={{ catalogId: catalog.id }}
                className="block hover:bg-muted/60"
              >
                <DeskRow
                  lead={
                    <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden border border-border bg-card">
                      {catalog.imageUrl ? (
                        <ProgressiveImage src={catalog.imageUrl} alt="" className="size-full" />
                      ) : (
                        <RiBookOpenLine
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                  }
                  title={<span dir="auto">{catalog.name}</span>}
                  subtitle={
                    catalog.locationName ? <span dir="auto">{catalog.locationName}</span> : null
                  }
                />
              </Link>
            ))}
          </DeskRowList>
          {quota && !quota.canCreate ? (
            <p className="text-xs text-muted-foreground">
              <Trans>Limit reached. Ask an administrator to increase your allowance.</Trans>
            </p>
          ) : null}
        </div>
      )}
    </DeskSection>
  );
}
