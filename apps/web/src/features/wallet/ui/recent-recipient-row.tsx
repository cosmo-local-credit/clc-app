import { useLingui } from "@lingui/react/macro";
import { RiArrowRightSLine } from "react-icons/ri";

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

  return (
    <button type="button" onClick={onSelect} className="flex w-full items-center p-3 text-left">
      <div className="min-w-0 flex-1">
        <p className="break-all font-medium text-sm">
          {recipient.address && recipient.label.startsWith("0x") ? t`Address` : recipient.label}
        </p>
        {recipient.address ? (
          <div className="mt-1 min-w-0 break-all">
            <EllipsizedAddress address={recipient.address} />
          </div>
        ) : (
          <p className="break-all font-mono text-muted-foreground text-xs">{recipient.sub}</p>
        )}
      </div>
      <RiArrowRightSLine
        className="ml-2 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}
