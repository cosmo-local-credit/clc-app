import type { Catalog, CatalogKind } from "@clc/core/features/catalogs/logic";
import { BackendApiError } from "@clc/api/client/errors";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { RiAddLine, RiFileCopyLine, RiShareLine } from "react-icons/ri";

import { AuthenticatedDetailsGate } from "#/components/auth/authenticated-details-gate";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { Skeleton } from "#/components/ui/skeleton";
import { MarketAvatar } from "#/desktop/market/market-bits";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { DeskCanvas, DeskRowList, DeskSection, DeskTitle, DeskTitleRow } from "#/desktop/ui/page";
import { useDeskTrailLabel } from "#/desktop/trail";
import { useCatalogDetail } from "#/features/catalogs/hooks/use-catalog-detail";
import { useCatalogForm } from "#/features/catalogs/hooks/use-catalog-form";
import { useCatalogMembers } from "#/features/catalogs/hooks/use-catalog-members";
import { useCatalogShare } from "#/features/catalogs/hooks/use-catalog-share";
import { CatalogFieldsDesk, CatalogMarkDesk } from "./catalog-fields-desk";
import { CatalogMemberPickerDesk } from "./catalog-member-picker-desk";

/** A catalog: title row, description and tags, then Pools and Vouchers side by side. */
export function CatalogDesk({ id }: { id: string }) {
  const { t } = useLingui();
  const { query, catalog, owner } = useCatalogDetail(id);
  const [editing, setEditing] = useState(false);
  useDeskTrailLabel(catalog?.name);

  const page = (
    <DeskCanvas className="max-w-[1164px]">
      {query.isPending ? (
        <div className="grid gap-4" role="status" aria-label={t`Loading…`}>
          <Skeleton className="h-14 w-96" />
          <Skeleton className="h-40" />
        </div>
      ) : query.isError ? (
        <div className="grid justify-items-start gap-3">
          <DeskTitle>
            {query.error instanceof BackendApiError && query.error.status === 404 ? (
              <Trans>Catalog not found.</Trans>
            ) : (
              <Trans>Couldn't load catalogs.</Trans>
            )}
          </DeskTitle>
          <Button variant="outline" pending={query.isFetching} onClick={() => void query.refetch()}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : catalog ? (
        <>
          <div className="flex min-w-0 items-center gap-3">
            <CatalogMarkDesk url={catalog.imageUrl} size="lg" />
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
                  <CatalogShareDesk id={catalog.id} name={catalog.name} />
                  {owner ? (
                    <Button
                      variant="outline"
                      aria-expanded={editing}
                      onClick={() => setEditing((open) => !open)}
                    >
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
                    <Badge key={tag} variant="outline" size="sm">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-2 items-start gap-4">
            <CatalogMembersDesk catalogId={id} kind="pool" canEdit={owner} />
            <CatalogMembersDesk catalogId={id} kind="voucher" canEdit={owner} />
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
            <CatalogEditDesk catalog={catalog} onSaved={() => setEditing(false)} />
          </DeskInspector>
        }
      />
    </div>
  );
}

function CatalogEditDesk({ catalog, onSaved }: { catalog: Catalog; onSaved: () => void }) {
  const model = useCatalogForm({ catalog, onSaved });
  return <CatalogFieldsDesk model={model} submitLabel={<Trans>Save changes</Trans>} />;
}

function CatalogShareDesk({ id, name }: { id: string; name: string }) {
  const share = useCatalogShare({ id, name });
  const Icon = share.copyOnly ? RiFileCopyLine : RiShareLine;
  return (
    <Button variant="outline" size="icon" aria-label={share.label} onClick={share.activate}>
      <Icon aria-hidden="true" />
    </Button>
  );
}

function CatalogMembersDesk({
  catalogId,
  kind,
  canEdit,
}: {
  catalogId: string;
  kind: CatalogKind;
  canEdit: boolean;
}) {
  const { t } = useLingui();
  const [adding, setAdding] = useState(false);
  const { query, items, empty, remove, removeItem } = useCatalogMembers(catalogId, kind);
  return (
    <DeskSection
      title={kind === "pool" ? <Trans>Pools</Trans> : <Trans>Vouchers</Trans>}
      action={
        canEdit ? (
          <Button type="button" variant="outline" onClick={() => setAdding(true)}>
            <RiAddLine aria-hidden="true" />
            {kind === "pool" ? <Trans>Add a pool</Trans> : <Trans>Add a voucher</Trans>}
          </Button>
        ) : null
      }
    >
      {query.isPending ? (
        <DeskRowList>
          {[0, 1].map((index) => (
            <div key={index} className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">
              <Skeleton className="size-[34px]" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </DeskRowList>
      ) : query.isError ? (
        <div className="grid justify-items-start gap-2">
          <p role="alert" className="text-sm">
            <Trans>Couldn't load catalog items.</Trans>
          </p>
          <Button variant="outline" pending={query.isFetching} onClick={() => void query.refetch()}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : empty ? (
        <p className="text-sm text-muted-foreground">
          {kind === "pool" ? <Trans>No pools yet.</Trans> : <Trans>No vouchers yet.</Trans>}
        </p>
      ) : (
        <div className="grid gap-2">
          <DeskRowList>
            {items.map((item) => {
              const contents = (
                <>
                  {item.imageUrl ? (
                    <span className="relative flex size-[34px] shrink-0 overflow-hidden border border-border">
                      <ProgressiveImage
                        src={item.imageUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    </span>
                  ) : (
                    <MarketAvatar
                      name={item.name}
                      seed={item.address}
                      kind={kind === "pool" ? "pool" : "voucher"}
                    />
                  )}
                  <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {item.name}
                  </span>
                </>
              );
              const linkClass = "flex min-w-0 flex-1 items-center gap-3 hover:underline";
              return (
                <div
                  key={item.id}
                  className="flex min-h-14 min-w-0 items-center gap-3 px-3.5 py-2.5"
                >
                  {kind === "pool" ? (
                    <Link
                      to="/pools/$poolAddress"
                      params={{ poolAddress: item.address }}
                      className={linkClass}
                    >
                      {contents}
                    </Link>
                  ) : (
                    <Link
                      to="/vouchers/$voucherAddress"
                      params={{ voucherAddress: item.address }}
                      className={linkClass}
                    >
                      {contents}
                    </Link>
                  )}
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      aria-label={t`Remove ${item.name}`}
                      disabled={remove.isPending}
                      pending={remove.isPending && remove.variables?.resourceId === item.id}
                      onClick={() => void removeItem(item.id)}
                    >
                      <Trans>Remove</Trans>
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </DeskRowList>
          {query.hasNextPage ? (
            <Button
              variant="outline"
              className="w-full"
              pending={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? <Trans>Loading…</Trans> : <Trans>Load more</Trans>}
            </Button>
          ) : null}
        </div>
      )}
      {canEdit ? (
        <CatalogMemberPickerDesk
          catalogId={catalogId}
          kind={kind}
          open={adding}
          onOpenChange={setAdding}
        />
      ) : null}
    </DeskSection>
  );
}
