import { ResourceUsage } from "#/components/resource-usage";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { catalogMemberMutationOptions } from "@clc/api/features/catalogs/queries";
import type { Catalog, CatalogCreateIntent } from "@clc/core/features/catalogs/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { BackChevron } from "#/components/wallet";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { catalogsClient } from "#/lib/api/catalogs";
import { useMyCatalog } from "../hooks/use-my-catalog";
import { CatalogForm } from "./catalog-form";

export function CatalogCreatePage({ intent }: { intent?: CatalogCreateIntent }) {
  const auth = useAuthStatus();
  return <CatalogCreateContent key={auth.session?.address ?? "guest"} intent={intent} />;
}

function CatalogCreateContent({ intent }: { intent?: CatalogCreateIntent }) {
  const { t } = useLingui();
  const mine = useMyCatalog();
  const usage = useResourceUsage();
  const profile = useAuthProfile({ enabled: mine.auth.isAuthenticated });
  const navigate = useNavigate();
  const [saved, setSaved] = useState<Catalog | undefined>();
  const [failed, setFailed] = useState(false);
  const member = useMutation(
    catalogMemberMutationOptions(
      catalogsClient,
      useQueryClient(),
      mine.auth.session?.address ?? "",
    ),
  );
  const catalog = saved;

  async function finish(current: Catalog) {
    setSaved(current);
    if (intent) {
      try {
        await member.mutateAsync({
          catalogId: current.id,
          kind: intent.kind,
          resourceId: intent.resourceId,
          added: true,
        });
      } catch {
        setFailed(true);
        return;
      }
      if (intent.kind === "pool")
        await navigate({
          to: "/pools/$poolAddress",
          params: { poolAddress: intent.address },
          replace: true,
        });
      else
        await navigate({
          to: "/vouchers/$voucherAddress",
          params: { voucherAddress: intent.address },
          replace: true,
        });
    } else
      await navigate({
        to: "/catalogs/$catalogId",
        params: { catalogId: current.id },
        replace: true,
      });
  }
  const place =
    profile.data?.geoLat != null && profile.data.geoLng != null && profile.data.locationName
      ? {
          lat: profile.data.geoLat,
          lng: profile.data.geoLng,
          locationName: profile.data.locationName,
        }
      : undefined;
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
            className="h-11"
            onClick={() => {
              void mine.refetch();
              void usage.refetch();
            }}
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
            <Button
              className="h-11"
              disabled={member.isPending}
              onClick={() => void finish(catalog)}
            >
              <Trans>Add to catalog</Trans>
            </Button>
          ) : null}
          <Button asChild variant="outline" className="h-11 bg-card">
            <Link to="/catalogs/$catalogId" params={{ catalogId: catalog.id }}>
              <Trans>My catalog</Trans>
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <ResourceUsage resource="catalogs" />
          {usage.data?.catalogs.canCreate && <CatalogForm initialPlace={place} onSaved={finish} />}
          {mine.catalogs.map((item) => (
            <Button key={item.id} asChild variant="outline" className="h-11 bg-card">
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
