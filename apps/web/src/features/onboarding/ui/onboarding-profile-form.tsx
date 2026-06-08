import type { LocationInput } from "@clc/core/features/location/logic";
import type { ProfileInput } from "@clc/core/features/signup/logic";
import { profileSchema } from "@clc/core/features/signup/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { OnboardingLanguageSelector } from "#/components/language-selector";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { PhoneInputField } from "#/components/ui/phone-input";
import { translateValidationError } from "#/lib/validation-i18n";
import { LocationPicker } from "./location-picker";

type Props = {
  onNext: (data: ProfileInput) => void;
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

export function OnboardingProfileForm({ onNext }: Props) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: DEFAULT_VALUES,
    validators: { onChange: profileSchema },
    onSubmit: async ({ value }) => {
      const parsed = profileSchema.parse(value);
      console.log("[onboarding] profile:", parsed);
      onNext(parsed);
    },
  });

  return (
    <div className="relative flex min-h-[100svh] flex-col bg-background">
      <OnboardingLanguageSelector />
      <div className="flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mb-6 space-y-3">
          <button
            type="button"
            onClick={() => void navigate({ to: "/" })}
            className="-ml-2 flex h-11 items-center gap-1.5 self-start px-2 text-muted-foreground text-sm hover:text-foreground"
            aria-label={t`Back`}
          >
            <ArrowLeft className="size-4" />
            <Trans>Back</Trans>
          </button>

          <div className="space-y-1">
            <h1 className="font-bold font-heading text-[1.75rem] leading-tight">
              <Trans>Create your account</Trans>
            </h1>
            <p className="text-muted-foreground text-sm">
              <Trans>Name and location are required. Provide an email or phone number.</Trans>
            </p>
          </div>
        </div>

        <form
          aria-label={t`Create account`}
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
                  <label htmlFor="onb-name" className="font-medium text-sm">
                    <Trans>Name</Trans>
                  </label>
                  <Input
                    id="onb-name"
                    type="text"
                    autoComplete="name"
                    placeholder={t`Your name`}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={!!err}
                    aria-label={t`Name`}
                  />
                  {err ? (
                    <p className="text-destructive text-xs">
                      {translateValidationError(err, i18n)}
                    </p>
                  ) : null}
                </div>
              );
            }}
          </form.Field>

          <form.Field name="email">
            {(field) => {
              const err = getFieldError(field.state.meta.errors);
              return (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="onb-email" className="font-medium text-sm">
                    <Trans>Email</Trans>
                  </label>
                  <Input
                    id="onb-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={!!err}
                    aria-label={t`Email`}
                  />
                  {err ? (
                    <p className="text-destructive text-xs">
                      {translateValidationError(err, i18n)}
                    </p>
                  ) : null}
                </div>
              );
            }}
          </form.Field>

          <form.Field name="phone">
            {(field) => {
              const err = getFieldError(field.state.meta.errors);
              return (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="onb-phone" className="font-medium text-sm">
                    <Trans>Phone</Trans>
                  </label>
                  <PhoneInputField
                    id="onb-phone"
                    value={field.state.value}
                    onChange={(val) => field.handleChange(val)}
                    aria-invalid={!!err}
                    aria-label={t`Phone number`}
                  />
                  {err ? (
                    <p className="text-destructive text-xs">
                      {translateValidationError(err, i18n)}
                    </p>
                  ) : null}
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
                          ? err
                            ? translateValidationError(err, i18n)
                            : undefined
                          : undefined
                      }
                    />
                  )}
                </form.Subscribe>
              );
            }}
          </form.Field>

          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting} className="h-11 w-full">
                {isSubmitting ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
                {isSubmitting ? t`Saving…` : t`Continue`}
              </Button>
            )}
          </form.Subscribe>
        </form>

        <p className="mt-8 text-center text-muted-foreground text-sm">
          <Trans>Already have an account?</Trans>{" "}
          <Link to="/" className="font-medium text-foreground underline-offset-4 hover:underline">
            <Trans>Go back to sign in</Trans>
          </Link>
        </p>
      </div>
    </div>
  );
}
