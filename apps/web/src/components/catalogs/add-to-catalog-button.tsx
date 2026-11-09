import { useId } from "react";
import type { CatalogCreateIntent } from "@clc/core/features/catalogs/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { useAddToCatalog } from "#/features/catalogs/hooks/use-add-to-catalog";

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
  const selectId = useId();
  const { mine, catalog, setSelection, membership, mutation, add, retry } = useAddToCatalog({
    kind,
    resourceId,
  });
  if (!mine.auth.isAuthenticated) return null;
  if (mine.isError || membership.isError)
    return (
      <Button
        variant="outline"
        size={size}
        tap={tap}
        className={className}
        onClick={retry}
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
        onClick={() => void add()}
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
