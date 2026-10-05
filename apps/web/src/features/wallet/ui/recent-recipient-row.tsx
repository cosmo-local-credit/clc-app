import { useLingui } from "@lingui/react/macro";
import { RiArrowRightSLine } from "react-icons/ri";

import { RecipientIdentityText } from "#/components/wallet/recipient-identity-label";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";
import { EllipsizedAddress } from "#/components/wallet";
import { type Recipient } from "#/components/wallet/wallet-data";

export function RecentRecipientRow({
  recipient,
  onSelect,
}: {
  recipient: Recipient;
  onSelect: () => void;
}) {
  const { t } = useLingui();
  const identity = useReverseRecipientResolution(recipient.address ?? null);
  const label = recipient.label;

  return (
    <button type="button" onClick={onSelect} className="flex w-full items-center p-3 text-start">
      <div className="min-w-0 flex-1">
        <p className="break-all font-medium text-sm">
          {identity.data ? (
            <RecipientIdentityText identity={identity.data} />
          ) : (
            <span dir="auto">
              {recipient.address && label.startsWith("0x") ? t`Address` : label}
            </span>
          )}
        </p>
        {recipient.address && !identity.data ? (
          <div className="mt-1 min-w-0 break-all">
            <EllipsizedAddress address={recipient.address} />
          </div>
        ) : (
          <p className="break-all font-mono text-muted-foreground text-xs">{recipient.sub}</p>
        )}
      </div>
      <RiArrowRightSLine
        className="rtl:-scale-x-100 ms-2 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}
