import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiBookOpenLine } from "react-icons/ri";

import { PublicLocationWarning } from "#/components/public-location-warning";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import type { useCatalogForm } from "#/features/catalogs/hooks/use-catalog-form";
import { isStorageConfigured } from "#/lib/api/storage";
import { translateValidationError } from "#/lib/validation-i18n";
import { cn } from "#/lib/utils";

type CatalogFormModel = ReturnType<typeof useCatalogForm>;

/**
 * The catalog form on desktop: Name, Description, Catalog picture, Tags and
 * the location, then the submit at the end of a ruled foot.
 */
export function CatalogFieldsDesk({
  model,
  submitLabel,
  title,
}: {
  model: CatalogFormModel;
  submitLabel: ReactNode;
  title?: ReactNode;
}) {
  const { t, i18n } = useLingui();
  const { form, save, imageBusy, setImageBusy, error, tagOptions } = model;
  return (
    <form
      className="grid min-w-0 content-start gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {title}
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
              className="min-h-24 bg-card"
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
          const fieldError = getFieldError(field.state.meta.errors);
          return (
            <LocationPicker
              value={field.state.value}
              onChange={field.handleChange}
              markerResource="catalog"
              error={fieldError ? translateValidationError(fieldError, i18n) : undefined}
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
      <div className="flex justify-end border-border border-t pt-4">
        <form.Subscribe selector={(state) => [state.isSubmitting]}>
          {([submitting]) => (
            <Button type="submit" disabled={imageBusy} pending={submitting || save.isPending}>
              {submitting ? <Trans>Saving…</Trans> : submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}

/** The catalog's square mark: its picture, or the book on the catalog colour. */
export function CatalogMarkDesk({
  url,
  size = "md",
}: {
  url: string | null | undefined;
  size?: "md" | "lg";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden",
        size === "lg" ? "size-14" : "size-[34px]",
        url ? "border border-border bg-card" : "bg-catalog text-white",
      )}
    >
      {url ? (
        <ProgressiveImage src={url} alt="" className="size-full object-cover" />
      ) : (
        <RiBookOpenLine className={size === "lg" ? "size-6" : "size-4"} />
      )}
    </span>
  );
}

/** The Catalogs row the form produces, live. */
export function CatalogPreviewDesk({ model }: { model: CatalogFormModel }) {
  const { t } = useLingui();
  return (
    <model.form.Subscribe selector={(state) => state.values}>
      {(values) => (
        <div className="flex min-h-14 min-w-0 items-center gap-3 border border-border bg-card px-3.5 py-2.5">
          <CatalogMarkDesk url={values.imageUrl || null} />
          <div className="min-w-0 flex-1">
            <div dir="auto" className="truncate text-sm font-semibold">
              {values.name.trim() || t`Catalog`}
            </div>
            {values.description ? (
              <div dir="auto" className="truncate text-xs text-muted-foreground">
                {values.description}
              </div>
            ) : values.location ? (
              <div dir="auto" className="truncate text-xs text-muted-foreground">
                {values.location.locationName}
              </div>
            ) : null}
          </div>
          {values.tags[0] ? (
            <Badge variant="outline" size="sm">
              {values.tags[0]}
            </Badge>
          ) : null}
        </div>
      )}
    </model.form.Subscribe>
  );
}
