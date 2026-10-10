import { catalogsInfiniteQueryOptions } from "@clc/api/features/catalogs/queries";
import { formatDistance } from "@clc/core/lib/geo/distance";
import type { Catalog } from "@clc/core/features/catalogs/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CatalogRow } from "#/components/catalogs/catalog-row";
import { Button } from "#/components/ui/button";
import { BackChevron } from "#/components/wallet";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { catalogsClient } from "#/lib/api/catalogs";

/** Resolve discovery once, before issuing list requests or displaying old rows. */
export function CatalogsPage() {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const profile = useAuthProfile({ enabled: auth.isAuthenticated });
  const lat = profile.data?.geoLat;
  const lng = profile.data?.geoLng;
  let content;
  if (auth.isLoading || (auth.isAuthenticated && profile.isPending))
    content = (
      <p role="status">
        <Trans>Loading…</Trans>
      </p>
    );
  else if (auth.state === "sessionCheckError" || (auth.isAuthenticated && profile.isError))
    content = (
      <div className="space-y-3">
        <p>
          <Trans>We couldn't load your profile.</Trans>
        </p>
        <Button
          className="h-11"
          onClick={() => {
            auth.retry();
            if (auth.isAuthenticated) void profile.refetch();
          }}
        >
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  else if (
    auth.isAuthenticated &&
    (lat == null ||
      lng == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180)
  )
    content = (
      <div className="space-y-3">
        <p>
          <Trans>Choose a location</Trans>
        </p>
        <Button asChild className="h-11">
          <Link to="/settings/profile">
            <Trans>Edit profile</Trans>
          </Link>
        </Button>
      </div>
    );
  else {
    const scope = auth.isAuthenticated
      ? `${auth.session?.address.toLowerCase()}:${lat}:${lng}:1000`
      : undefined;
    content = <CatalogList key={scope ?? "public"} scope={scope} />;
  }
  return (
    <div className="min-h-[100svh] space-y-5 bg-background px-6 pt-6 pb-bottom-nav">
      <BackChevron label={t`Wallet`} to="/" search={{ tab: "wallet" }} />
      <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
        <Trans>Catalogs</Trans>
      </h1>
      {content}
    </div>
  );
}

function CatalogList({ scope }: { scope?: string }) {
  const query = useInfiniteQuery(catalogsInfiniteQueryOptions(catalogsClient, scope));
  return (
    <div className="space-y-3">
      {scope ? (
        <p className="text-sm text-muted-foreground">
          <Trans>Showing results within 1,000 km of your saved profile location.</Trans>
        </p>
      ) : null}
      {query.isPending ? (
        <p role="status">
          <Trans>Loading…</Trans>
        </p>
      ) : null}
      {query.isError ? (
        <div className="space-y-2">
          <p role="alert">
            <Trans>Couldn't load catalogs.</Trans>
          </p>
          <Button variant="outline" className="h-11 bg-card" onClick={() => void query.refetch()}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      {query.isSuccess && !query.data.pages.some((page) => page.catalogs.length) ? (
        <p>
          <Trans>No catalogs found.</Trans>
        </p>
      ) : null}
      {query.data?.pages
        .flatMap((page) => page.catalogs)
        .map((catalog) => (
          <CatalogDistanceRow key={catalog.id} catalog={catalog} />
        ))}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          className="h-11 w-full bg-card"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </div>
  );
}

function CatalogDistanceRow({ catalog }: { catalog: Catalog }) {
  const { i18n, t } = useLingui();
  let label: string | undefined;
  if (catalog.distanceMeters !== null) {
    const display = formatDistance(catalog.distanceMeters);
    const value = new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale, {
      minimumFractionDigits: display.fractionDigits,
      maximumFractionDigits: display.fractionDigits,
    }).format(display.value);
    label = display.unit === "m" ? t`${value} m` : t`${value} km`;
  }
  return <CatalogRow catalog={catalog} distanceLabel={label} />;
}
