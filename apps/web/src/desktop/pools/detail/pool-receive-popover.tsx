import type { UserPool } from "@clc/api/features/pools/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { RiFileCopyLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger } from "#/components/ui/popover";
import { AddressQRCode, HighlightAddress } from "#/components/wallet";
import { usePoolReceive } from "#/features/pools/hooks/use-pool-receive";

/** Receive, anchored to its button: the pool's QR and the name (or address) to copy. */
export function PoolReceivePopover({ pool }: { pool: UserPool }) {
  const { t } = useLingui();
  const { poolName, qrValue, copy } = usePoolReceive(pool);
  return (
    <PopoverRoot>
      <PopoverTrigger
        render={
          <Button variant="outline">
            <Trans>Receive</Trans>
          </Button>
        }
      />
      <PopoverContent align="end" className="grid w-72 justify-items-center gap-3">
        <PopoverTitle className="justify-self-start font-heading text-base font-semibold">
          <Trans>Receive vouchers</Trans>
        </PopoverTitle>
        <AddressQRCode value={qrValue} size={184} />
        <div className="grid w-full gap-1.5">
          <span className="text-xs text-muted-foreground">
            {poolName ? <Trans>Pool name</Trans> : <Trans>Pool address</Trans>}
          </span>
          <button
            type="button"
            aria-label={poolName ? t`Copy pool name` : t`Copy pool address`}
            className="flex min-h-9 w-full min-w-0 items-center justify-between gap-3 border border-foreground/25 bg-card px-3 py-2 text-start hover:bg-muted/60"
            onClick={copy}
          >
            {poolName ? (
              <span dir="auto" className="min-w-0 truncate text-sm">
                {poolName}
              </span>
            ) : (
              <HighlightAddress
                address={pool.address}
                tailLength={6}
                className="min-w-0 break-all text-xs"
              />
            )}
            <RiFileCopyLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
