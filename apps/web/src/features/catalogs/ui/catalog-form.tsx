import type { Catalog } from "@clc/core/features/catalogs/logic";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "#/components/ui/button";
import { PublicLocationWarning } from "#/components/public-location-warning";
import { Field } from "#/components/ui/field";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { LocationPicker } from "#/components/ui/location-picker";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { isStorageConfigured } from "#/lib/api/storage";
import { translateValidationError } from "#/lib/validation-i18n";
import { type CatalogPlace, useCatalogForm } from "../hooks/use-catalog-form";

export function CatalogForm({
  catalog,
  initialPlace,
  onSaved,
}: {
  catalog?: Catalog;
  initialPlace?: CatalogPlace;
  onSaved: (catalog: Catalog) => void | Promise<void>;
}) {
  const { t, i18n } = useLingui();
  const { form, save, imageBusy, setImageBusy, error, tagOptions } = useCatalogForm({
    catalog,
    initialPlace,
    onSaved,
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
              items={tagOptions}
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
