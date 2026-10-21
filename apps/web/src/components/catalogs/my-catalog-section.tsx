import { ResourceLimitMessage, ResourceQuotaTitle } from "#/components/resource-usage";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { CatalogRow } from "#/components/catalogs/catalog-row";
import { RESOURCE_HUE, RESOURCE_ICON, RESOURCE_OUTLINE } from "#/components/resource-tone";
import { cn } from "#/lib/utils";
import { useMyCatalog } from "#/features/catalogs/hooks/use-my-catalog";
import { ListSkeleton } from "#/components/ui/list-skeleton";

export function MyCatalogSection({
  usage: providedUsage,
  search = "",
}: {
  usage?: ReturnType<typeof useResourceUsage>;
  /** The Wallet's search, lowercased: only catalogs it names show, with nothing to create. */
  search?: string;
} = {}) {
  const query = useMyCatalog();
  const catalogs =
    search === ""
      ? query.catalogs
      : query.catalogs.filter((catalog) => catalog.name.toLocaleLowerCase().includes(search));
  const localUsage = useResourceUsage(providedUsage === undefined);
  const usage = providedUsage ?? localUsage;
  const create = (
    <Button
      asChild={!!usage.data?.catalogs.canCreate && !usage.isError}
      disabled={!usage.data?.catalogs.canCreate || usage.isError}
      variant="outline"
      tap
      className={cn("w-full", RESOURCE_HUE.catalogs, RESOURCE_OUTLINE)}
    >
      {usage.data?.catalogs.canCreate && !usage.isError ? (
        <Link to="/catalogs/create">
          <RESOURCE_ICON.catalogs aria-hidden="true" />
          <Trans>Create catalog</Trans>
        </Link>
      ) : (
        <span>
          <RESOURCE_ICON.catalogs aria-hidden="true" />
          <Trans>Create catalog</Trans>
        </span>
      )}
    </Button>
  );
  if (search !== "" && query.isSuccess && catalogs.length === 0) return null;
  return (
    <section aria-labelledby="my-catalog-title" className="space-y-2">
      <SectionHeading id="my-catalog-title">
        <ResourceQuotaTitle
          quota={usage.data?.catalogs}
          pending={usage.isPending}
          error={usage.isError}
        >
          <Trans>My Catalogs</Trans>
        </ResourceQuotaTitle>
      </SectionHeading>
      {query.isPending ? (
        <ListSkeleton shape="cards" count={1} label={<Trans>Loading…</Trans>} />
      ) : query.isError ? (
        <div className="space-y-2 border border-border bg-card p-3">
          <p>
            <Trans>Couldn't load catalogs.</Trans>
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
      ) : query.catalogs.length === 0 ? (
        // The same empty card as My Vouchers and My Pools, so the three read
        // as one set on the Wallet.
        <div className="border border-border bg-card">
          <div className="space-y-3 p-3">
            <p className="text-muted-foreground text-sm">
              <Trans>You haven't created a catalog yet.</Trans>
            </p>
            <ResourceLimitMessage quota={usage.data?.catalogs} />
            {create}
          </div>
        </div>
      ) : (
        <>
          {catalogs.map((catalog) => (
            <CatalogRow key={catalog.id} catalog={catalog} />
          ))}
          {search === "" ? (
            <>
              <ResourceLimitMessage quota={usage.data?.catalogs} />
              {create}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
