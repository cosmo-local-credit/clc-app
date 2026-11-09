import {
  catalogMemberMutationOptions,
  catalogMembershipQueryOptions,
} from "@clc/api/features/catalogs/queries";
import type { CatalogCreateIntent } from "@clc/core/features/catalogs/logic";
import { useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { catalogsClient } from "#/lib/api/catalogs";

import { useMyCatalog } from "./use-my-catalog";

/**
 * Adding one resource to one of the viewer's catalogs: which catalog is
 * chosen, whether the resource is already in it, and the add itself.
 */
export function useAddToCatalog({ kind, resourceId }: Omit<CatalogCreateIntent, "address">) {
  const { t } = useLingui();
  const mine = useMyCatalog();
  const [selection, setSelection] = useState("");
  const catalog = mine.catalogs.find((item) => item.id === selection) ?? mine.catalogs[0];
  const owner = mine.auth.session?.address ?? "";
  const membership = useQuery(
    catalogMembershipQueryOptions(
      catalogsClient,
      mine.auth.isAuthenticated ? owner : "",
      catalog?.id ?? "",
      kind,
      resourceId,
    ),
  );
  const mutation = useMutation(
    catalogMemberMutationOptions(catalogsClient, useQueryClient(), owner),
  );

  async function add() {
    if (!catalog) return;
    try {
      await mutation.mutateAsync({ catalogId: catalog.id, kind, resourceId, added: true });
      toast.success(t`Added to catalog`);
    } catch {
      toast.error(t`Couldn't update the catalog. Try again.`);
    }
  }

  function retry() {
    void mine.refetch();
    if (catalog) void membership.refetch();
  }

  return { mine, catalog, setSelection, membership, mutation, add, retry };
}
