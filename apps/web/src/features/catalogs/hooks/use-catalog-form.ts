import { BackendApiError } from "@clc/api/client/errors";
import { saveCatalogMutationOptions } from "@clc/api/features/catalogs/queries";
import { catalogWriteSchema, type Catalog } from "@clc/core/features/catalogs/logic";
import type { LocationInput } from "@clc/core/features/location/logic";
import { isHttpUrl } from "@clc/core/lib/contact";
import { useForm } from "@clc/core/lib/forms";
import { useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useTokenTags } from "#/hooks/use-deployment";
import { catalogsClient } from "#/lib/api/catalogs";
import { useViewDraft } from "#/lib/view-drafts";

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

type CatalogFormValues = z.input<typeof formSchema>;

/**
 * Keep completed image URLs and removals along with the written fields. Local
 * upload previews never leave the view that owns the upload.
 */
type CatalogDraft = Omit<CatalogFormValues, "imageUrl"> &
  Pick<Partial<CatalogFormValues>, "imageUrl">;

function catalogDraftOf(values: CatalogFormValues): CatalogDraft {
  const { imageUrl, ...fields } = values;
  return imageUrl == null || imageUrl === "" || isHttpUrl(imageUrl)
    ? { ...fields, imageUrl }
    : fields;
}

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
  const { address: account } = useAuthStatus();
  const viewDraft = useViewDraft<CatalogDraft>({
    scope: catalog ? `catalog-edit:${catalog.id}` : "catalog-create",
    account,
  });
  const restored = viewDraft.restored;
  const defaultValues: CatalogFormValues = {
    name: catalog?.name ?? "",
    description: catalog?.description ?? "",
    imageUrl: catalog?.imageUrl ?? "",
    tags: catalog?.tags ?? [],
    location: catalog
      ? { lat: catalog.geoLat, lng: catalog.geoLng, locationName: catalog.locationName }
      : initialPlace,
  };
  // The form as it opened, before anyone has typed: the draft is only kept
  // while the fields differ from this.
  const [opened] = useState(() => JSON.stringify(catalogDraftOf(defaultValues)));
  const form = useForm({
    // What was typed in the other view goes on top of the loaded catalog.
    defaultValues: restored ? { ...defaultValues, ...restored } : defaultValues,
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
        viewDraft.clear();
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
  const { save: saveViewDraft, clear: clearViewDraft } = viewDraft;
  useEffect(() => {
    let seen: unknown;
    const sync = () => {
      const { values } = form.store.state;
      // Submitting and validating also touch the store; only a changed value
      // may write, or a cleared draft would come straight back.
      if (values === seen) return;
      seen = values;
      const fields = catalogDraftOf(values);
      if (JSON.stringify(fields) === opened) clearViewDraft();
      else saveViewDraft(fields);
    };
    sync();
    const subscription = form.store.subscribe(sync);
    return () => subscription.unsubscribe();
  }, [clearViewDraft, form, opened, saveViewDraft]);
  return { form, save, imageBusy, setImageBusy, error, tagOptions: tagsQuery.data ?? [] };
}
