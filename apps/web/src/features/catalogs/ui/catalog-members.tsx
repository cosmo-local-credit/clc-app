import type { CatalogKind } from "@clc/core/features/catalogs/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { RiAddLine } from "react-icons/ri";
import { CatalogPicture } from "#/components/catalogs/catalog-row";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { useCatalogMembers } from "../hooks/use-catalog-members";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { CatalogMemberPicker } from "./catalog-member-picker";

export function CatalogMembers({
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
    <section className="space-y-3" aria-labelledby={`catalog-${kind}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading id={`catalog-${kind}-title`}>
          {kind === "pool" ? <Trans>Pools</Trans> : <Trans>Vouchers</Trans>}
        </SectionHeading>
        {canEdit ? (
          <Button type="button" variant="outline" tap onClick={() => setAdding(true)}>
            <RiAddLine aria-hidden="true" />
            {kind === "pool" ? <Trans>Add a pool</Trans> : <Trans>Add a voucher</Trans>}
          </Button>
        ) : null}
      </div>
      {query.isPending ? <ListSkeleton count={3} label={<Trans>Loading…</Trans>} /> : null}
      {query.isError ? (
        <div className="space-y-2">
          <p role="alert">
            <Trans>Couldn't load catalog items.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      {empty ? (
        <p className="text-sm text-muted-foreground">
          {kind === "pool" ? <Trans>No pools yet.</Trans> : <Trans>No vouchers yet.</Trans>}
        </p>
      ) : null}
      {items.map((item) => {
        const contents = (
          <>
            <CatalogPicture url={item.imageUrl} />
            <span dir="auto" className="min-w-0 break-words font-medium">
              {item.name}
            </span>
          </>
        );
        return (
          <div key={item.id} className="flex items-center gap-2 border border-border bg-card p-3">
            {kind === "pool" ? (
              <Link
                to="/pools/$poolAddress"
                params={{ poolAddress: item.address }}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                {contents}
              </Link>
            ) : (
              <Link
                to="/vouchers/$voucherAddress"
                params={{ voucherAddress: item.address }}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                {contents}
              </Link>
            )}
            {canEdit ? (
              <Button
                variant="outline"
                tap
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
      {query.hasNextPage ? (
        <Button
          variant="outline"
          tap
          className="w-full"
          pending={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? <Trans>Loading…</Trans> : <Trans>Load more</Trans>}
        </Button>
      ) : null}
      {canEdit ? (
        <CatalogMemberPicker
          catalogId={catalogId}
          kind={kind}
          open={adding}
          onOpenChange={setAdding}
        />
      ) : null}
    </section>
  );
}
