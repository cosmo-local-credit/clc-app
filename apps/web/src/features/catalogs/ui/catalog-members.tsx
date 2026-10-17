import {
  catalogMemberMutationOptions,
  catalogMembersQueryOptions,
} from "@clc/api/features/catalogs/queries";
import type { CatalogKind } from "@clc/core/features/catalogs/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CatalogPicture } from "#/components/catalogs/catalog-row";
import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { catalogsClient } from "#/lib/api/catalogs";

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
  const auth = useAuthStatus();
  const query = useInfiniteQuery(catalogMembersQueryOptions(catalogsClient, catalogId, kind));
  const remove = useMutation(
    catalogMemberMutationOptions(catalogsClient, useQueryClient(), auth.session?.address ?? ""),
  );
  return (
    <section className="space-y-3" aria-labelledby={`catalog-${kind}-title`}>
      <h2 id={`catalog-${kind}-title`} className="font-heading text-[1.375rem] font-semibold">
        {kind === "pool" ? <Trans>Pools</Trans> : <Trans>Vouchers</Trans>}
      </h2>
      {query.isPending ? (
        <p role="status">
          <Trans>Loading…</Trans>
        </p>
      ) : null}
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
      {query.isSuccess && !query.data.pages.some((page) => page.items.length) ? (
        <p className="text-sm text-muted-foreground">
          <Trans>No items yet. Add pools or vouchers from their detail pages.</Trans>
        </p>
      ) : null}
      {query.data?.pages
        .flatMap((page) => page.items)
        .map((item) => {
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
                  onClick={async () => {
                    try {
                      await remove.mutateAsync({
                        catalogId,
                        kind,
                        resourceId: item.id,
                        added: false,
                      });
                    } catch {
                      toast.error(t`Couldn't update the catalog. Try again.`);
                    }
                  }}
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
    </section>
  );
}
