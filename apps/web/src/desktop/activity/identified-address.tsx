import { useLingui } from "@lingui/react/macro";

import { RecipientIdentityText } from "#/components/wallet/recipient-identity-label";
import { copyValue, FullValue } from "#/desktop/ui/full-value";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";

/** A party to a transfer or a voucher's issuer: its name when one resolves, and the address in full on request. */
export function IdentifiedAddress({ address }: { address: string }) {
  const { t } = useLingui();
  const identity = useReverseRecipientResolution(address);
  return (
    <span className="grid min-w-0 gap-1">
      {identity.data ? (
        <RecipientIdentityText
          identity={identity.data}
          className="font-sans font-semibold [overflow-wrap:anywhere]"
        />
      ) : null}
      <FullValue
        value={address}
        copyLabel={t`Copy address`}
        onCopy={(value) => copyValue(value, t`Address copied`, t`Couldn't copy address`)}
      />
    </span>
  );
}
