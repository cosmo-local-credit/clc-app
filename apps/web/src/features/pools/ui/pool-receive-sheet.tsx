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
  const poolName = pool.name?.trim() || null;
  const receiveName = poolName ?? pool.address;
  const qrValue = `ethereum:${pool.address}@${CHAIN_ID}`;

  const copy = () => {
    if (!navigator.clipboard) {
      toast.error(poolName ? t`Couldn't copy pool name` : t`Couldn't copy address`);
      return;
    }
    void navigator.clipboard
      .writeText(receiveName)
      .then(() => toast.success(poolName ? t`Pool name copied` : t`Address copied`))
      .catch(() => toast.error(poolName ? t`Couldn't copy pool name` : t`Couldn't copy address`));
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
        <SheetContent>
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  <Trans>Receive vouchers</Trans>
                </SheetTitle>
              </SheetHeader>

              <div className="flex flex-col items-center px-4 pb-2">
                <AddressQRCode value={qrValue} size={184} />
                <p className="mt-4 mb-1.5 w-full text-muted-foreground text-xs">
                  {poolName ? <Trans>Pool name</Trans> : <Trans>Pool address</Trans>}
                </p>
                <button
                  type="button"
                  aria-label={poolName ? t`Copy pool name` : t`Copy pool address`}
                  className="flex min-h-11 w-full items-center justify-between gap-3 border border-border bg-card p-3 text-start"
                  onClick={copy}
                >
                  {poolName ? (
                    <span dir="auto" className="break-all text-sm">
                      {poolName}
                    </span>
                  ) : (
                    <HighlightAddress
                      address={pool.address}
                      tailLength={6}
                      className="min-w-0 break-all text-xs"
                    />
                  )}
                  <RiFileCopyLine
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </div>

              <SheetFooter>
                <Button size="lg" className="w-full" onClick={onClose}>
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
