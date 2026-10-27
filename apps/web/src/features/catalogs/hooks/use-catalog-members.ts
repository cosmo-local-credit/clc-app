import {
  catalogMemberMutationOptions,
  catalogMembersQueryOptions,
} from "@clc/api/features/catalogs/queries";
import type { CatalogKind } from "@clc/core/features/catalogs/logic";
import { useLingui } from "@lingui/react/macro";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { catalogsClient } from "#/lib/api/catalogs";

/** One kind of catalog member, paged, and the owner's Remove. */
export function useCatalogMembers(catalogId: string, kind: CatalogKind) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const query = useInfiniteQuery(catalogMembersQueryOptions(catalogsClient, catalogId, kind));
  const remove = useMutation(
    catalogMemberMutationOptions(catalogsClient, useQueryClient(), auth.session?.address ?? ""),
  );
  const removeItem = async (resourceId: string) => {
    try {
      await remove.mutateAsync({ catalogId, kind, resourceId, added: false });
    } catch {
      toast.error(t`Couldn't update the catalog. Try again.`);
    }
  };
  return {
    query,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
    empty: query.isSuccess && !query.data.pages.some((page) => page.items.length),
    remove,
    removeItem,
  };
}
