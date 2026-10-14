import type { AdminUser } from "@clc/api/features/admin/client";
import {
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalWebsiteSchema,
} from "@clc/core/lib/contact";
import { isIsoCurrency } from "@clc/core/lib/currencies";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { storedImageUrlSchema } from "@clc/core/lib/image-url";
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
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { Textarea } from "#/components/ui/textarea";
import { isStorageConfigured } from "#/lib/storage";
import { useUpdateUserLimits, useUpdateUserProfile } from "../use-admin-users";

/**
 * Contact validation is the product's, not this screen's: the same optional
 * email and E.164 phone rules apply here, in signup, and on a voucher's issuer
 * contact, and clc-core validates the same shapes on the way in.
 *
 * Country is a free-text ISO 3166-1 alpha-2 code rather than a picker. Nothing in
 * this repository holds a country list — apps/web derives the code from its
 * geocoder — so a Select here would mean inventing that list, and a partial one
 * would quietly exclude countries the platform serves.
 */
const limitSchema = z
  .string()
  .trim()
  // A text field rather than a number input, which yields an empty string for
  // invalid text and would read as zero — a quota of none.
  .refine((value) => /^\d+$/.test(value) && Number(value) <= 2147483647, {
    message: "Enter a whole number from 0 to 2147483647",
  });

const profileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: "Name is required" })
      .max(80, { message: "Name must be 80 characters or fewer" }),
    email: optionalEmailSchema,
    phone: optionalPhoneSchema,
    country: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "" || /^[A-Z]{2}$/.test(value), {
        message: "Use a two-letter country code, for example KE",
      }),
    preferredCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "" || isIsoCurrency(value), {
        message: "Use a three-letter ISO currency code, for example KES",
      }),
    bio: z.string().trim().max(500, { message: "Bio must be 500 characters or fewer" }),
    website: optionalWebsiteSchema,
    locationName: z.string().trim().max(200, { message: "Location name is too long" }),
    latitude: z.string(),
    longitude: z.string(),
    // Already uploaded by the time it reaches the form, so the only rule left is
    // the one the database enforces: a URL or nothing.
    avatarUrl: storedImageUrlSchema,
    maxPools: limitSchema,
    maxTokens: limitSchema,
    maxCatalogs: limitSchema,
    maxOffers: limitSchema,
  })
  .superRefine((value, ctx) => {
    // A label with no pin, or a pin with no label, describes a place nobody can
    // point at. clc-core stores the two as a set, so catching it here is only
    // about naming the field before a round trip.
    const hasPin = value.latitude !== "" && value.longitude !== "";
    if (hasPin === (value.locationName !== "")) return;

    ctx.addIssue({
      code: "custom",
      path: hasPin ? ["locationName"] : ["latitude"],
      message: hasPin ? "Name the place this pin marks" : "Click the map to place this account",
    });
  });

/**
 * Profile and quota edits for one account, in a right-side sheet.
 *
 * Deployment limits are here rather than on the page: they are two numbers an
 * operator sets while looking at the same record, and giving them their own
 * control meant a second place to open, a second thing to save, and a panel on
 * the page for two figures.
 *
 * Status and role are still not here. Both are decisions with their own actions —
 * approval and banning sit in the header — and an operator correcting a phone
 * number must not be able to change what an account is allowed to do by tabbing
 * one field too far.
 *
 * The photo is edited here too, now that clc-core stores one. It uploads on
 * selection rather than on save, so replacing an image behaves exactly like
 * setting the first one, and the form only ever carries the URL. The row hides
 * itself where the upload service is not configured: a control that cannot work
 * is worse than its absence, and the header still falls back to initials.
 *
 * The account's place is edited here too, through the same `LocationField` the
 * pool sheet uses. It was a control on the detail card, which made the record the
 * one panel in the console that was half reference and half form, and gave the
 * account two save buttons on one screen. The pin is the input and the geocoder
 * names it, so the pair clc-core stores can never disagree with itself.
 *
 * The pin cannot be removed, only moved: `AdminUserProfile` carries a location or
 * omits one, and omitting it leaves whatever is stored in place. A Clear pin
 * button would report a removal the endpoint has no way to perform, so the field
 * is asked not to offer one.
 */
export function EditAccountProfileSheet({
  account,
  open,
  onClose,
}: {
  account: AdminUser;
  open: boolean;
  onClose: () => void;
}) {
  const updateProfile = useUpdateUserProfile();
  const updateLimits = useUpdateUserLimits();
  const saving = updateProfile.isPending || updateLimits.isPending;
  const storedPreferredCurrency = account.preferredCurrency ?? "";
  const storedBio = account.bio ?? "";
  const storedWebsite = account.website ?? "";
  const formProfileSchema = profileSchema.superRefine((value, ctx) => {
    if (storedPreferredCurrency !== "" && value.preferredCurrency === "") {
      ctx.addIssue({
        code: "custom",
        path: ["preferredCurrency"],
        message: "A saved preferred currency cannot be removed",
      });
    }
  });

  const form = useForm({
    defaultValues: {
      name: account.name,
      email: account.email,
      phone: account.phone,
      country: account.country,
      preferredCurrency: storedPreferredCurrency,
      bio: storedBio,
      website: storedWebsite,
      locationName: account.locationName ?? "",
      latitude: account.geoLat === null ? "" : String(account.geoLat),
      longitude: account.geoLng === null ? "" : String(account.geoLng),
      maxPools: String(account.maxPools),
      maxTokens: String(account.maxTokens),
      maxCatalogs: String(account.maxCatalogs),
      maxOffers: String(account.maxOffers),
      // Already a stored URL: ImageUploadField uploads on selection, so this
      // field never holds a File. Empty string is "no image", which keeps the
      // form value a string like every other field here.
      avatarUrl: account.avatarUrl ?? "",
    },
    validators: { onSubmit: formProfileSchema },
    onSubmit: async ({ value }) => {
      // The pair travels together or not at all. Omitted, the endpoint leaves
      // whatever place is stored alone — which is why the field offers no way to
      // clear one.
      const location =
        value.latitude === "" || value.longitude === ""
          ? null
          : {
              locationName: value.locationName.trim(),
              geoLat: Number(value.latitude),
              geoLng: Number(value.longitude),
            };

      // Omitted preserves, so the avatar keys are sent only when the operator
      // actually changed the image. clearAvatar and avatarUrl are mutually
      // exclusive — clc-core rejects the pair rather than picking one.
      const storedAvatar = account.avatarUrl ?? "";
      const avatar =
        value.avatarUrl === storedAvatar
          ? {}
          : value.avatarUrl === ""
            ? { clearAvatar: true }
            : { avatarUrl: value.avatarUrl };

      const profile = {
        name: value.name.trim(),
        email: value.email.trim(),
        phone: value.phone.trim(),
        country: value.country.trim().toUpperCase(),
        ...(value.preferredCurrency !== storedPreferredCurrency
          ? { preferredCurrency: value.preferredCurrency }
          : {}),
        ...(value.bio.trim() !== storedBio ? { bio: value.bio.trim() } : {}),
        ...(value.website.trim() !== storedWebsite ? { website: value.website.trim() } : {}),
        ...location,
        ...avatar,
      };
      const limits = {
        maxPools: Number(value.maxPools),
        maxTokens: Number(value.maxTokens),
        maxCatalogs: Number(value.maxCatalogs),
        maxOffers: Number(value.maxOffers),
      };

      // Profile and limits are separate endpoints, so each is called only when it
      // has something to change. The profile goes first: if limits then fail, the
      // toast says so and the profile edit that did land is already on screen,
      // rather than both being reported as one failure.
      const limitsChanged =
        limits.maxPools !== account.maxPools ||
        limits.maxTokens !== account.maxTokens ||
        limits.maxCatalogs !== account.maxCatalogs ||
        limits.maxOffers !== account.maxOffers;
      const profileChanged =
        profile.name !== account.name ||
        profile.email !== account.email ||
        profile.phone !== account.phone ||
        profile.country !== account.country ||
        value.preferredCurrency !== storedPreferredCurrency ||
        value.bio.trim() !== storedBio ||
        value.website.trim() !== storedWebsite ||
        value.avatarUrl !== storedAvatar ||
        // The endpoint assigns every field it is given, so a location edit alone
        // still sends the identity fields unchanged beside it.
        (location !== null &&
          (location.locationName !== (account.locationName ?? "") ||
            location.geoLat !== account.geoLat ||
            location.geoLng !== account.geoLng));

      try {
        if (profileChanged) {
          await updateProfile.mutateAsync({ address: account.ethereumAddress, profile });
        }
        if (limitsChanged) {
          await updateLimits.mutateAsync({ address: account.ethereumAddress, limits });
        }
        toast.success("Account updated.");
        onClose();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the changes.");
      }
    },
  });

  /**
   * Closing with unsaved edits asks first. A dismissal in progress is ignored
   * rather than queued: cancelling a request mid-flight would leave the operator
   * unsure whether the change landed.
   */
  function requestClose() {
    if (saving) return;
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
      {/* Flat and card-coloured: the shared Sheet ships a popover surface with a
          shadow, which is desktop layering this console does not use. */}
      {/* No aria-label: SheetTitle below is the accessible name, and two sources
          for it is one that can drift. */}
      <SheetContent className="bg-card w-full shadow-none data-[side=right]:sm:max-w-[28rem]">
        <SheetHeader className="border-border border-b">
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>{account.ethereumAddress}</SheetDescription>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {isStorageConfigured ? (
              <form.Field name="avatarUrl">
                {(field) => (
                  <ImageUploadField
                    label="Profile photo"
                    purpose="profile.avatar"
                    value={field.state.value === "" ? null : field.state.value}
                    onChange={(url) => field.handleChange(url ?? "")}
                    disabled={saving}
                  />
                )}
              </form.Field>
            ) : null}

            <form.Field name="name">
              {(field) => (
                <Field label="Full name" error={getFieldError(field.state.meta.errors)}>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="email">
              {(field) => (
                <Field label="Email address" error={getFieldError(field.state.meta.errors)}>
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
                <Field label="Phone number" error={getFieldError(field.state.meta.errors)}>
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

            <form.Field name="country">
              {(field) => (
                <Field label="Country" error={getFieldError(field.state.meta.errors)}>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    className="w-24 font-mono uppercase"
                    maxLength={2}
                  />
                </Field>
              )}
            </form.Field>

            <div className="border-border flex flex-col gap-4 border-t pt-4">
              <SectionLabel>Profile preferences</SectionLabel>
              <form.Field name="preferredCurrency">
                {(field) => (
                  <Field label="Preferred currency" error={getFieldError(field.state.meta.errors)}>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value.toUpperCase())}
                      className="w-28 font-mono uppercase"
                      maxLength={3}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Field name="bio">
                {(field) => (
                  <Field label="Bio" error={getFieldError(field.state.meta.errors)}>
                    <Textarea
                      id={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      rows={3}
                      maxLength={500}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Field name="website">
                {(field) => (
                  <Field label="Website" error={getFieldError(field.state.meta.errors)}>
                    <Input
                      id={field.name}
                      type="url"
                      inputMode="url"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </Field>
                )}
              </form.Field>
            </div>

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
                            clearable={false}
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

            <div className="border-border flex flex-col gap-3 border-t pt-4">
              <SectionLabel>Resource limits</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <form.Field name="maxPools">
                  {(field) => (
                    <Field label="Max pools" error={getFieldError(field.state.meta.errors)}>
                      <Input
                        id={field.name}
                        inputMode="numeric"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        className="font-data"
                      />
                    </Field>
                  )}
                </form.Field>

                <form.Field name="maxTokens">
                  {(field) => (
                    <Field label="Max vouchers" error={getFieldError(field.state.meta.errors)}>
                      <Input
                        id={field.name}
                        inputMode="numeric"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        className="font-data"
                      />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="maxCatalogs">
                  {(field) => (
                    <Field label="Max catalogs" error={getFieldError(field.state.meta.errors)}>
                      <Input
                        id={field.name}
                        inputMode="numeric"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        className="font-data"
                      />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="maxOffers">
                  {(field) => (
                    <Field label="Max offers" error={getFieldError(field.state.meta.errors)}>
                      <Input
                        id={field.name}
                        inputMode="numeric"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        className="font-data"
                      />
                    </Field>
                  )}
                </form.Field>
              </div>
            </div>
          </div>

          <div className="border-border bg-card sticky bottom-0 flex justify-end gap-2 border-t p-4">
            <Button type="button" variant="ghost" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error: string | null;
  children: React.ReactElement<{ id?: string; "aria-invalid"?: boolean }>;
}) {
  const id = children.props.id;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
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
