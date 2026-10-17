import { ResourceUsage } from "#/components/resource-usage";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { CatalogRow } from "#/components/catalogs/catalog-row";
import { useMyCatalog } from "#/features/catalogs/hooks/use-my-catalog";

export function MyCatalogSection() {
  const query = useMyCatalog();
  const usage = useResourceUsage();
  return (
    <section aria-labelledby="my-catalog-title" className="space-y-2">
      <SectionHeading id="my-catalog-title">
        <Trans>My catalogs</Trans>
      </SectionHeading>
      {query.isPending ? (
        <p role="status">
          <Trans>Loading…</Trans>
        </p>
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
      ) : (
        <>
          {query.catalogs.map((catalog) => (
            <CatalogRow key={catalog.id} catalog={catalog} />
          ))}
          <ResourceUsage resource="catalogs" />
          <Button
            asChild={!!usage.data?.catalogs.canCreate && !usage.isError}
            disabled={!usage.data?.catalogs.canCreate || usage.isError}
            variant="outline"
            tap
            className="w-full"
          >
            {usage.data?.catalogs.canCreate && !usage.isError ? (
              <Link to="/catalogs/create">
                <Trans>Create catalog</Trans>
              </Link>
            ) : (
              <span>
                <Trans>Create catalog</Trans>
              </span>
            )}
          </Button>
        </>
      )}
    </section>
  );
}
