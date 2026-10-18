import { useId, useState } from "react";
import {
  catalogMemberMutationOptions,
  catalogMembershipQueryOptions,
} from "@clc/api/features/catalogs/queries";
import type { CatalogCreateIntent } from "@clc/core/features/catalogs/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { useMyCatalog } from "#/features/catalogs/hooks/use-my-catalog";
import { catalogsClient } from "#/lib/api/catalogs";

type AddToCatalogButtonProps = CatalogCreateIntent &
  Pick<ComponentProps<typeof Button>, "className" | "size" | "tap">;

export function AddToCatalogButton({
  kind,
  resourceId,
  address,
  className,
  size,
  tap,
}: AddToCatalogButtonProps) {
  const { t } = useLingui();
  const mine = useMyCatalog();
  const selectId = useId();
  const [selection, setSelection] = useState("");
  const catalog = mine.catalogs.find((item) => item.id === selection) ?? mine.catalogs[0];
  const owner = mine.auth.session?.address ?? "";
  const membership = useQuery(
    catalogMembershipQueryOptions(
      catalogsClient,
      mine.auth.isAuthenticated ? owner : "",
      catalog?.id ?? "",
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
        size={size}
        tap={tap}
        className={className}
        onClick={() => {
          void mine.refetch();
          if (catalog) void membership.refetch();
        }}
        pending={mine.isFetching || membership.isFetching}
      >
        <Trans>Retry</Trans>
      </Button>
    );
  if (mine.isSuccess && !catalog)
    return (
      <Button asChild variant="outline" size={size} tap={tap} className={className}>
        <Link to="/catalogs/create" search={{ kind, resourceId, address }}>
          <Trans>Add to catalog</Trans>
        </Link>
      </Button>
    );
  return (
    <div className="space-y-2">
      {mine.catalogs.length > 1 && (
        <Field label={t`Choose catalog`} htmlFor={selectId}>
          <select
            id={selectId}
            className="h-11 w-full border border-border bg-card px-3"
            value={catalog?.id ?? ""}
            onChange={(event) => setSelection(event.target.value)}
            disabled={mutation.isPending}
          >
            {mine.catalogs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Button
        variant="outline"
        size={size}
        tap={tap}
        className={className}
        disabled={mine.isPending || membership.isPending || membership.data?.added}
        pending={mutation.isPending}
        onClick={async () => {
          if (!catalog) return;
          try {
            await mutation.mutateAsync({ catalogId: catalog.id, kind, resourceId, added: true });
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
    </div>
  );
}
