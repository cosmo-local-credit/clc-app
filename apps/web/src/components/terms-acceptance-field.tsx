import { Trans } from "@lingui/react/macro";

import { AgreementField } from "#/components/ui/agreement-field";
import { PLATFORM_TERMS_URL } from "#/lib/legal";

type TermsAcceptanceFieldProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string | null;
  className?: string;
};

export function TermsAcceptanceField({
  id,
  checked,
  onCheckedChange,
  error,
  className,
}: TermsAcceptanceFieldProps) {
  return (
    <AgreementField
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      error={error}
      className={className}
    >
      <Trans>Accept</Trans>{" "}
      <a
        href={PLATFORM_TERMS_URL}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-foreground underline underline-offset-2"
        onClick={(event) => event.stopPropagation()}
      >
        <Trans>Terms and Conditions</Trans>
      </a>
    </AgreementField>
  );
}
