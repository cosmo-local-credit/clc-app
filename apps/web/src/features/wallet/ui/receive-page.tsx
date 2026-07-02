import { Trans, useLingui } from "@lingui/react/macro";
import { RiFileCopyLine, RiShareLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { AddressQRCode, HighlightAddress, NetworkBadge } from "#/components/wallet";
import { WALLET_ADDRESS_FULL, WALLET_ENS_NAME } from "#/components/wallet/wallet-data";
import { BackChevron } from "#/components/wallet/wallet-kit";

export function ReceivePage() {
  const { t } = useLingui();

  const copy = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy address`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Address copied`))
      .catch(() => toast.error(t`Couldn't copy address`));
  };

  const share = async () => {
    // Prefer the native share sheet; fall back to copying when unavailable.
    if (navigator.share) {
      try {
        await navigator.share({ title: t`My wallet address`, text: WALLET_ADDRESS_FULL });
      } catch (error) {
        // AbortError = user dismissed the sheet; not a failure worth surfacing.
        if (error instanceof Error && error.name !== "AbortError") {
          copy(WALLET_ADDRESS_FULL);
        }
      }
      return;
    }
    copy(WALLET_ADDRESS_FULL);
  };

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Receive`} to="/" />

      <div className="flex flex-col items-center">
        <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>Receive</Trans>
        </h1>
        <NetworkBadge className="my-3.5" />
        <AddressQRCode value={WALLET_ADDRESS_FULL} size={156} />
        <p className="mt-3.5 mb-1.5 text-muted-foreground text-xs">
          <Trans>Receive details</Trans>
        </p>
      </div>

      <div className="mb-3 border border-border bg-card">
        <button
          type="button"
          aria-label={t`Copy wallet name`}
          className="flex h-12 w-full items-center justify-between gap-3 border-b border-border px-3 text-left"
          onClick={() => copy(WALLET_ENS_NAME)}
        >
          <span className="font-mono text-muted-foreground text-xs">{WALLET_ENS_NAME}</span>
          <RiFileCopyLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t`Copy wallet address`}
          className="flex h-12 w-full items-center justify-between gap-3 px-3 text-left"
          onClick={() => copy(WALLET_ADDRESS_FULL)}
        >
          <HighlightAddress
            address={WALLET_ADDRESS_FULL}
            tailLength={6}
            className="min-w-0 break-all text-[0.625rem] leading-tight"
          />
          <RiFileCopyLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>

      <div className="mb-3.5 border border-primary/30 bg-primary/5 p-3">
        <p className="text-foreground text-xs leading-relaxed">
          <Trans>
            Only send assets on the <strong>Celo network</strong> to this address. Other networks
            may be lost.
          </Trans>
        </p>
      </div>

      <div className="flex-1" />

      <div className="flex gap-2">
        <Button variant="outline" className="h-11 flex-1" onClick={() => copy(WALLET_ADDRESS_FULL)}>
          <RiFileCopyLine className="size-4" aria-hidden="true" />
          <Trans>Copy</Trans>
        </Button>
        <Button className="h-11 flex-1" onClick={() => void share()}>
          <RiShareLine className="size-4" aria-hidden="true" />
          <Trans>Share</Trans>
        </Button>
      </div>
    </div>
  );
}
