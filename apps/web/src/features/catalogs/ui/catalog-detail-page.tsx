import { catalogDetailQueryOptions } from "@clc/api/features/catalogs/queries";
import { BackendApiError } from "@clc/api/client/errors";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CatalogPicture } from "#/components/catalogs/catalog-row";
import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { BackChevron } from "#/components/wallet";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { catalogsClient } from "#/lib/api/catalogs";
import { CatalogForm } from "./catalog-form";
import { CatalogMembers } from "./catalog-members";
import { CatalogShareButton } from "./catalog-share-button";
import { ListSkeleton } from "#/components/ui/list-skeleton";

export function CatalogDetailPage({ id }: { id: string }) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const query = useQuery({ ...catalogDetailQueryOptions(catalogsClient, id), retry: false });
  const [editing, setEditing] = useState(false);
  const catalog = query.data;
  const owner =
    auth.isAuthenticated &&
    catalog?.ownerAddress.toLowerCase() === auth.session?.address.toLowerCase();
  return (
    <div className="min-h-[100svh] space-y-5 bg-background px-6 pt-6 pb-bottom-nav">
      <BackChevron label={t`Catalogs`} to="/market" search={{ scope: "catalogs" }} />
      {query.isPending ? (
        <ListSkeleton shape="cards" count={1} label={<Trans>Loading…</Trans>} />
      ) : query.isError ? (
        <div className="space-y-3">
          <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
            {query.error instanceof BackendApiError && query.error.status === 404 ? (
              <Trans>Catalog not found.</Trans>
            ) : (
              <Trans>Couldn't load catalogs.</Trans>
            )}
          </h1>
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
              <h1
                dir="auto"
                className="break-words font-heading text-[1.75rem] font-bold leading-tight"
              >
                {catalog.name}
              </h1>
              <p dir="auto" className="mt-2 text-sm text-muted-foreground">
                {catalog.locationName}
              </p>
            </div>
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
          <div className="flex flex-wrap gap-2">
            <CatalogShareButton id={catalog.id} name={catalog.name} />
            {owner ? (
              <Button variant="outline" tap onClick={() => setEditing(true)}>
                <Trans>Edit catalog</Trans>
              </Button>
            ) : null}
          </div>
          <CatalogMembers catalogId={id} kind="pool" canEdit={owner} />
          <CatalogMembers catalogId={id} kind="voucher" canEdit={owner} />
          {owner ? (
            <SheetRoot open={editing} onOpenChange={setEditing}>
              <SheetPortal>
                <SheetBackdrop />
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>
                      <Trans>Edit catalog</Trans>
                    </SheetTitle>
                  </SheetHeader>
                  <div className="overflow-y-auto px-6 pb-8">
                    {editing ? (
                      <CatalogForm catalog={catalog} onSaved={() => setEditing(false)} />
                    ) : null}
                  </div>
                </SheetContent>
              </SheetPortal>
            </SheetRoot>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
