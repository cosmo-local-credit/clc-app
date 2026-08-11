import { useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { z } from "zod";

import { OnboardingMenu } from "#/components/language-selector";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import { StepProgress } from "#/components/ui/step-progress";
import { BackChevron } from "#/components/wallet/wallet-layout";
import { pickPasskeyProvider } from "#/features/webauthn/hooks/use-platform-passkey-label";
import { onboardingSearch, type WalletMethodChoice } from "#/lib/onboarding-search";

const methodSchema = z.object({
  method: z.enum(["link", "paper"]),
});

type Props = {
  redirectTo?: string;
  initialChoice?: WalletMethodChoice;
  onContinue: (choice: WalletMethodChoice) => void;
};

/**
 * Screen D — Choose whether to link a platform passkey (Google / Apple ID)
 * or rely on the paper wallet only. Skipped entirely when the platform
 * cannot store passkeys (see OnboardingFlow).
 */
export function OnboardingMethodStep({ redirectTo, initialChoice = "link", onContinue }: Props) {
  const { t } = useLingui();
  const providerLabel = pickPasskeyProvider() === "apple" ? "Apple ID" : "Google";

  const form = useForm({
    defaultValues: { method: initialChoice },
    validators: { onChange: methodSchema },
    onSubmit: ({ value }) => {
      onContinue(value.method);
    },
  });

  return (
    <div className="relative flex min-h-[100svh] flex-col bg-background">
      <OnboardingMenu />
      <div className="flex flex-1 flex-col px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <BackChevron
          label={t`Back`}
          to="/onboarding"
          search={onboardingSearch("profile", redirectTo)}
          className="mb-4 self-start"
        />

        <StepProgress step={2} total={3} />

        <div className="mb-6 space-y-2">
          <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
            {t`Link ${providerLabel}?`}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t`Every account gets a paper wallet. Linking ${providerLabel} adds another way to sign in.`}
          </p>
        </div>

        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="method">
            {(field) => (
              <RadioGroup
                value={field.state.value}
                onValueChange={(value) => {
                  if (value === "link" || value === "paper") field.handleChange(value);
                }}
                aria-label={t`Sign-in method`}
                className="gap-3"
              >
                <label className="grid cursor-pointer grid-cols-[16px_minmax(0,1fr)] gap-3 border border-border bg-card p-4 has-data-[checked]:border-primary has-data-[checked]:bg-primary/[0.05]">
                  <RadioGroupItem value="link" className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm font-semibold leading-snug">
                        {t`Link ${providerLabel}`}
                      </strong>
                      <Badge className="h-5 border-transparent bg-primary px-1.5 text-[10px] text-primary-foreground">
                        <Trans>Recommended</Trans>
                      </Badge>
                    </span>
                  </span>
                </label>

                <label className="grid cursor-pointer grid-cols-[16px_minmax(0,1fr)] gap-3 border border-border bg-card p-4 has-data-[checked]:border-primary has-data-[checked]:bg-primary/[0.05]">
                  <RadioGroupItem value="paper" className="mt-0.5" />
                  <span className="min-w-0">
                    <strong className="block text-sm font-semibold leading-snug">
                      <Trans>Paper wallet only</Trans>
                    </strong>
                  </span>
                </label>
              </RadioGroup>
            )}
          </form.Field>

          <div className="mt-auto pt-8">
            <Button type="submit" className="h-11 w-full">
              <Trans>Continue</Trans>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
