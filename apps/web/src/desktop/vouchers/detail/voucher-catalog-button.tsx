import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { Address } from "viem";

import { Button } from "#/components/ui/button";
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from "#/components/ui/select";
import { useAddToCatalog } from "#/features/catalogs/hooks/use-add-to-catalog";

/**
 * "Add to catalog" in the title row. A viewer with several catalogs picks one
 * from a select beside the button; with none, it starts a catalog instead.
 */
export function VoucherCatalogButton({
  resourceId,
  address,
}: {
  resourceId: string;
  address: Address;
}) {
  const { t } = useLingui();
  const { mine, catalog, setSelection, membership, mutation, add, retry } = useAddToCatalog({
    kind: "voucher",
    resourceId,
  });
  if (!mine.auth.isAuthenticated) return null;
  if (mine.isError || membership.isError) {
    return (
      <Button variant="outline" pending={mine.isFetching || membership.isFetching} onClick={retry}>
        <Trans>Retry</Trans>
      </Button>
    );
  }
  if (mine.isSuccess && !catalog) {
    return (
      <Button asChild variant="outline">
        <Link to="/catalogs/create" search={{ kind: "voucher", resourceId, address }}>
          <Trans>Add to catalog</Trans>
        </Link>
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      {mine.catalogs.length > 1 ? (
        <SelectRoot
          value={catalog?.id ?? ""}
          onValueChange={(value) => setSelection(typeof value === "string" ? value : "")}
          disabled={mutation.isPending}
        >
          <SelectTrigger
            aria-label={t`Choose catalog`}
            className="max-w-44 border-foreground/25 text-xs font-medium"
          >
            <span className="min-w-0 truncate">{catalog?.name}</span>
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {mine.catalogs.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>
      ) : null}
      <Button
        variant="outline"
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
    </span>
  );
}
