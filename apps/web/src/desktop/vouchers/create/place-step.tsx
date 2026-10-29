import { locationSchema } from "@clc/core/features/location/logic";
import { resolveMarkerStyle } from "@clc/core/features/markers/logic";
import {
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalTermsTextSchema,
  optionalTermsUrlSchema,
  optionalWebsiteSchema,
  TERMS_TEXT_MAX,
} from "@clc/core/lib/contact";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { Field, FieldError } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { MarkdownEditor } from "#/components/ui/markdown-editor";
import { Switch } from "#/components/ui/switch";
import { DeskTitle } from "#/desktop/ui/page";
import { isStorageConfigured } from "#/lib/api/storage";
import { translateValidationError } from "#/lib/validation-i18n";
import { DeskLocationField } from "./desk-location-field";
import { DeskLogoField } from "./desk-logo-field";
import { DeskPhoneField } from "#/desktop/ui/phone-field";
import { DeskPinPicker } from "./desk-pin-picker";
import { DeskTagField } from "./desk-tag-field";
import { FormFoot, type VoucherWizard } from "./wizard-bits";

/** Step 2, Location and tags: logo, place, pin, tags, contact and terms. */
export function PlaceStep({ wizard }: { wizard: VoucherWizard }) {
  const { i18n, t } = useLingui();
  const { form, tagsQuery } = wizard;
  const publishing = wizard.deployVoucher.isPending;
  return (
    <>
      <DeskTitle>
        <Trans>Location and tags</Trans>
      </DeskTitle>

      {isStorageConfigured ? (
        <form.Field name="iconUrl">
          {(field) => (
            <div className="grid gap-1.5">
              <label htmlFor="voucher-logo" className="flex items-baseline gap-1.5">
                <span className="text-sm font-medium">
                  <Trans>Logo</Trans>
                </span>
                <span className="text-xs text-muted-foreground">
                  <Trans>Optional</Trans>
                </span>
              </label>
              <DeskLogoField
                id="voucher-logo"
                purpose="voucher.icon"
                value={field.state.value || null}
                onChange={(url) => field.handleChange(url ?? "")}
                onBusyChange={wizard.setIconBusy}
                disabled={publishing}
              />
            </div>
          )}
        </form.Field>
      ) : null}

      <form.Field name="location" validators={{ onSubmit: locationSchema }}>
        {(field) => {
          const error = getFieldError(field.state.meta.errors);
          return (
            <form.Subscribe
              selector={(state) => [state.values.markerIcon, state.values.markerColor] as const}
            >
              {([markerIcon, markerColor]) => (
                <DeskLocationField
                  value={field.state.value}
                  onChange={(value) => field.handleChange(value)}
                  error={error ? translateValidationError(error, i18n) : undefined}
                  markerStyle={resolveMarkerStyle({ kind: "voucher", markerIcon, markerColor })}
                />
              )}
            </form.Subscribe>
          );
        }}
      </form.Field>

      <form.Subscribe selector={(state) => state.values.markerIcon}>
        {(icon) => (
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">
              <Trans>Map pin</Trans>
            </p>
            <DeskPinPicker
              value={icon}
              onChange={(next) => form.setFieldValue("markerIcon", next)}
              disabled={publishing}
            />
          </div>
        )}
      </form.Subscribe>

      <form.Field name="tags">
        {(field) => (
          <div className="grid gap-1.5">
            <label htmlFor="voucher-tags" className="text-sm font-medium">
              <Trans>Tags</Trans>
            </label>
            {tagsQuery.isPending ? (
              <p className="text-xs text-muted-foreground">
                <Trans>Loading tags…</Trans>
              </p>
            ) : null}
            {tagsQuery.isError ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-destructive">
                  <Trans>Couldn't load voucher tags.</Trans>
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
              <DeskTagField
                id="voucher-tags"
                items={tagsQuery.data}
                value={field.state.value}
                onValueChange={field.handleChange}
              />
            ) : null}
          </div>
        )}
      </form.Field>

      <p className="border border-border border-s-[3px] border-s-warning bg-card px-4 py-3 text-xs">
        <Trans>
          Contact details entered here are visible to signed-in users. Map pins and coordinates stay
          public. Your profile contact details stay private unless you choose to add or share them.
        </Trans>
      </p>

      <form.Field
        name="email"
        validators={{ onBlur: optionalEmailSchema, onSubmit: optionalEmailSchema }}
      >
        {(field) => (
          <Field
            label={t`Contact email`}
            htmlFor="voucher-email"
            error={getFieldError(field.state.meta.errors)}
          >
            <Input
              id="voucher-email"
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

      <form.Field
        name="phone"
        validators={{ onBlur: optionalPhoneSchema, onSubmit: optionalPhoneSchema }}
      >
        {(field) => (
          <Field
            label={t`Contact phone`}
            htmlFor="voucher-phone"
            error={getFieldError(field.state.meta.errors)}
          >
            <DeskPhoneField
              id="voucher-phone"
              defaultCountry={wizard.profile?.country}
              value={field.state.value}
              onChange={(value) => field.handleChange(value)}
              invalid={field.state.meta.errors.length > 0}
            />
          </Field>
        )}
      </form.Field>

      <form.Field
        name="website"
        validators={{ onBlur: optionalWebsiteSchema, onSubmit: optionalWebsiteSchema }}
      >
        {(field) => (
          <Field
            label={t`Contact website`}
            htmlFor="voucher-website"
            error={getFieldError(field.state.meta.errors)}
          >
            <Input
              id="voucher-website"
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
            <p className="text-sm font-medium">
              <Trans>Terms</Trans>
            </p>
            <label className="flex w-fit items-center gap-2 text-sm">
              <Switch
                checked={modeField.state.value === "text"}
                onCheckedChange={(checked) => {
                  modeField.handleChange(checked ? "text" : "url");
                  // A link and a body of text are different things; one does
                  // not become the other by flipping the switch.
                  form.setFieldValue("terms", "");
                }}
              />
              <Trans>Write my own</Trans>
            </label>
            {modeField.state.value === "text" ? (
              <form.Field
                name="terms"
                validators={{ onBlur: optionalTermsTextSchema, onSubmit: optionalTermsTextSchema }}
              >
                {(field) => {
                  const error = getFieldError(field.state.meta.errors);
                  return (
                    <div className="grid gap-1">
                      <MarkdownEditor
                        id="voucher-terms-text"
                        aria-labelledby="voucher-terms-text-label"
                        aria-invalid={field.state.meta.errors.length > 0}
                        maxLength={TERMS_TEXT_MAX}
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        placeholder={t`Redeemable at our stall on market days...`}
                      />
                      {error ? <FieldError error={error} /> : null}
                      {/* `htmlFor` alone does not name a `contentEditable`, so the
                          editor points back at this line by id. */}
                      <label
                        id="voucher-terms-text-label"
                        htmlFor="voucher-terms-text"
                        className="text-xs text-muted-foreground"
                      >
                        <Trans>Shown to anyone holding this voucher</Trans>
                      </label>
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
                    <div>
                      <Input
                        id="voucher-terms-url"
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

      <FormFoot>
        <Button variant="outline" asChild>
          <Link to="/vouchers/create/$step" params={{ step: "voucher" }}>
            <Trans>Back</Trans>
          </Link>
        </Button>
        <Button type="button" pending={wizard.iconBusy} onClick={() => void wizard.goToReview()}>
          {wizard.iconBusy ? <Trans>Uploading…</Trans> : <Trans>Next</Trans>}
        </Button>
      </FormFoot>
    </>
  );
}
