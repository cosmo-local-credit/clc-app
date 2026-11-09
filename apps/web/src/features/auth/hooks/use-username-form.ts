import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import type { ProfileResult } from "@clc/api/features/auth/client";
import { usernameSchema } from "@clc/core/features/signup/logic";
import { useForm } from "@clc/core/lib/forms";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useUpdateProfile } from "#/features/auth/hooks/use-update-profile";
import { translateRecipientError } from "#/lib/recipient-error-i18n";

// Blank means "pick one for me" at signup; here it would save nothing.
const chosenUsernameSchema = usernameSchema.refine((value) => value !== "", {
  message: "Username must contain 1–80 characters",
});

/**
 * Choosing or changing the account's username: the form, its save and the
 * error it leaves. Mount it only while the editor is open so each visit starts
 * from the saved name: TanStack Form takes defaultValues once.
 */
export function useUsernameForm({
  profile,
  onClose,
}: {
  profile: ProfileResult;
  onClose: () => void;
}) {
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
        // omission. The contact form's unsaved edits are not this form's to save.
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

  return {
    form,
    current,
    submitError,
    clearSubmitError: () => setSubmitError(null),
    saving: updateProfile.isPending,
  };
}

/** Copies the username, with a toast either way. */
export function useCopyUsername() {
  const { t } = useLingui();
  return (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy username`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Username copied`))
      .catch(() => toast.error(t`Couldn't copy username`));
  };
}
