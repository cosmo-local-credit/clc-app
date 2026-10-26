import { catalogDetailQueryOptions } from "@clc/api/features/catalogs/queries";
import { BackendApiError } from "@clc/api/client/errors";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { CatalogPicture } from "#/components/catalogs/catalog-row";
import { AuthenticatedDetailsGate } from "#/components/auth/authenticated-details-gate";
import { Button } from "#/components/ui/button";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";
import { useDeskTrailLabel } from "#/desktop/trail";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { CatalogForm } from "#/features/catalogs/ui/catalog-form";
import { CatalogMembers } from "#/features/catalogs/ui/catalog-members";
import { CatalogShareButton } from "#/features/catalogs/ui/catalog-share-button";
import { catalogsClient } from "#/lib/api/catalogs";

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

  return (
    <DeskCanvas width="read" className="space-y-5">
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
          <header className="flex items-start gap-3">
            <CatalogPicture url={catalog.imageUrl} />
            <div className="min-w-0 flex-1">
              <DeskTitle>
                <span dir="auto" className="break-words">
                  {catalog.name}
                </span>
              </DeskTitle>
              <div className="mt-2">
                <AuthenticatedDetailsGate>
                  <p dir="auto" className="text-sm text-muted-foreground">
                    {catalog.locationName}
                  </p>
                </AuthenticatedDetailsGate>
              </div>
            </div>
            <CatalogShareButton id={catalog.id} name={catalog.name} />
          </header>
          {catalog.description ? (
            <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed">
              {catalog.description}
            </p>
          ) : null}
          {catalog.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2" aria-label={t`Tags`}>
              {catalog.tags.map((tag) => (
                <span key={tag} className="border border-border bg-card px-2 py-1 text-xs">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {owner ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" tap onClick={() => setEditing((open) => !open)}>
                <Trans>Edit catalog</Trans>
              </Button>
            </div>
          ) : null}
          {owner && editing ? (
            <CatalogForm catalog={catalog} onSaved={() => setEditing(false)} />
          ) : null}
          <CatalogMembers catalogId={id} kind="pool" canEdit={owner} />
          <CatalogMembers catalogId={id} kind="voucher" canEdit={owner} />
        </>
      ) : null}
    </DeskCanvas>
  );
}
