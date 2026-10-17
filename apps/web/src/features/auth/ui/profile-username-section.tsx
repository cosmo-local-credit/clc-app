import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import type { ProfileResult } from "@clc/api/features/auth/client";
import { usernameSchema } from "@clc/core/features/signup/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiAtLine, RiFileCopyLine } from "react-icons/ri";
import { toast } from "sonner";
import { z } from "zod";

import { UsernameInput } from "#/components/profile/username-input";
import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { useUpdateProfile } from "#/features/auth/hooks/use-update-profile";
import { translateRecipientError } from "#/lib/recipient-error-i18n";
import { translateValidationError } from "#/lib/validation-i18n";

// Blank means "pick one for me" at signup; here it would save nothing.
const chosenUsernameSchema = usernameSchema.refine((value) => value !== "", {
  message: "Username must contain 1–80 characters",
});

/**
 * The account's public name, kept apart from the contact form: it is what other
 * people type to send vouchers here, and an account created before usernames
 * existed has none until its owner picks one.
 */
export function ProfileUsernameSection({ profile }: { profile: ProfileResult }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const username = profile.username ?? null;

  const copy = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy username`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Username copied`))
      .catch(() => toast.error(t`Couldn't copy username`));
  };

  return (
    // One row split in two: the row opens the username sheet, and copying gets
    // its own 44px cell rather than a second control stacked under the name.
    <section aria-label={t`Username`} className="flex border border-border bg-card">
      <div className="min-w-0 flex-1">
        <ActionRow
          icon={<RiAtLine className="size-4" aria-hidden="true" />}
          label={t`Username`}
          value={
            username ? (
              <bdi dir="auto" className="font-mono">
                {username}
              </bdi>
            ) : (
              t`Not set`
            )
          }
          render={
            <button
              type="button"
              aria-label={username ? t`Change username` : t`Choose username`}
              onClick={() => setOpen(true)}
            />
          }
        />
      </div>
      {username ? (
        <button
          type="button"
          aria-label={t`Copy wallet username`}
          onClick={() => copy(username)}
          className="flex w-11 shrink-0 items-center justify-center border-border border-s text-muted-foreground outline-none active:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
        >
          <RiFileCopyLine className="size-4" aria-hidden="true" />
        </button>
      ) : null}

      <SheetRoot
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
      >
        <SheetPortal>
          <SheetBackdrop />
          <SheetContent>
            <SheetHeader>
              <SheetTitle className="font-heading text-base font-semibold">
                {username ? <Trans>Change username</Trans> : <Trans>Choose username</Trans>}
              </SheetTitle>
            </SheetHeader>
            {/* Mounted only while open so each visit starts from the saved name:
                TanStack Form takes defaultValues once. */}
            {open ? <UsernameForm profile={profile} onClose={() => setOpen(false)} /> : null}
          </SheetContent>
        </SheetPortal>
      </SheetRoot>
    </section>
  );
}

function UsernameForm({ profile, onClose }: { profile: ProfileResult; onClose: () => void }) {
  const { i18n, t } = useLingui();
  const updateProfile = useUpdateProfile();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const current = profile.username ?? null;

  const form = useForm({
    defaultValues: { username: current ?? "" },
    validators: { onChange: z.object({ username: chosenUsernameSchema }) },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        // POST /auth/profile overwrites name, email, phone and country, so the
        // stored values go back unchanged; everything else is preserved on
        // omission. The contact form's unsaved edits are not this sheet's to save.
        await updateProfile.mutateAsync({
          name: profile.name,
          username: chosenUsernameSchema.parse(value.username),
          email: profile.email,
          phone: profile.phone,
          country: profile.country,
        });
        toast.success(t`Username updated`);
        onClose();
      } catch (err) {
        setSubmitError(
          translateRecipientError(err, i18n) ??
            (err instanceof BackendApiError
              ? formatBackendApiError(err)
              : err instanceof Error
                ? err.message
                : t`Couldn't save your username.`),
        );
      }
    },
  });

  return (
    <form
      aria-label={current ? t`Change username` : t`Choose username`}
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2">
        <form.Field name="username">
          {(field) => {
            const err = getFieldError(field.state.meta.errors);
            return (
              <UsernameInput
                id="profile-username"
                value={field.state.value}
                hint={() => profile.name}
                onChange={(next) => {
                  setSubmitError(null);
                  field.handleChange(next);
                }}
                onBlur={field.handleBlur}
                error={err ? translateValidationError(err, i18n) : null}
              />
            );
          }}
        </form.Field>
        {current ? (
          <p className="text-muted-foreground text-xs">
            <Trans>
              Your current username stops working as soon as you save, and someone else can then
              take it.
            </Trans>
          </p>
        ) : null}
        {submitError ? (
          <p className="text-destructive text-xs" role="alert">
            {submitError}
          </p>
        ) : null}
      </div>

      <SheetFooter>
        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isSubmitting: s.isSubmitting,
            username: s.values.username,
          })}
        >
          {({ canSubmit, isSubmitting, username }) => {
            const normalized = username.trim().normalize("NFC");
            return (
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={!canSubmit || normalized === "" || normalized === current}
                pending={isSubmitting}
              >
                {isSubmitting ? t`Saving…` : t`Save username`}
              </Button>
            );
          }}
        </form.Subscribe>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          disabled={updateProfile.isPending}
          onClick={onClose}
        >
          <Trans>Cancel</Trans>
        </Button>
      </SheetFooter>
    </form>
  );
}
