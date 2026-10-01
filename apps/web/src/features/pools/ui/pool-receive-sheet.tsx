import type { UserPool } from "@clc/api/features/pools/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { RiFileCopyLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { AddressQRCode, HighlightAddress } from "#/components/wallet";
import { CHAIN_ID } from "#/lib/chain";

/** A shareable, chain-specific recipient address for direct pool deposits. */
export function PoolReceiveSheet({
  pool,
  open,
  onClose,
}: {
  pool: Pick<UserPool, "address"> & Partial<Pick<UserPool, "name">>;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const receiveName = pool.name || pool.address;
  const qrValue = `ethereum:${pool.address}@${CHAIN_ID}`;

  const copy = () => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy address`);
      return;
    }
    void navigator.clipboard
      .writeText(receiveName)
      .then(() => toast.success(t`Address copied`))
      .catch(() => toast.error(t`Couldn't copy address`));
  };

  return (
    <SheetRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border bg-background shadow-none">
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-heading text-base font-semibold">
                  <Trans>Receive vouchers</Trans>
                </SheetTitle>
                <p className="text-muted-foreground text-sm">
                  <Trans>Send supported vouchers to this pool address.</Trans>
                </p>
              </SheetHeader>

              <div className="flex flex-col items-center px-4 pb-2">
                <AddressQRCode value={qrValue} size={184} />
                <p className="mt-4 mb-1.5 w-full text-muted-foreground text-xs">
                  <Trans>Pool address</Trans>
                </p>
                <button
                  type="button"
                  aria-label={t`Copy pool address`}
                  className="flex min-h-11 w-full items-center justify-between gap-3 border border-border bg-card p-3 text-start"
                  onClick={copy}
                >
                  {pool.name ? (
                    <span className="break-all text-sm">{pool.name}</span>
                  ) : (
                    <HighlightAddress
                      address={pool.address}
                      tailLength={6}
                      className="min-w-0 break-all text-[0.625rem] leading-tight"
                    />
                  )}
                  <RiFileCopyLine
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </div>

              <SheetFooter>
                <Button className="h-11 w-full" onClick={onClose}>
                  <Trans>Done</Trans>
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
