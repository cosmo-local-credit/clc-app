import {
  catalogMemberMutationOptions,
  catalogMembershipQueryOptions,
} from "@clc/api/features/catalogs/queries";
import type { CatalogCreateIntent } from "@clc/core/features/catalogs/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { useMyCatalog } from "#/features/catalogs/hooks/use-my-catalog";
import { catalogsClient } from "#/lib/api/catalogs";

export function AddToCatalogButton({ kind, resourceId, address }: CatalogCreateIntent) {
  const { t } = useLingui();
  const mine = useMyCatalog();
  const owner = mine.auth.session?.address ?? "";
  const membership = useQuery(
    catalogMembershipQueryOptions(
      catalogsClient,
      mine.auth.isAuthenticated ? owner : "",
      mine.catalog?.id ?? "",
      kind,
      resourceId,
    ),
  );
  const mutation = useMutation(
    catalogMemberMutationOptions(catalogsClient, useQueryClient(), owner),
  );
  if (!mine.auth.isAuthenticated) return null;
  if (mine.isError || membership.isError)
    return (
      <Button
        variant="outline"
        className="h-11 bg-card"
        onClick={() => {
          void mine.refetch();
          if (mine.catalog) void membership.refetch();
        }}
      >
        <Trans>Retry</Trans>
      </Button>
    );
  if (mine.isSuccess && !mine.catalog)
    return (
      <Button asChild variant="outline" className="h-11 bg-card">
        <Link to="/catalogs/create" search={{ kind, resourceId, address }}>
          <Trans>Add to catalog</Trans>
        </Link>
      </Button>
    );
  return (
    <Button
      variant="outline"
      className="h-11 bg-card"
      disabled={
        mine.isPending || membership.isPending || mutation.isPending || membership.data?.added
      }
      onClick={async () => {
        if (!mine.catalog) return;
        try {
          await mutation.mutateAsync({ catalogId: mine.catalog.id, kind, resourceId, added: true });
          toast.success(t`Added to catalog`);
        } catch {
          toast.error(t`Couldn't update the catalog. Try again.`);
        }
      }}
    >
      {membership.data?.added ? (
        <Trans>Added to catalog</Trans>
      ) : mutation.isPending ? (
        <Trans>Saving…</Trans>
      ) : (
        <Trans>Add to catalog</Trans>
      )}
    </Button>
  );
}
