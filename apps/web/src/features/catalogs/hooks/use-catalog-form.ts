import { BackendApiError } from "@clc/api/client/errors";
import { saveCatalogMutationOptions } from "@clc/api/features/catalogs/queries";
import { catalogWriteSchema, type Catalog } from "@clc/core/features/catalogs/logic";
import type { LocationInput } from "@clc/core/features/location/logic";
import { useForm } from "@clc/core/lib/forms";
import { useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";

import { useTokenTags } from "#/hooks/use-deployment";
import { catalogsClient } from "#/lib/api/catalogs";

export type CatalogPlace = Omit<LocationInput, "country">;

const formSchema = z.object({
  name: catalogWriteSchema.shape.name,
  description: catalogWriteSchema.shape.description,
  imageUrl: catalogWriteSchema.shape.imageUrl,
  tags: catalogWriteSchema.shape.tags,
  location: z
    .object({
      lat: catalogWriteSchema.shape.geoLat,
      lng: catalogWriteSchema.shape.geoLng,
      locationName: catalogWriteSchema.shape.locationName,
    })
    .optional()
    .refine((value): boolean => !!value, "Choose a location"),
});

/** Form state and save for creating or editing a catalog. */
export function useCatalogForm({
  catalog,
  initialPlace,
  onSaved,
}: {
  catalog?: Catalog;
  initialPlace?: CatalogPlace;
  onSaved: (catalog: Catalog) => void | Promise<void>;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const save = useMutation(saveCatalogMutationOptions(catalogsClient, queryClient, catalog?.id));
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tagsQuery = useTokenTags();
  const defaultValues: z.input<typeof formSchema> = {
    name: catalog?.name ?? "",
    description: catalog?.description ?? "",
    imageUrl: catalog?.imageUrl ?? "",
    tags: catalog?.tags ?? [],
    location: catalog
      ? { lat: catalog.geoLat, lng: catalog.geoLng, locationName: catalog.locationName }
      : initialPlace,
  };
  const form = useForm({
    defaultValues,
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      if (!value.location) return;
      setError(null);
      try {
        const saved = await save.mutateAsync({
          name: value.name,
          description: value.description,
          imageUrl: value.imageUrl,
          geoLat: value.location.lat,
          geoLng: value.location.lng,
          locationName: value.location.locationName,
          tags: value.tags,
        });
        await onSaved(saved);
      } catch (cause) {
        setError(
          cause instanceof BackendApiError && cause.code === "E11"
            ? t`Catalog limit reached. Ask an administrator to increase your allowance.`
            : t`Couldn't save the catalog. Try again.`,
        );
        if (cause instanceof BackendApiError && cause.code === "E11")
          await queryClient.invalidateQueries({ queryKey: ["clc", "catalogs", "mine"] });
      }
    },
  });
  return { form, save, imageBusy, setImageBusy, error, tagOptions: tagsQuery.data ?? [] };
}
