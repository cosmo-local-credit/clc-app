import { Trans, useLingui } from "@lingui/react/macro";
import { RiAlertLine, RiFileCopyLine, RiShareLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { AddressQRCode, CopyableAddress, NetworkBadge } from "#/components/wallet";
import { WALLET_ADDRESS_FULL } from "#/components/wallet/wallet-data";
import { BackChevron } from "#/components/wallet/wallet-kit";

export function ReceivePage() {
  const { t } = useLingui();

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Receive`} onClick={() => window.history.back()} />

      <div className="flex flex-col items-center">
        <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>Receive</Trans>
        </h1>
        <p className="mt-1 mb-3.5 text-muted-foreground text-sm">
          <Trans>Share your address to get paid</Trans>
        </p>
        <NetworkBadge className="mb-3.5" />
        <AddressQRCode value={WALLET_ADDRESS_FULL} size={156} />
        <p className="mt-3.5 mb-1.5 text-muted-foreground text-xs">
          <Trans>Your Celo address</Trans>
        </p>
      </div>

      <CopyableAddress
        address={WALLET_ADDRESS_FULL}
        className="mb-3 border border-border bg-card"
      />

      <div className="mb-3.5 flex gap-2 border border-border bg-muted p-2.5">
        <RiAlertLine className="mt-0.5 size-4 shrink-0 text-yellow-500" aria-hidden="true" />
        <p className="text-muted-foreground text-xs leading-relaxed">
          <Trans>
            Only send assets on the <strong className="text-foreground">Celo network</strong> to
            this address. Other networks may be lost.
          </Trans>
        </p>
      </div>

      <div className="flex-1" />

      <div className="flex gap-2">
        <Button variant="outline" className="h-11 flex-1">
          <RiFileCopyLine className="size-4" aria-hidden="true" />
          <Trans>Copy</Trans>
        </Button>
        <Button className="h-11 flex-1">
          <RiShareLine className="size-4" aria-hidden="true" />
          <Trans>Share</Trans>
        </Button>
      </div>
    </div>
  );
}
