import { tokenTagsQueryOptions } from "@clc/api/features/deployments/queries";
import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { voucherProfileTextSchema } from "@clc/core/features/vouchers/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ImageUploadField } from "#/components/admin/image-upload-field";
import { LocationField } from "#/components/admin/location-field";
import { SectionLabel } from "#/components/admin/section-heading";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { clcApi } from "#/lib/api";
import { isStorageConfigured } from "#/lib/storage";

import { useUpdateVoucherProfile } from "../use-update-voucher-profile";
import { UnitOfAccountCombobox } from "./unit-of-account-combobox";

const optionalStoredImageSchema = z
  .string()
  .refine((value) => value === "" || /^https?:\/\//.test(value), {
    message: "The image must be an http(s) URL",
  });

/**
 * The text fields are the product's shared profile rules, so a voucher cannot be
 * edited here into a state the owner's own editor or the publish form would
 * reject. Images and the pin are this console's additions.
 */
const profileSchema = voucherProfileTextSchema
  .extend({
    // Uploaded before they reach the form, so the only rule left is the one the
    // catalog column enforces: a URL or nothing.
    iconUrl: optionalStoredImageSchema,
    bannerUrl: optionalStoredImageSchema,
    locationName: z.string().trim().max(200, { message: "Location name is too long" }),
    latitude: z.string(),
    longitude: z.string(),
    tags: z.array(z.string()),
  })
  .superRefine((value, ctx) => {
    // A label with no pin, or a pin with no label, describes a place nobody can
    // point at. clc-core rejects the pair and vouchers_geo_valid backstops it, so
    // catching it here is only about naming the field before a round trip.
    const hasPin = value.latitude !== "" && value.longitude !== "";
    if (hasPin === (value.locationName !== "")) return;

    ctx.addIssue({
      code: "custom",
      path: hasPin ? ["locationName"] : ["latitude"],
      message: hasPin ? "Name the place this pin marks" : "Click the map to place this voucher",
    });
  });

/**
 * The edit surface for a voucher's own catalog record.
 *
 * It relays a `PUT /admin/vouchers/:address/profile`, whose response is the saved
 * catalog row, so the screen behind the sheet updates from what the backend
 * stored rather than from what was typed.
 *
 * Offerings are a different resource on a different endpoint and have their own
 * sheet — see `offering-editor-sheet.tsx`. They used to be a second branch here,
 * which is how that half sat unsaveable for as long as it did.
 *
 * The display name is catalog metadata. It changes the public label only; the
 * deployed ERC20 name remains readable on the record card and never reaches this
 * form. Symbol, decimals and owner follow the same chain-derived rule. So does
 * `active` — retiring a voucher is a different operation from correcting its
 * prose, and folding the two together would let a description edit hide a voucher
 * by accident.
 */
export function EditVoucherSheet({
  open,
  voucher,
  onClose,
}: {
  open: boolean;
  voucher: MarketVoucherDetail;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="bg-card w-full shadow-none data-[side=right]:sm:max-w-[32rem]"
        showCloseButton
      >
        <SheetHeader className="border-b">
          <SheetTitle>Edit voucher</SheetTitle>
          <SheetDescription>{voucher.name}</SheetDescription>
        </SheetHeader>
        {/* Keyed on the address so reopening the sheet on another voucher
            rebuilds the form: TanStack Form reads defaultValues once, and a
            reused instance would show the previous record's values. */}
        <VoucherForm key={voucher.address} voucher={voucher} onClose={onClose} />
      </SheetContent>
    </Sheet>
  );
}

function VoucherForm({ voucher, onClose }: { voucher: MarketVoucherDetail; onClose: () => void }) {
  const tokenTags = useQuery(tokenTagsQueryOptions(clcApi.deployments));
  const update = useUpdateVoucherProfile(voucher.address);

  const form = useForm({
    defaultValues: {
      displayName: voucher.name,
      description: voucher.description ?? "",
      voucherUoa: voucher.voucherUoa ?? "",
      voucherValue: voucher.voucherValue ?? "",
      email: voucher.email ?? "",
      website: voucher.website ?? "",
      phone: voucher.phone ?? "",
      terms: voucher.terms ?? "",
      iconUrl: voucher.iconUrl ?? "",
      bannerUrl: voucher.bannerUrl ?? "",
      locationName: voucher.locationName ?? "",
      latitude: voucher.lat === null ? "" : String(voucher.lat),
      longitude: voucher.lng === null ? "" : String(voucher.lng),
      tags: voucher.tags,
    },
    // Both, matching the publish form. On submit alone a rejected field blocks
    // the save with nothing on screen to say which one — the operator clicks
    // Save and watches nothing happen.
    validators: { onChange: profileSchema, onSubmit: profileSchema },
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync({
          // `name` is the effective label, not proof that an override exists.
          // Do not turn an ordinary metadata save into a redundant override;
          // only send this compatibility field after the operator changes it.
          ...(value.displayName === voucher.name ? {} : { displayName: value.displayName }),
          description: value.description,
          voucherUoa: value.voucherUoa,
          voucherValue: value.voucherValue === "" ? null : Number(value.voucherValue),
          email: value.email,
          website: value.website,
          phone: value.phone,
          terms: value.terms,
          // Unlike every other field here, these preserve on omission — so they
          // are sent only when the operator changed one. "" is how this endpoint
          // removes an image; omitting it would leave the stored one in place.
          ...(value.iconUrl === (voucher.iconUrl ?? "") ? {} : { iconUrl: value.iconUrl }),
          ...(value.bannerUrl === (voucher.bannerUrl ?? "") ? {} : { bannerUrl: value.bannerUrl }),
          locationName: value.locationName,
          // Sent as a pair or not at all, which is the rule the database holds.
          geoLat: value.latitude === "" ? null : Number(value.latitude),
          geoLng: value.longitude === "" ? null : Number(value.longitude),
          tags: value.tags,
        });
        toast.success("Voucher record updated.");
        onClose();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the changes.");
      }
    },
  });

  /**
   * Closing with unsaved edits asks first. A save in flight is left alone:
   * cancelling mid-request would leave the operator unsure whether it landed.
   */
  function requestClose() {
    if (update.isPending) return;
    if (form.state.isDirty && !window.confirm("Discard unsaved changes?")) return;
    form.reset();
    onClose();
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <form.Field name="displayName">
          {(field) => (
            <Field
              htmlFor={field.name}
              label="Display name"
              hint="The public catalog label. It does not change the deployed contract name."
              error={getFieldError(field.state.meta.errors)}
            >
              <Input
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="description">
          {(field) => (
            <Field
              htmlFor={field.name}
              label="Description"
              error={getFieldError(field.state.meta.errors)}
            >
              <Textarea
                id={field.name}
                rows={3}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Field>
          )}
        </form.Field>

        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <form.Field name="voucherUoa">
              {(field) => (
                <Field
                  htmlFor={field.name}
                  label="Unit of account"
                  hint="What this voucher is priced in, for example KES."
                  error={getFieldError(field.state.meta.errors)}
                >
                  <UnitOfAccountCombobox
                    id={field.name}
                    value={field.state.value}
                    onValueChange={field.handleChange}
                  />
                </Field>
              )}
            </form.Field>
          </div>

          <form.Field name="voucherValue">
            {(field) => (
              <Field
                htmlFor={field.name}
                label="Value per unit"
                error={getFieldError(field.state.meta.errors)}
              >
                <Input
                  id={field.name}
                  inputMode="decimal"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  className="font-data w-32"
                />
              </Field>
            )}
          </form.Field>
        </div>

        <div className="border-border flex flex-col gap-4 border-t pt-4">
          <SectionLabel>Issuer contact</SectionLabel>

          <form.Field name="email">
            {(field) => (
              <Field
                htmlFor={field.name}
                label="Email address"
                error={getFieldError(field.state.meta.errors)}
              >
                <Input
                  id={field.name}
                  type="email"
                  inputMode="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="phone">
            {(field) => (
              <Field
                htmlFor={field.name}
                label="Phone number"
                hint="Include the country code, for example +254700000000"
                error={getFieldError(field.state.meta.errors)}
              >
                <Input
                  id={field.name}
                  inputMode="tel"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  className="font-data"
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="website">
            {(field) => (
              <Field
                htmlFor={field.name}
                label="Website"
                error={getFieldError(field.state.meta.errors)}
              >
                <Input
                  id={field.name}
                  inputMode="url"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="terms">
            {(field) => (
              <Field
                htmlFor={field.name}
                label="Terms"
                hint="A link to the terms, or the terms themselves written as Markdown."
                error={getFieldError(field.state.meta.errors)}
              >
                <Textarea
                  id={field.name}
                  rows={3}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}
                />
              </Field>
            )}
          </form.Field>
        </div>

        {isStorageConfigured ? (
          <div className="border-border flex flex-col gap-4 border-t pt-4">
            <SectionLabel>Images</SectionLabel>
            <form.Field name="iconUrl">
              {(field) => (
                <ImageUploadField
                  label="Icon"
                  hint="Square. Stored at 400px."
                  purpose="voucher.icon"
                  value={field.state.value === "" ? null : field.state.value}
                  onChange={(url) => field.handleChange(url ?? "")}
                  disabled={update.isPending}
                />
              )}
            </form.Field>
            <form.Field name="bannerUrl">
              {(field) => (
                <ImageUploadField
                  label="Banner"
                  hint="Wide. Stored at 1280px."
                  purpose="voucher.banner"
                  value={field.state.value === "" ? null : field.state.value}
                  onChange={(url) => field.handleChange(url ?? "")}
                  disabled={update.isPending}
                />
              )}
            </form.Field>
          </div>
        ) : null}

        <div className="border-border flex flex-col gap-4 border-t pt-4">
          <SectionLabel>Location</SectionLabel>
          <form.Field name="locationName">
            {(nameField) => (
              <form.Field name="latitude">
                {(latitudeField) => (
                  <form.Field name="longitude">
                    {(longitudeField) => (
                      <LocationField
                        name={nameField.state.value}
                        latitude={latitudeField.state.value}
                        longitude={longitudeField.state.value}
                        nameError={getFieldError(nameField.state.meta.errors)}
                        coordinateError={getFieldError(latitudeField.state.meta.errors)}
                        onNameChange={nameField.handleChange}
                        onNameBlur={nameField.handleBlur}
                        onCoordinatesChange={(nextLatitude, nextLongitude) => {
                          latitudeField.handleChange(nextLatitude);
                          longitudeField.handleChange(nextLongitude);
                        }}
                      />
                    )}
                  </form.Field>
                )}
              </form.Field>
            )}
          </form.Field>
        </div>

        <div className="border-border flex flex-col gap-4 border-t pt-4">
          <SectionLabel>Tags</SectionLabel>
          <form.Field name="tags">
            {(field) => (
              <Field
                htmlFor="voucher-tags"
                label="Voucher tags"
                error={getFieldError(field.state.meta.errors)}
              >
                {tokenTags.isPending ? (
                  <p className="text-muted-foreground text-sm">Loading tags…</p>
                ) : tokenTags.isError ? (
                  <p className="text-destructive text-sm">Could not load the tag list.</p>
                ) : (
                  <TagCombobox
                    items={tokenTags.data ?? []}
                    value={field.state.value}
                    onValueChange={field.handleChange}
                    searchLabel="Search voucher tags"
                    selectedLabel="Selected voucher tags"
                    listLabel="Voucher tags"
                    placeholder="Search tags"
                    removeLabel={(tag) => `Remove ${tag}`}
                  />
                )}
              </Field>
            )}
          </form.Field>
        </div>
      </div>

      <SheetFooter className="border-border sticky bottom-0 flex-row justify-end border-t">
        <Button type="button" variant="ghost" onClick={requestClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </SheetFooter>
    </form>
  );
}

/**
 * `htmlFor` is passed rather than inferred: one of these fields wraps a combobox
 * whose id belongs to an input inside it, and a Label with no target leaves the
 * control with no accessible name at all.
 */
function Field({
  htmlFor,
  label,
  hint,
  error,
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
