import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import {
  buildRemoveOracleCall,
  buildRemovePoolVoucherCalls,
  buildSetHolderLimitCall,
} from "@clc/core/features/pool-admin/logic";
import {
  buildInvalidateOracleRelayCall,
  buildSetOracleRelayWriterCall,
} from "@clc/core/features/protocol-admin/logic";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { parseTokenAmount } from "@clc/core/features/wallet/logic";
import { useState } from "react";
import { toast } from "sonner";
import { isAddress, zeroAddress } from "viem";

import { ConfirmDialog } from "#/components/admin/confirm-dialog";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { sameAddress, useOperatorAddress } from "#/features/operator/operator-address";
import { useOperatorCalls } from "#/features/operator/use-operator-calls";
import { errorMessage } from "#/lib/data-state";
import type { PoolFeedGroup } from "../pool-posture";
import { usePoolStewardState } from "../use-pool-steward";

/** Registry removal and a per-holder cap. Hidden unless the operator owns the pool. */
export function PoolVoucherChainActions({
  pool,
  voucher,
}: {
  pool: UserPool;
  voucher: PoolVoucher;
}) {
  const operator = useOperatorAddress();
  const calls = useOperatorCalls();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [holder, setHolder] = useState("");
  const [amount, setAmount] = useState("0");
  if (!sameAddress(operator, pool.ownerAddress)) return null;

  async function send(label: string, build: () => Parameters<typeof calls.mutateAsync>[0]) {
    try {
      await calls.mutateAsync(build());
      toast.success(label);
      setRemoveOpen(false);
      setLimitOpen(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={calls.isPending || pool.tokenRegistryAddress === null}
        aria-label={`Remove ${voucher.symbol}`}
        onClick={() => setRemoveOpen(true)}
      >
        Remove
      </Button>
      {pool.limiterAddress ? (
        <Button
          variant="outline"
          size="sm"
          disabled={calls.isPending}
          aria-label={`Limit ${voucher.symbol}`}
          onClick={() => setLimitOpen(true)}
        >
          Limit
        </Button>
      ) : null}
      <ConfirmDialog
        open={removeOpen}
        title={`Remove ${voucher.symbol}`}
        description="This takes the voucher out of the pool registry."
        confirmLabel="Remove"
        destructive
        pending={calls.isPending}
        onCancel={() => setRemoveOpen(false)}
        onConfirm={() =>
          void send("Voucher removed", () =>
            buildRemovePoolVoucherCalls({
              tokenAddress: voucher.tokenAddress,
              registryAddress: pool.tokenRegistryAddress,
            }),
          )
        }
      />
      <ConfirmDialog
        open={limitOpen}
        title={`Limit ${voucher.symbol}`}
        description="Zero blocks any further balance for that holder."
        confirmLabel="Set limit"
        pending={calls.isPending}
        onCancel={() => setLimitOpen(false)}
        onConfirm={() => {
          if (!isAddress(holder) || holder.toLowerCase() === zeroAddress) {
            toast.error("Enter a holder address.");
            return;
          }
          let limitRaw: string;
          try {
            limitRaw = parseTokenAmount(amount.trim() || "0", voucher.decimals ?? 0);
          } catch (error) {
            toast.error(errorMessage(error));
            return;
          }
          void send("Holder limit set", () => [
            buildSetHolderLimitCall({
              limiterAddress: pool.limiterAddress as `0x${string}`,
              tokenAddress: voucher.tokenAddress,
              holderAddress: holder,
              limitRaw,
            }),
          ]);
        }}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`holder-${voucher.id}`}>Holder</Label>
            <Input
              id={`holder-${voucher.id}`}
              className="font-data"
              value={holder}
              onChange={(event) => setHolder(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`limit-${voucher.id}`}>Amount</Label>
            <Input
              id={`limit-${voucher.id}`}
              inputMode="decimal"
              className="font-data"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}

/** Live oracle policy. Shown whether or not the operator can change it. */
export function PoolFeedPolicy({ pool }: { pool: UserPool }) {
  const state = usePoolStewardState(pool);
  const staleness = state.isPending ? "Reading" : (state.data?.maxStaleness ?? "—");
  const multiplier = state.isPending ? "Reading" : (state.data?.multiplierPpm ?? "—");
  return (
    <span className="font-data text-muted-foreground text-xs">
      Staleness {staleness} · Multiplier {multiplier}
    </span>
  );
}

/** Per-feed removal and relay writer changes, for the pool owner only. */
export function PoolFeedRowActions({ pool, group }: { pool: UserPool; group: PoolFeedGroup }) {
  const operator = useOperatorAddress();
  const calls = useOperatorCalls();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [writerOpen, setWriterOpen] = useState(false);
  const [writer, setWriter] = useState("");
  const relay = group.address;
  if (!sameAddress(operator, pool.ownerAddress) || !relay || !pool.quoterAddress) return null;

  async function send(label: string, build: () => Parameters<typeof calls.mutateAsync>[0]) {
    try {
      await calls.mutateAsync(build());
      toast.success(label);
      setRemoveOpen(false);
      setWriterOpen(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function applyWriter(invalidate: boolean) {
    if (!isAddress(writer) || writer.toLowerCase() === zeroAddress || !relay) {
      toast.error("Enter a writer address.");
      return;
    }
    const input = { relayAddress: relay, writerAddress: writer };
    void send(invalidate ? "Relay invalidated" : "Writer set", () => [
      invalidate ? buildInvalidateOracleRelayCall(input) : buildSetOracleRelayWriterCall(input),
    ]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={calls.isPending}
        onClick={() => setRemoveOpen(true)}
      >
        Remove feed
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={calls.isPending}
        onClick={() => setWriterOpen(true)}
      >
        Writer
      </Button>
      <ConfirmDialog
        open={removeOpen}
        title="Remove feed"
        description="This drops every voucher on the feed from the quoter."
        confirmLabel="Remove feed"
        destructive
        pending={calls.isPending}
        onCancel={() => setRemoveOpen(false)}
        onConfirm={() =>
          void send("Feed removed", () =>
            group.vouchers.map((voucher) =>
              buildRemoveOracleCall({
                quoterAddress: pool.quoterAddress as `0x${string}`,
                tokenAddress: voucher.tokenAddress,
              }),
            ),
          )
        }
      />
      <ConfirmDialog
        open={writerOpen}
        title="Relay writer"
        description={formatVoucherAddress(relay)}
        confirmLabel="Set writer"
        pending={calls.isPending}
        onCancel={() => setWriterOpen(false)}
        onConfirm={() => applyWriter(false)}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`writer-${group.key}`}>Writer</Label>
          <Input
            id={`writer-${group.key}`}
            className="font-data"
            value={writer}
            onChange={(event) => setWriter(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={calls.isPending}
            onClick={() => applyWriter(true)}
          >
            {calls.isPending ? "Working…" : "Invalidate"}
          </Button>
        </div>
      </ConfirmDialog>
    </div>
  );
}
