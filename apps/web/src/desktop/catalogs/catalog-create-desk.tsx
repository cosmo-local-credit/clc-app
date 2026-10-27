import type { Catalog, CatalogCreateIntent } from "@clc/core/features/catalogs/logic";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ResourceUsage } from "#/components/resource-usage";
import { Button } from "#/components/ui/button";
import { DeskCanvas, DeskEyebrow, DeskTitle } from "#/desktop/ui/page";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useCatalogCreate } from "#/features/catalogs/hooks/use-catalog-create";
import { type CatalogPlace, useCatalogForm } from "#/features/catalogs/hooks/use-catalog-form";
import { CatalogFieldsDesk, CatalogPreviewDesk } from "./catalog-fields-desk";

/** Create catalog: the form in a 560px column, the live Catalogs row beside it. */
export function CatalogCreateDesk({ intent }: { intent?: CatalogCreateIntent }) {
  const auth = useAuthStatus();
  return <CatalogCreateContent key={auth.session?.address ?? "guest"} intent={intent} />;
}

function CatalogCreateContent({ intent }: { intent?: CatalogCreateIntent }) {
  const { mine, usage, profile, member, catalog, failed, finish, place } = useCatalogCreate(intent);
  const title = (
    <DeskTitle>
      <Trans>Create catalog</Trans>
    </DeskTitle>
  );

  if (mine.isPending || profile.isPending || usage.isPending) {
    return (
      <CreateFrame>
        {title}
        <p role="status" className="text-sm text-muted-foreground">
          <Trans>Loading…</Trans>
        </p>
      </CreateFrame>
    );
  }
  if (mine.isError || usage.isError) {
    return (
      <CreateFrame>
        {title}
        <p className="text-sm">
          <Trans>Couldn't load catalogs.</Trans>
        </p>
        <div>
          <Button
            onClick={() => {
              void mine.refetch();
              void usage.refetch();
            }}
            pending={mine.isFetching || usage.isFetching}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      </CreateFrame>
    );
  }
  if (catalog) {
    return (
      <CreateFrame>
        {title}
        <p className="text-sm">
          <Trans>You already have a catalog.</Trans>
        </p>
        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            <Trans>Catalog saved. The item couldn't be added. Try again.</Trans>
          </p>
        ) : null}
        <div className="flex gap-2">
          {intent ? (
            <Button pending={member.isPending} onClick={() => void finish(catalog)}>
              <Trans>Add to catalog</Trans>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/catalogs/$catalogId" params={{ catalogId: catalog.id }}>
              <Trans>My catalog</Trans>
            </Link>
          </Button>
        </div>
      </CreateFrame>
    );
  }
  const others =
    mine.catalogs.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {mine.catalogs.map((item) => (
          <Button key={item.id} asChild variant="outline">
            <Link to="/catalogs/$catalogId" params={{ catalogId: item.id }}>
              {item.name}
            </Link>
          </Button>
        ))}
      </div>
    ) : null;
  if (usage.data?.catalogs.canCreate) {
    return (
      <CatalogCreateForm place={place} onSaved={finish} title={title}>
        {others}
      </CatalogCreateForm>
    );
  }
  return (
    <CreateFrame>
      {title}
      <ResourceUsage resource="catalogs" count={false} />
      {others}
    </CreateFrame>
  );
}

function CreateFrame({ children }: { children: ReactNode }) {
  return (
    <DeskCanvas className="max-w-[1164px] grid-cols-[minmax(0,560px)]">
      <div className="grid min-w-0 content-start gap-4">{children}</div>
    </DeskCanvas>
  );
}

function CatalogCreateForm({
  place,
  onSaved,
  title,
  children,
}: {
  place?: CatalogPlace;
  onSaved: (catalog: Catalog) => Promise<void>;
  title: ReactNode;
  children: ReactNode;
}) {
  const model = useCatalogForm({ initialPlace: place, onSaved });
  return (
    <DeskCanvas className="max-w-[1164px] grid-cols-[minmax(0,560px)_minmax(0,1fr)] items-start gap-x-8">
      <div className="grid min-w-0 content-start gap-4">
        <CatalogFieldsDesk
          model={model}
          title={title}
          submitLabel={<Trans>Create catalog</Trans>}
        />
        {children}
      </div>
      <aside className="sticky top-7 grid min-w-0 content-start gap-2.5">
        <DeskEyebrow>
          <Trans>Preview · Catalogs</Trans>
        </DeskEyebrow>
        <CatalogPreviewDesk model={model} />
      </aside>
    </DeskCanvas>
  );
}
