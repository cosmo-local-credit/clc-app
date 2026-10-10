import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { CatalogRow } from "#/components/catalogs/catalog-row";
import { useMyCatalog } from "#/features/catalogs/hooks/use-my-catalog";

export function MyCatalogSection() {
  const query = useMyCatalog();
  return (
    <section aria-labelledby="my-catalog-title" className="space-y-2">
      <h2 id="my-catalog-title" className="font-heading text-base font-semibold">
        <Trans>My catalog</Trans>
      </h2>
      {query.isPending ? (
        <p role="status">
          <Trans>Loading…</Trans>
        </p>
      ) : query.isError ? (
        <div className="space-y-2 border border-border bg-card p-3">
          <p>
            <Trans>Couldn't load catalogs.</Trans>
          </p>
          <Button variant="outline" className="h-11 bg-card" onClick={() => void query.refetch()}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : query.catalog ? (
        <CatalogRow catalog={query.catalog} />
      ) : (
        <Button asChild variant="outline" className="h-11 w-full bg-card">
          <Link to="/catalogs/create">
            <Trans>Create catalog</Trans>
          </Link>
        </Button>
      )}
    </section>
  );
}
