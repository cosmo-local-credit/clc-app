import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import type { ReactNode } from "react";
import { RiMailLine, RiMapPin2Line, RiPhoneLine, RiWallet3Line } from "react-icons/ri";

import { type WalletToken } from "#/components/wallet";

function DetailRow({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 break-all text-xs">{value}</span>
    </div>
  );
}

export function VoucherContactDetails({
  voucher,
  showOwnerAddress = true,
}: {
  voucher: WalletToken;
  showOwnerAddress?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {voucher.location ? (
        <DetailRow
          icon={<RiMapPin2Line className="size-3" aria-hidden="true" />}
          value={voucher.location}
        />
      ) : null}
      {voucher.phone ? (
        <DetailRow
          icon={<RiPhoneLine className="size-3" aria-hidden="true" />}
          value={voucher.phone}
        />
      ) : null}
      {voucher.email ? (
        <DetailRow
          icon={<RiMailLine className="size-3" aria-hidden="true" />}
          value={voucher.email}
        />
      ) : null}
      {showOwnerAddress && voucher.owner ? (
        <div className="flex items-start gap-2">
          <RiWallet3Line
            className="mt-0.5 size-3 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <RecipientIdentityLabel address={voucher.owner} />
        </div>
      ) : null}
    </div>
  );
}
