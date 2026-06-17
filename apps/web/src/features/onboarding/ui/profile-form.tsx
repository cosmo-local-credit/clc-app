import type { LocationInput } from "@clc/core/features/location/logic";
import { profileSchema } from "@clc/core/features/signup/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { PhoneInputField } from "#/components/ui/phone-input";
import { submitSignupProfile } from "#/features/onboarding/api/auth-client";
import { LocationPicker } from "./location-picker";

type Props = {
  address: `0x${string}`;
  onBack: () => void;
  onDone: () => void;
};

type ProfileFormValues = {
  name: string;
  email: string;
  phone: string;
  location: LocationInput | undefined;
};

const DEFAULT_VALUES: ProfileFormValues = {
  name: "",
  email: "",
  phone: "",
  location: undefined,
};

export function ProfileForm({ address: _address, onBack, onDone }: Props) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitProfileMutation = useMutation({ mutationFn: submitSignupProfile });

  const form = useForm({
    defaultValues: DEFAULT_VALUES,
    validators: { onChange: profileSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const parsed = profileSchema.parse(value);
        await submitProfileMutation.mutateAsync(parsed);
        onDone();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Submission failed.");
      }
    },
  });

  return (
    <div className="flex min-h-[100svh] flex-col bg-background">
      <div className="flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mb-6 space-y-3">
          <Button variant="ghost" className="-ml-2 h-11 w-fit px-2" onClick={onBack}>
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Button>

          <div className="space-y-1">
            <h1 className="font-bold font-heading text-[1.75rem] leading-tight">
              Tell us about yourself
            </h1>
            <p className="text-muted-foreground text-sm">
              Name and location are required. Provide an email or phone number.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="name">
            {(field) => {
              const err = getFieldError(field.state.meta.errors);
              return (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="profile-name" className="font-medium text-sm">
                    Name
                  </label>
                  <Input
                    id="profile-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={!!err}
                    aria-label="Name"
                  />
                  {err ? <p className="text-destructive text-xs">{err}</p> : null}
                </div>
              );
            }}
          </form.Field>

          <form.Field name="email">
            {(field) => {
              const err = getFieldError(field.state.meta.errors);
              return (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="profile-email" className="font-medium text-sm">
                    Email
                  </label>
                  <Input
                    id="profile-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={!!err}
                    aria-label="Email"
                  />
                  {err ? <p className="text-destructive text-xs">{err}</p> : null}
                </div>
              );
            }}
          </form.Field>

          <form.Field name="phone">
            {(field) => {
              const err = getFieldError(field.state.meta.errors);
              return (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="profile-phone" className="font-medium text-sm">
                    Phone
                  </label>
                  <PhoneInputField
                    id="profile-phone"
                    value={field.state.value}
                    onChange={(val) => field.handleChange(val)}
                    aria-invalid={!!err}
                    aria-label="Phone number"
                  />
                  {err ? <p className="text-destructive text-xs">{err}</p> : null}
                </div>
              );
            }}
          </form.Field>

          <form.Field name="location">
            {(field) => {
              const err = getFieldError(field.state.meta.errors);
              return (
                <form.Subscribe selector={(s) => s.submissionAttempts}>
                  {(submissionAttempts) => (
                    <LocationPicker
                      value={field.state.value}
                      onChange={(next) => field.handleChange(next)}
                      error={
                        field.state.meta.isTouched || submissionAttempts > 0
                          ? (err ?? undefined)
                          : undefined
                      }
                    />
                  )}
                </form.Subscribe>
              );
            }}
          </form.Field>

          {submitError ? <p className="text-destructive text-xs">{submitError}</p> : null}

          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting} className="h-11 w-full">
                {isSubmitting ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
                {isSubmitting ? "Saving…" : "Continue"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </div>
    </div>
  );
}
