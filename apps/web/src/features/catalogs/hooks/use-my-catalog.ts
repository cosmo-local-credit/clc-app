import { myCatalogsQueryOptions } from "@clc/api/features/catalogs/queries";
import { useQuery } from "@tanstack/react-query";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { catalogsClient } from "#/lib/api/catalogs";

export function useMyCatalog() {
  const auth = useAuthStatus();
  const query = useQuery({
    ...myCatalogsQueryOptions(
      catalogsClient,
      auth.isAuthenticated ? (auth.session?.address ?? "") : "",
    ),
    retry: false,
  });
  return { ...query, catalog: query.data?.catalogs[0], auth };
}
