import { catalogMemberMutationOptions } from "@clc/api/features/catalogs/queries";
import type { Catalog, CatalogCreateIntent } from "@clc/core/features/catalogs/logic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { catalogsClient } from "#/lib/api/catalogs";
import { useMyCatalog } from "./use-my-catalog";

/**
 * Create catalog: what it loads, the profile place the form starts from, and
 * `finish`, which adds the intended pool or voucher and moves on.
 */
export function useCatalogCreate(intent?: CatalogCreateIntent) {
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
  return { mine, usage, profile, member, catalog: saved, failed, finish, place };
}
