import { catalogDetailQueryOptions } from "@clc/api/features/catalogs/queries";
import { useQuery } from "@tanstack/react-query";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { catalogsClient } from "#/lib/api/catalogs";

/** A catalog and whether the signed-in account owns it. */
export function useCatalogDetail(id: string) {
  const auth = useAuthStatus();
  const query = useQuery({ ...catalogDetailQueryOptions(catalogsClient, id), retry: false });
  const catalog = query.data;
  const viewerAddress = auth.isAuthenticated ? auth.session?.address : undefined;
  const owner = Boolean(
    viewerAddress && catalog?.ownerAddress.toLowerCase() === viewerAddress.toLowerCase(),
  );
  return { query, catalog, owner };
}
