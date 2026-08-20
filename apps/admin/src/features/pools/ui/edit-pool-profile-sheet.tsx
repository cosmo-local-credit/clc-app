import { tokenTagsQueryOptions } from "@clc/api/features/deployments/queries";
import type { UserPool } from "@clc/api/features/pools/client";
import { poolDescriptionSchema } from "@clc/core/features/pools/logic";
import {
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalTermsUrlSchema,
  optionalWebsiteSchema,
} from "@clc/core/lib/contact";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { SectionLabel } from "#/components/admin/section-heading";
import { LocationField } from "#/components/admin/location-field";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { clcApi } from "#/lib/api";

import { useUpdatePoolProfile } from "../use-update-pool-profile";

/**
 * Contact validation is the product's, not this screen's: the same optional
 * email, E.164 phone and URL rules apply here, in signup, and on a voucher's
 * issuer contact, and clc-core validates the same shapes on the way in.
 *
 * The description reuses the publish schema so a pool cannot be edited into a
 * state its own create form would have rejected.
 */
const profileSchema = z
  .object({
    description: poolDescriptionSchema.or(z.literal("")),
    unitOfAccount: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "" || /^[A-Z0-9]{2,16}$/.test(value), {
        message: "Use letters and numbers, for example KES",
      }),
    email: optionalEmailSchema,
    website: optionalWebsiteSchema,
    phone: optionalPhoneSchema,
    terms: optionalTermsUrlSchema,
    locationName: z.string().trim().max(200, { message: "Location name is too long" }),
    latitude: z.string(),
    longitude: z.string(),
    tags: z.array(z.string()),
  })
  .superRefine((value, ctx) => {
    // A label with no pin, or a pin with no label, describes a place nobody can
    // point at. clc-core rejects the pair and pools_geo_valid backstops it, so
    // catching it here is only about naming the field before a round trip.
    const hasPin = value.latitude !== "" && value.longitude !== "";
    if (hasPin === (value.locationName !== "")) return;

    ctx.addIssue({
      code: "custom",
      path: hasPin ? ["locationName"] : ["latitude"],
      message: hasPin ? "Name the place this pin marks" : "Click the map to place this pool",
    });
  });

/**
 * Edits to a pool's off-chain record, in a right-side sheet.
 *
 * Only the left half of the profile card is here — the catalog's half. Name,
 * symbol, decimals, the owner and every dependency address mirror SwapPool, and
 * an operator retyping one of those would produce a catalog that disagrees with
 * the chain while winning on every screen that reads it. Those change by
 * transacting; the endpoint does not accept them at all.
 *
 * Images are absent for a different reason: there is no upload contract yet, and
 * a control that cannot do anything is worse than its absence.
 */
export function EditPoolProfileSheet({
  pool,
  open,
  onClose,
}: {
  pool: UserPool;
  open: boolean;
  onClose: () => void;
}) {
  const tokenTags = useQuery(tokenTagsQueryOptions(clcApi.deployments));
  const update = useUpdatePoolProfile(pool.address);

  const form = useForm({
    defaultValues: {
      description: pool.description,
      unitOfAccount: pool.unitOfAccount ?? "",
      email: pool.email ?? "",
      website: pool.website ?? "",
      phone: pool.phone ?? "",
      terms: pool.terms ?? "",
      locationName: pool.locationName ?? "",
      latitude: pool.geoLat === null ? "" : String(pool.geoLat),
      longitude: pool.geoLng === null ? "" : String(pool.geoLng),
      tags: pool.tags,
    },
    // Both, matching the publish form. On submit alone a rejected field blocks
    // the save with nothing on screen to say which one — the operator clicks
    // Save and watches nothing happen.
    validators: { onChange: profileSchema, onSubmit: profileSchema },
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync({
          description: value.description,
          unitOfAccount: value.unitOfAccount,
          email: value.email,
          website: value.website,
          phone: value.phone,
          terms: value.terms,
          locationName: value.locationName,
          // Sent as a pair or not at all, which is the rule the database holds.
          geoLat: value.latitude === "" ? null : Number(value.latitude),
          geoLng: value.longitude === "" ? null : Number(value.longitude),
          tags: value.tags,
        });
        toast.success("Pool record updated.");
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
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <SheetContent className="w-full bg-card shadow-none data-[side=right]:sm:max-w-[32rem]">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Edit pool record</SheetTitle>
          <SheetDescription>{pool.name}</SheetDescription>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
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

            <form.Field name="unitOfAccount">
              {(field) => (
                <Field
                  htmlFor={field.name}
                  label="Unit of account"
                  hint="What amounts in this pool are quoted in, for example KES."
                  error={getFieldError(field.state.meta.errors)}
                >
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    className="w-32 font-mono uppercase"
                    maxLength={16}
                  />
                </Field>
              )}
            </form.Field>

            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <SectionLabel>Contact</SectionLabel>

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
                    label="Terms URL"
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
            </div>

            <div className="flex flex-col gap-4 border-t border-border pt-4">
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

            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <SectionLabel>Tags</SectionLabel>
              <form.Field name="tags">
                {(field) => (
                  <Field
                    htmlFor="pool-tags"
                    label="Pool tags"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    {tokenTags.isPending ? (
                      <p className="text-sm text-muted-foreground">Loading tags…</p>
                    ) : tokenTags.isError ? (
                      <p className="text-sm text-destructive">Could not load the tag list.</p>
                    ) : (
                      <TagCombobox
                        items={tokenTags.data ?? []}
                        value={field.state.value}
                        onValueChange={field.handleChange}
                        searchLabel="Search pool tags"
                        selectedLabel="Selected pool tags"
                        listLabel="Pool tags"
                        placeholder="Search tags"
                        removeLabel={(tag) => `Remove ${tag}`}
                      />
                    )}
                  </Field>
                )}
              </form.Field>
            </div>
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card p-4">
            <Button type="button" variant="ghost" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
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
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
