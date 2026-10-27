import { catalogDetailQueryOptions } from "@clc/api/features/catalogs/queries";
import { BackendApiError } from "@clc/api/client/errors";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RiPencilLine } from "react-icons/ri";

import { CatalogPicture } from "#/components/catalogs/catalog-row";
import { AuthenticatedDetailsGate } from "#/components/auth/authenticated-details-gate";
import { Button } from "#/components/ui/button";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { TagBadge } from "#/components/ui/tag-badge";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { DeskCanvas, DeskTitle, DeskTitleRow } from "#/desktop/ui/page";
import { useDeskTrailLabel } from "#/desktop/trail";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { CatalogForm } from "#/features/catalogs/ui/catalog-form";
import { CatalogMembers } from "#/features/catalogs/ui/catalog-members";
import { CatalogShareButton } from "#/features/catalogs/ui/catalog-share-button";
import { catalogsClient } from "#/lib/api/catalogs";
import { cn } from "#/lib/utils";

export function CatalogDesk({ id }: { id: string }) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const query = useQuery({ ...catalogDetailQueryOptions(catalogsClient, id), retry: false });
  const [editing, setEditing] = useState(false);
  const catalog = query.data;
  const owner =
    auth.isAuthenticated &&
    catalog?.ownerAddress.toLowerCase() === auth.session?.address.toLowerCase();
  useDeskTrailLabel(catalog?.name);

  const page = (
    <DeskCanvas width="read" className="max-w-[1164px]">
      {query.isPending ? (
        <ListSkeleton shape="cards" count={1} label={<Trans>Loading…</Trans>} />
      ) : query.isError ? (
        <div className="space-y-3">
          <DeskTitle>
            {query.error instanceof BackendApiError && query.error.status === 404 ? (
              <Trans>Catalog not found.</Trans>
            ) : (
              <Trans>Couldn't load catalogs.</Trans>
            )}
          </DeskTitle>
          <Button
            variant="outline"
            tap
            pending={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : catalog ? (
        <>
          <div className="flex min-w-0 items-center gap-3">
            <span className="[&>span]:size-14">
              <CatalogPicture url={catalog.imageUrl} />
            </span>
            <DeskTitleRow
              className="min-w-0 flex-1"
              title={
                <span dir="auto" className="[overflow-wrap:anywhere]">
                  {catalog.name}
                </span>
              }
              meta={
                catalog.locationName ? (
                  <AuthenticatedDetailsGate>
                    <span dir="auto">{catalog.locationName}</span>
                  </AuthenticatedDetailsGate>
                ) : null
              }
              actions={
                <>
                  <CatalogShareButton
                    id={catalog.id}
                    name={catalog.name}
                    className="border border-foreground/25 bg-card text-foreground"
                  />
                  {owner ? (
                    <Button
                      variant="outline"
                      aria-expanded={editing}
                      onClick={() => setEditing((open) => !open)}
                    >
                      <RiPencilLine aria-hidden="true" />
                      <Trans>Edit catalog</Trans>
                    </Button>
                  ) : null}
                </>
              }
            />
          </div>
          {catalog.description || catalog.tags.length > 0 ? (
            <div className="grid gap-3">
              {catalog.description ? (
                <p dir="auto" className="max-w-[72ch] whitespace-pre-wrap text-sm leading-relaxed">
                  {catalog.description}
                </p>
              ) : null}
              {catalog.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5" aria-label={t`Tags`}>
                  {catalog.tags.map((tag) => (
                    <TagBadge key={tag} tag={tag} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className={MEMBERS_CLASS}>
            <CatalogMembers catalogId={id} kind="pool" canEdit={owner} />
            <CatalogMembers catalogId={id} kind="voucher" canEdit={owner} />
          </div>
        </>
      ) : null}
    </DeskCanvas>
  );

  if (!(owner && editing && catalog)) return page;
  return (
    <div className="flex h-full min-h-0">
      <DeskSplit
        main={page}
        side={
          <DeskInspector title={<Trans>Edit catalog</Trans>} onClose={() => setEditing(false)}>
            <CatalogForm catalog={catalog} onSaved={() => setEditing(false)} />
          </DeskInspector>
        }
      />
    </div>
  );
}

/**
 * Pools and Vouchers side by side, each a 30px header row over one white
 * row list. The members' own rows are separate tiles on the phone; here they
 * join into one tile with rules between them.
 */
const MEMBERS_CLASS = cn(
  "grid grid-cols-2 items-start gap-4",
  "[&>section>div:first-child]:min-h-[30px] [&>section>div:first-child]:flex-nowrap",
  "[&>section>div.border]:mb-0 [&>section>div.border]:min-h-14 [&>section>div.border]:px-3.5 [&>section>div.border]:py-2.5",
  "[&>section>div.border+div.border]:border-t-0",
  "[&>section>div.border_a>span:first-child]:size-9 [&>section>div.border_a>span:first-child_svg]:size-4",
  "[&>section>div.border_a>span:last-child]:truncate [&>section>div.border_a>span:last-child]:text-sm [&>section>div.border_a>span:last-child]:font-semibold",
);
