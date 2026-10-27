import type { UserPool } from "@clc/api/features/pools/client";
import {
  optionalTermsTextSchema,
  optionalTermsUrlSchema,
  TERMS_TEXT_MAX,
} from "@clc/core/lib/contact";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";

import { PublicContactWarning } from "#/components/public-contact-warning";
import { PublicLocationWarning } from "#/components/public-location-warning";
import { Button } from "#/components/ui/button";
import { Field, FieldError } from "#/components/ui/field";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { MarkdownEditor } from "#/components/ui/markdown-editor";
import { PhoneInputField } from "#/components/ui/phone-input";
import { Switch } from "#/components/ui/switch";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { UnitOfAccountCombobox } from "#/components/ui/unit-of-account-combobox";
import type { usePoolProfileForm } from "#/features/pools/hooks/use-pool-profile-form";
import { isStorageConfigured } from "#/lib/api/storage";
import { translateValidationError } from "#/lib/validation-i18n";

/**
 * The pool record's fields, stacked: the same set wherever the owner edits it.
 * Layout-neutral — the caller owns the surface, the scroll and the actions.
 */
export function PoolProfileFields({
  pool,
  profile,
}: {
  pool: UserPool;
  profile: ReturnType<typeof usePoolProfileForm>;
}) {
  const { t, i18n } = useLingui();
  const { form, update, tagsQuery, setImageBusy } = profile;
  return (
    <>
      <form.Field name="displayName">
        {(field) => (
          <Field
            label={t`Display name`}
            htmlFor="pool-display-name"
            error={getFieldError(field.state.meta.errors)}
          >
            <Input
              id="pool-display-name"
              value={field.state.value}
              maxLength={80}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={field.state.meta.errors.length > 0}
            />
          </Field>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <Field
            label={t`Pool Description`}
            htmlFor="pool-description"
            error={getFieldError(field.state.meta.errors)}
          >
            <Textarea
              id="pool-description"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              maxLength={500}
              aria-invalid={field.state.meta.errors.length > 0}
            />
          </Field>
        )}
      </form.Field>

      <form.Field name="unitOfAccount">
        {(field) => (
          <Field
            label={t`Priced in`}
            htmlFor="pool-currency"
            error={getFieldError(field.state.meta.errors)}
          >
            <UnitOfAccountCombobox
              id="pool-currency"
              value={field.state.value}
              onValueChange={field.handleChange}
              placeholder={t`Search units of account`}
              emptyMessage={t`No units of account found`}
              disabled={pool.quoterType === "oracle"}
            />
            {pool.quoterType === "oracle" ? (
              <p className="text-muted-foreground text-xs">
                <Trans>The unit of account is fixed by this pool's deployed oracle.</Trans>
              </p>
            ) : null}
          </Field>
        )}
      </form.Field>

      {isStorageConfigured ? (
        <form.Field name="imageUrl">
          {(field) => (
            <ImageUploadField
              label={t`Logo`}
              hint={t`Optional`}
              purpose="pool.image"
              value={field.state.value || null}
              onChange={(url) => field.handleChange(url ?? "")}
              onBusyChange={setImageBusy}
              disabled={update.isPending}
            />
          )}
        </form.Field>
      ) : null}

      <form.Field name="location">
        {(field) => {
          const error = getFieldError(field.state.meta.errors);
          return (
            <LocationPicker
              label={t`Pool Location`}
              value={field.state.value}
              onChange={(value) => field.handleChange(value)}
              markerResource="pool"
              error={error ? translateValidationError(error, i18n) : undefined}
            />
          );
        }}
      </form.Field>
      <PublicLocationWarning />

      <form.Field name="tags">
        {(field) => (
          <div>
            <p className="font-medium text-sm">
              <Trans>Tags</Trans>
            </p>
            {tagsQuery.isPending ? (
              <p className="mt-1.5 text-muted-foreground text-xs">
                <Trans>Loading tags…</Trans>
              </p>
            ) : null}
            {tagsQuery.isError ? (
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p className="text-destructive text-xs">
                  <Trans>Couldn't load pool tags.</Trans>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  tap
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

      <form.Field name="email">
        {(field) => (
          <Field
            label={t`Contact Email`}
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

      <form.Field name="website">
        {(field) => (
          <Field
            label={t`Contact Website`}
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

      <form.Field name="phone">
        {(field) => (
          <Field
            label={t`Contact Phone`}
            htmlFor="pool-phone"
            error={getFieldError(field.state.meta.errors)}
          >
            <PhoneInputField
              id="pool-phone"
              value={field.state.value}
              onChange={(value) => field.handleChange(value)}
              aria-invalid={field.state.meta.errors.length > 0}
            />
          </Field>
        )}
      </form.Field>

      <form.Field name="termsMode">
        {(modeField) => (
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-sm">
                <Trans>Terms</Trans>
              </p>
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
              <form.Field
                name="terms"
                validators={{
                  onBlur: optionalTermsTextSchema,
                  onSubmit: optionalTermsTextSchema,
                }}
              >
                {(field) => {
                  const error = getFieldError(field.state.meta.errors);
                  return (
                    <div className="mt-1.5">
                      {/* `htmlFor` alone does not name a `contentEditable`,
                        which is not a labelable element, so the editor is
                        pointed back at this label by id. */}
                      <label
                        id="pool-terms-text-label"
                        htmlFor="pool-terms-text"
                        className="mb-1.5 block text-muted-foreground text-xs"
                      >
                        <Trans>Shown to anyone using this pool</Trans>
                      </label>
                      <MarkdownEditor
                        id="pool-terms-text"
                        aria-labelledby="pool-terms-text-label"
                        aria-invalid={field.state.meta.errors.length > 0}
                        maxLength={TERMS_TEXT_MAX}
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        placeholder={t`Swaps settle within the market association...`}
                      />
                      {error ? <FieldError error={error} /> : null}
                    </div>
                  );
                }}
              </form.Field>
            ) : (
              <form.Field
                name="terms"
                validators={{ onBlur: optionalTermsUrlSchema, onSubmit: optionalTermsUrlSchema }}
              >
                {(field) => {
                  const error = getFieldError(field.state.meta.errors);
                  return (
                    <div className="mt-1.5">
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
    </>
  );
}
