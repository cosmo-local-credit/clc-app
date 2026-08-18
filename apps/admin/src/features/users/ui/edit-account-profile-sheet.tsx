import type { AdminUser } from "@clc/api/features/admin/client";
import { optionalEmailSchema, optionalPhoneSchema } from "@clc/core/lib/contact";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { toast } from "sonner";
import { z } from "zod";

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
  .refine((value) => /^\d+$/.test(value), { message: "Enter a whole number, 0 or more" });

const profileSchema = z.object({
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
  maxPools: limitSchema,
  maxTokens: limitSchema,
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
 * A photo row is deliberately absent. There is no user image field and no upload
 * contract, and controls that cannot do anything are worse than their absence —
 * the header keeps its initials fallback.
 *
 * Location is absent for a different reason: clc-core stores a name and
 * coordinates as a pair, and this console has no geocoder to turn a typed place
 * into coordinates, so the only edit available would save a new label against
 * stale coordinates.
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

  const form = useForm({
    defaultValues: {
      name: account.name,
      email: account.email,
      phone: account.phone,
      country: account.country,
      maxPools: String(account.maxPools),
      maxTokens: String(account.maxTokens),
    },
    validators: { onSubmit: profileSchema },
    onSubmit: async ({ value }) => {
      const profile = {
        name: value.name.trim(),
        email: value.email.trim(),
        phone: value.phone.trim(),
        country: value.country.trim().toUpperCase(),
      };
      const limits = { maxPools: Number(value.maxPools), maxTokens: Number(value.maxTokens) };

      // Profile and limits are separate endpoints, so each is called only when it
      // has something to change. The profile goes first: if limits then fail, the
      // toast says so and the profile edit that did land is already on screen,
      // rather than both being reported as one failure.
      const limitsChanged =
        limits.maxPools !== account.maxPools || limits.maxTokens !== account.maxTokens;
      const profileChanged =
        profile.name !== account.name ||
        profile.email !== account.email ||
        profile.phone !== account.phone ||
        profile.country !== account.country;

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
      <SheetContent className="w-full bg-card shadow-none data-[side=right]:sm:max-w-[28rem]">
        <SheetHeader className="border-b border-border">
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
                <Field
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

            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <SectionLabel>Deployment limits</SectionLabel>
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
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card p-4">
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
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
