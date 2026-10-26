import { saveCatalogMutationOptions } from "@clc/api/features/catalogs/queries";
import { catalogWriteSchema, type Catalog } from "@clc/core/features/catalogs/logic";
import type { LocationInput } from "@clc/core/features/location/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { Button } from "#/components/ui/button";
import { PublicLocationWarning } from "#/components/public-location-warning";
import { Field } from "#/components/ui/field";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { LocationPicker } from "#/components/ui/location-picker";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { useTokenTags } from "#/hooks/use-deployment";
import { catalogsClient } from "#/lib/api/catalogs";
import { isStorageConfigured } from "#/lib/api/storage";
import { translateValidationError } from "#/lib/validation-i18n";
import { BackendApiError } from "@clc/api/client/errors";

type Place = Omit<LocationInput, "country">;
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

export function CatalogForm({
  catalog,
  initialPlace,
  onSaved,
}: {
  catalog?: Catalog;
  initialPlace?: Place;
  onSaved: (catalog: Catalog) => void | Promise<void>;
}) {
  const { t, i18n } = useLingui();
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
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => (
          <Field
            label={t`Name`}
            htmlFor="catalog-name"
            error={getFieldError(field.state.meta.errors)}
          >
            <Input
              id="catalog-name"
              dir="auto"
              className="bg-card"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-invalid={field.state.meta.errors.length > 0}
            />
          </Field>
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <Field
            label={t`Description`}
            htmlFor="catalog-description"
            error={getFieldError(field.state.meta.errors)}
          >
            <Textarea
              id="catalog-description"
              dir="auto"
              className="min-h-28 bg-card"
              maxLength={500}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-invalid={field.state.meta.errors.length > 0}
            />
          </Field>
        )}
      </form.Field>
      <form.Field name="imageUrl">
        {(field) => (
          <ImageUploadField
            label={t`Catalog picture`}
            purpose="catalog.image"
            value={field.state.value || null}
            onChange={(url) => field.handleChange(url ?? "")}
            onBusyChange={setImageBusy}
            disabled={!isStorageConfigured || save.isPending}
          />
        )}
      </form.Field>
      <form.Field name="tags">
        {(field) => (
          <Field
            label={t`Tags`}
            htmlFor="catalog-tags"
            error={getFieldError(field.state.meta.errors)}
          >
            <TagCombobox
              items={tagsQuery.data ?? []}
              value={field.state.value}
              onValueChange={field.handleChange}
              searchLabel={t`Search or add tags`}
              selectedLabel={t`Selected tags`}
              listLabel={t`Available tags`}
              placeholder={t`Add tags`}
              removeLabel={(tag) => t`Remove ${tag}`}
            />
          </Field>
        )}
      </form.Field>
      <form.Field name="location">
        {(field) => {
          const error = getFieldError(field.state.meta.errors);
          return (
            <LocationPicker
              value={field.state.value}
              onChange={field.handleChange}
              markerResource="catalog"
              error={error ? translateValidationError(error, i18n) : undefined}
            />
          );
        }}
      </form.Field>
      <PublicLocationWarning />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => [state.isSubmitting]}>
        {([submitting]) => (
          <Button
            type="submit"
            tap
            className="w-full"
            disabled={imageBusy}
            pending={submitting || save.isPending}
          >
            {submitting ? (
              <Trans>Saving…</Trans>
            ) : catalog ? (
              <Trans>Save changes</Trans>
            ) : (
              <Trans>Create catalog</Trans>
            )}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
