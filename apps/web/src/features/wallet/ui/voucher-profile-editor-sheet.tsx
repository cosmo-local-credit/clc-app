import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import type { LocationInput } from "@clc/core/features/location/logic";
import { voucherProfileTextSchema } from "@clc/core/features/vouchers/logic";
import {
  isHttpUrl,
  optionalTermsTextSchema,
  optionalTermsUrlSchema,
  VOUCHER_TERMS_TEXT_MAX,
} from "@clc/core/lib/contact";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "#/components/ui/button";
import { Field, FieldError } from "#/components/ui/field";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { MarkdownContent } from "#/components/ui/markdown-content";
import { PhoneInputField } from "#/components/ui/phone-input";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { Switch } from "#/components/ui/switch";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { Toggle } from "#/components/ui/toggle";
import { UnitOfAccountCombobox } from "#/components/ui/unit-of-account-combobox";
import { useTokenTags } from "#/hooks/use-deployment";
import { isStorageConfigured } from "#/lib/api/storage";
import { translateValidationError } from "#/lib/validation-i18n";

import { useUpdateVoucherProfile } from "../hooks/use-update-voucher-profile";

/** A stored place: the picker's country is never persisted, so it is not read back. */
type VoucherPlace = Pick<LocationInput, "lat" | "lng" | "locationName">;

const profileFormSchema = voucherProfileTextSchema.extend({
  iconUrl: z.string(),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      locationName: z.string().trim().min(1).max(200),
    })
    .or(z.undefined()),
  tags: z.array(z.string()),
  termsMode: z.enum(["url", "text"]),
});

/**
 * The owner's edit surface for their voucher's catalog record: every field the
 * create flow asked for, minus the chain facts a redeploy would be needed to
 * change. A bottom sheet over the Info tab, like the offering editor over the
 * Offerings tab, so the saved record lands where it is read.
 */
export function VoucherProfileEditorSheet({
  open,
  voucher,
  onClose,
}: {
  open: boolean;
  voucher: MarketVoucherDetail;
  onClose: () => void;
}) {
  return (
    <SheetRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border bg-background shadow-none">
          <SheetHeader>
            <SheetTitle className="font-heading text-base font-semibold">
              <Trans>Edit voucher details</Trans>
            </SheetTitle>
          </SheetHeader>
          {/* Mounted only while open so each visit reads the current record:
              TanStack Form takes defaultValues once. */}
          {open ? <VoucherProfileForm voucher={voucher} onClose={onClose} /> : null}
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function VoucherProfileForm({
  voucher,
  onClose,
}: {
  voucher: MarketVoucherDetail;
  onClose: () => void;
}) {
  const { t, i18n } = useLingui();
  const tagsQuery = useTokenTags();
  const update = useUpdateVoucherProfile(voucher.address);
  const [iconBusy, setIconBusy] = useState(false);
  const [termsPreview, setTermsPreview] = useState(false);
  const storedLocation: VoucherPlace | undefined =
    voucher.locationName !== null && voucher.lat !== null && voucher.lng !== null
      ? { locationName: voucher.locationName, lat: voucher.lat, lng: voucher.lng }
      : undefined;

  const form = useForm({
    defaultValues: {
      displayName: voucher.name,
      description: voucher.description ?? "",
      voucherUoa: voucher.voucherUoa ?? "",
      voucherValue: voucher.voucherValue ?? "",
      iconUrl: voucher.iconUrl ?? "",
      location: storedLocation,
      tags: voucher.tags,
      email: voucher.email ?? "",
      website: voucher.website ?? "",
      phone: voucher.phone ?? "",
      terms: voucher.terms ?? "",
      termsMode: (voucher.terms && !isHttpUrl(voucher.terms) ? "text" : "url") as "url" | "text",
    },
    validators: { onSubmit: profileFormSchema },
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync({
          // `name` is the effective label, not proof that an override exists, so
          // it is sent only once the owner has changed it.
          ...(value.displayName === voucher.name ? {} : { displayName: value.displayName }),
          description: value.description,
          voucherUoa: value.voucherUoa,
          voucherValue: value.voucherValue === "" ? null : Number(value.voucherValue),
          email: value.email,
          website: value.website,
          phone: value.phone,
          terms: value.terms,
          // Preserved on omission by clc-core, so sent only when it changed; ""
          // is how the stored logo is removed.
          ...(value.iconUrl === (voucher.iconUrl ?? "") ? {} : { iconUrl: value.iconUrl }),
          locationName: value.location?.locationName ?? "",
          geoLat: value.location?.lat ?? null,
          geoLng: value.location?.lng ?? null,
          tags: value.tags,
        });
        toast.success(t`Voucher details updated.`);
        onClose();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t`Couldn't save the voucher details.`);
      }
    },
  });

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        <form.Field name="displayName">
          {(field) => (
            <Field
              label={t`Display name`}
              htmlFor="voucher-display-name"
              hint={t`Changes how the voucher is shown. The deployed contract keeps its name.`}
              error={getFieldError(field.state.meta.errors)}
            >
              <Input
                id="voucher-display-name"
                value={field.state.value}
                maxLength={120}
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
              label={t`Voucher Description`}
              htmlFor="voucher-description"
              error={getFieldError(field.state.meta.errors)}
            >
              <Textarea
                id="voucher-description"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                maxLength={500}
                aria-invalid={field.state.meta.errors.length > 0}
              />
            </Field>
          )}
        </form.Field>

        <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-2.5">
          <form.Field name="voucherValue">
            {(field) => (
              <Field
                label={t`Price`}
                htmlFor="voucher-price"
                error={getFieldError(field.state.meta.errors)}
              >
                <Input
                  id="voucher-price"
                  inputMode="decimal"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="voucherUoa">
            {(field) => (
              <Field
                label={t`Priced in`}
                htmlFor="voucher-currency"
                error={getFieldError(field.state.meta.errors)}
              >
                <UnitOfAccountCombobox
                  id="voucher-currency"
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  placeholder={t`Search currencies`}
                  emptyMessage={t`No currencies found.`}
                />
              </Field>
            )}
          </form.Field>
        </div>

        {isStorageConfigured ? (
          <form.Field name="iconUrl">
            {(field) => (
              <ImageUploadField
                label={t`Logo`}
                hint={t`Optional`}
                purpose="voucher.icon"
                value={field.state.value || null}
                onChange={(url) => field.handleChange(url ?? "")}
                onBusyChange={setIconBusy}
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
                value={field.state.value}
                onChange={(value) => field.handleChange(value)}
                error={error ? translateValidationError(error, i18n) : undefined}
              />
            );
          }}
        </form.Field>

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
                    <Trans>Couldn't load voucher tags.</Trans>
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bg-card"
                    onClick={() => tagsQuery.refetch()}
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
                  searchLabel={t`Search voucher tags`}
                  selectedLabel={t`Selected voucher tags`}
                  listLabel={t`Voucher tags`}
                  placeholder={t`Search tags`}
                  removeLabel={(tag) => t`Remove ${tag}`}
                />
              ) : null}
            </div>
          )}
        </form.Field>

        <form.Field name="email">
          {(field) => (
            <Field
              label={t`Contact Email`}
              htmlFor="voucher-email"
              error={getFieldError(field.state.meta.errors)}
            >
              <Input
                id="voucher-email"
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
              htmlFor="voucher-website"
              error={getFieldError(field.state.meta.errors)}
            >
              <Input
                id="voucher-website"
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
              htmlFor="voucher-phone"
              error={getFieldError(field.state.meta.errors)}
            >
              <PhoneInputField
                id="voucher-phone"
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
                      setTermsPreview(false);
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
                  {(field) => (
                    <div className="mt-1.5">
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <label
                          htmlFor="voucher-terms-text"
                          className="text-muted-foreground text-xs"
                        >
                          <Trans>Shown to anyone holding this voucher</Trans>
                        </label>
                        <Toggle
                          variant="outline"
                          pressed={termsPreview}
                          onPressedChange={setTermsPreview}
                          aria-label={t`Preview`}
                        >
                          <Trans>Preview</Trans>
                        </Toggle>
                      </div>
                      {termsPreview ? (
                        <div className="min-h-24 border border-border bg-card p-3">
                          {field.state.value.trim() === "" ? (
                            <p className="text-muted-foreground text-sm">
                              <Trans>Nothing to preview yet.</Trans>
                            </p>
                          ) : (
                            <MarkdownContent>{field.state.value}</MarkdownContent>
                          )}
                        </div>
                      ) : (
                        <Textarea
                          id="voucher-terms-text"
                          rows={8}
                          maxLength={VOUCHER_TERMS_TEXT_MAX}
                          className="font-mono text-[0.8125rem]"
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                          placeholder={t`Redeemable at our stall on market days...`}
                          aria-invalid={field.state.meta.errors.length > 0}
                        />
                      )}
                      {getFieldError(field.state.meta.errors) ? (
                        <FieldError error={getFieldError(field.state.meta.errors) ?? ""} />
                      ) : (
                        <p className="mt-1 text-muted-foreground text-xs">
                          <Trans>Markdown: **bold**, # headings, - lists, [links](https://…)</Trans>
                        </p>
                      )}
                    </div>
                  )}
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
                          id="voucher-terms-url"
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
                        {error ? (
                          <FieldError error={error} />
                        ) : (
                          <p className="mt-1 text-muted-foreground text-xs">
                            <Trans>Link to the terms that apply to this voucher</Trans>
                          </p>
                        )}
                      </div>
                    );
                  }}
                </form.Field>
              )}
            </div>
          )}
        </form.Field>
      </div>

      <SheetFooter>
        <Button type="submit" className="h-11 w-full" disabled={update.isPending || iconBusy}>
          {iconBusy ? (
            <Trans>Uploading…</Trans>
          ) : update.isPending ? (
            <Trans>Saving…</Trans>
          ) : (
            <Trans>Save changes</Trans>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full bg-card"
          disabled={update.isPending}
          onClick={onClose}
        >
          <Trans>Cancel</Trans>
        </Button>
      </SheetFooter>
    </form>
  );
}
