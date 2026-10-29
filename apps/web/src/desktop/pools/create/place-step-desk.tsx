import { TERMS_TEXT_MAX } from "@clc/core/lib/contact";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { PublicContactWarning } from "#/components/public-contact-warning";
import { PublicLocationWarning } from "#/components/public-location-warning";
import { Button } from "#/components/ui/button";
import { Field, FieldError } from "#/components/ui/field";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { MarkdownEditor } from "#/components/ui/markdown-editor";
import { DeskPhoneField } from "#/desktop/ui/phone-field";
import { Switch } from "#/components/ui/switch";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { DeskTitle } from "#/desktop/ui/page";
import { cn } from "#/lib/utils";
import { isStorageConfigured } from "#/lib/api/storage";
import { translateValidationError } from "#/lib/validation-i18n";
import {
  CreatePoolFormFoot,
  type CreatePoolController,
  FIELDS_CLEAR_OF_FOOT,
} from "./create-pool-parts";

/** Step 2: logo, location, tags, contact and terms. */
export function PlaceStepDesk({ pool }: { pool: CreatePoolController }) {
  const { i18n, t } = useLingui();
  const { form, validators, tagsQuery } = pool;

  return (
    <div className={cn("@container grid min-w-0 content-start gap-[18px]", FIELDS_CLEAR_OF_FOOT)}>
      <DeskTitle>
        <Trans>Location and tags</Trans>
      </DeskTitle>

      {isStorageConfigured ? (
        <form.Field name="imageUrl">
          {(field) => (
            <ImageUploadField
              label={t`Logo`}
              hint={t`Optional`}
              purpose="pool.image"
              value={field.state.value || null}
              onChange={(url) => field.handleChange(url ?? "")}
              onBusyChange={pool.setLogoBusy}
              disabled={pool.deployPool.isPending}
            />
          )}
        </form.Field>
      ) : null}

      <div className="grid gap-2">
        <form.Field name="location" validators={validators.location}>
          {(field) => {
            const error = getFieldError(field.state.meta.errors);
            return (
              <LocationPicker
                label={t`Location`}
                value={field.state.value}
                onChange={(value) => field.handleChange(value)}
                markerResource="pool"
                error={error ? translateValidationError(error, i18n) : undefined}
              />
            );
          }}
        </form.Field>
        <PublicLocationWarning />
      </div>

      <form.Field name="tags">
        {(field) => (
          <div className="grid gap-1.5">
            <span className="font-medium text-sm">
              <Trans>Tags</Trans>
            </span>
            {tagsQuery.isPending ? (
              <p className="text-muted-foreground text-xs">
                <Trans>Loading tags…</Trans>
              </p>
            ) : null}
            {tagsQuery.isError ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-destructive text-xs">
                  <Trans>Couldn't load pool tags.</Trans>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  pending={tagsQuery.isFetching}
                  onClick={() => void tagsQuery.refetch()}
                >
                  <Trans>Retry</Trans>
                </Button>
              </div>
            ) : null}
            {tagsQuery.data?.length ? (
              <TagCombobox
                items={tagsQuery.data}
                value={field.state.value}
                onValueChange={field.handleChange}
                searchLabel={t`Search pool tags`}
                selectedLabel={t`Selected pool tags`}
                listLabel={t`Pool tags`}
                placeholder={t`Search tags`}
                removeLabel={(tag) => t`Remove ${tag}`}
              />
            ) : null}
          </div>
        )}
      </form.Field>

      <PublicContactWarning />

      <div className="grid grid-cols-1 items-start gap-[18px] @min-[30rem]:grid-cols-2 @min-[30rem]:gap-4">
        <form.Field name="email" validators={validators.email}>
          {(field) => (
            <Field
              label={t`Contact email`}
              htmlFor="pool-email"
              error={getFieldError(field.state.meta.errors)}
            >
              <Input
                id="pool-email"
                dir="ltr"
                type="email"
                autoComplete="email"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder="you@example.com"
                aria-invalid={field.state.meta.errors.length > 0}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="phone" validators={validators.phone}>
          {(field) => (
            <Field
              label={t`Contact phone`}
              htmlFor="pool-phone"
              error={getFieldError(field.state.meta.errors)}
            >
              <DeskPhoneField
                id="pool-phone"
                value={field.state.value}
                onChange={(value) => field.handleChange(value)}
                invalid={field.state.meta.errors.length > 0}
              />
            </Field>
          )}
        </form.Field>
      </div>

      <form.Field name="website" validators={validators.website}>
        {(field) => (
          <Field
            label={t`Contact website`}
            htmlFor="pool-website"
            error={getFieldError(field.state.meta.errors)}
          >
            <Input
              id="pool-website"
              dir="ltr"
              type="url"
              inputMode="url"
              autoComplete="url"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              placeholder="https://example.com"
              aria-invalid={field.state.meta.errors.length > 0}
            />
          </Field>
        )}
      </form.Field>

      <form.Field name="termsMode">
        {(modeField) => (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-sm">
                <Trans>Terms</Trans>
              </span>
              <label className="flex items-center gap-2 text-muted-foreground text-xs">
                <Trans>Write my own</Trans>
                <Switch
                  checked={modeField.state.value === "text"}
                  onCheckedChange={(checked) => {
                    modeField.handleChange(checked ? "text" : "url");
                    form.setFieldValue("terms", "");
                  }}
                />
              </label>
            </div>
            {modeField.state.value === "text" ? (
              <form.Field name="terms" validators={validators.termsText}>
                {(field) => {
                  const error = getFieldError(field.state.meta.errors);
                  return (
                    <div className="grid gap-1.5">
                      <label
                        id="pool-terms-text-label"
                        htmlFor="pool-terms-text"
                        className="text-muted-foreground text-xs"
                      >
                        <Trans>Shown to anyone joining this pool</Trans>
                      </label>
                      <MarkdownEditor
                        id="pool-terms-text"
                        aria-labelledby="pool-terms-text-label"
                        aria-invalid={field.state.meta.errors.length > 0}
                        maxLength={TERMS_TEXT_MAX}
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        placeholder={t`Describe the rules for joining and using this pool...`}
                      />
                      {error ? <FieldError error={error} /> : null}
                    </div>
                  );
                }}
              </form.Field>
            ) : (
              <form.Field name="terms" validators={validators.termsUrl}>
                {(field) => {
                  const error = getFieldError(field.state.meta.errors);
                  return (
                    <div>
                      <Input
                        id="pool-terms-url"
                        dir="ltr"
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        aria-label={t`Terms URL`}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        placeholder="https://example.com/terms"
                        aria-invalid={field.state.meta.errors.length > 0}
                      />
                      {error ? <FieldError error={error} /> : null}
                    </div>
                  );
                }}
              </form.Field>
            )}
          </div>
        )}
      </form.Field>

      <CreatePoolFormFoot>
        <Button asChild variant="outline">
          <Link to="/pools/create/$step" params={{ step: "pool" }}>
            <Trans>Back</Trans>
          </Link>
        </Button>
        <Button type="button" pending={pool.logoBusy} onClick={() => void pool.goToReview()}>
          {pool.logoBusy ? <Trans>Uploading…</Trans> : <Trans>Next</Trans>}
        </Button>
      </CreatePoolFormFoot>
    </div>
  );
}
