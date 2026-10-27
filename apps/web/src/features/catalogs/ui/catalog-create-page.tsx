import { ResourceUsage } from "#/components/resource-usage";
import type { CatalogCreateIntent } from "@clc/core/features/catalogs/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { BackChevron } from "#/components/wallet";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useCatalogCreate } from "../hooks/use-catalog-create";
import { CatalogForm } from "./catalog-form";

export function CatalogCreatePage({ intent }: { intent?: CatalogCreateIntent }) {
  const auth = useAuthStatus();
  return <CatalogCreateContent key={auth.session?.address ?? "guest"} intent={intent} />;
}

function CatalogCreateContent({ intent }: { intent?: CatalogCreateIntent }) {
  const { t } = useLingui();
  const { mine, usage, profile, member, catalog, failed, finish, place } = useCatalogCreate(intent);
  return (
    <div className="min-h-[100svh] space-y-5 bg-background px-6 pt-6 pb-12">
      <BackChevron label={t`Wallet`} to="/" search={{ tab: "wallet" }} />
      <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
        <Trans>Create catalog</Trans>
      </h1>
      {mine.isPending || profile.isPending || usage.isPending ? (
        <p role="status">
          <Trans>Loading…</Trans>
        </p>
      ) : mine.isError || usage.isError ? (
        <>
          <p>
            <Trans>Couldn't load catalogs.</Trans>
          </p>
          <Button
            tap
            onClick={() => {
              void mine.refetch();
              void usage.refetch();
            }}
            pending={mine.isFetching || usage.isFetching}
          >
            <Trans>Retry</Trans>
          </Button>
        </>
      ) : catalog ? (
        <div className="space-y-3">
          <p>
            <Trans>You already have a catalog.</Trans>
          </p>
          {failed ? (
            <p role="alert">
              <Trans>Catalog saved. The item couldn't be added. Try again.</Trans>
            </p>
          ) : null}
          {intent ? (
            <Button tap pending={member.isPending} onClick={() => void finish(catalog)}>
              <Trans>Add to catalog</Trans>
            </Button>
          ) : null}
          <Button asChild variant="outline" tap>
            <Link to="/catalogs/$catalogId" params={{ catalogId: catalog.id }}>
              <Trans>My catalog</Trans>
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <ResourceUsage resource="catalogs" count={false} />
          {usage.data?.catalogs.canCreate && <CatalogForm initialPlace={place} onSaved={finish} />}
          {mine.catalogs.map((item) => (
            <Button key={item.id} asChild variant="outline" tap>
              <Link to="/catalogs/$catalogId" params={{ catalogId: item.id }}>
                {item.name}
              </Link>
            </Button>
          ))}
        </>
      )}
    </div>
  );
}
