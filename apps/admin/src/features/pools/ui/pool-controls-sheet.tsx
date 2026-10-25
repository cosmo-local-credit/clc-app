import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import {
  buildRemovePairFeeCall,
  buildSealPoolCall,
  buildSetHolderLimitCall,
  buildSetOracleMaxStalenessCall,
  buildSetOracleMultiplierCall,
  buildSetPairFeeCall,
  buildSetPoolFeeCalls,
  buildTransferPoolOwnershipCalls,
  buildWithdrawPoolLiquidityCalls,
  ORACLE_MAX_MULTIPLIER,
  ORACLE_MIN_MULTIPLIER,
  ownershipRecipientSchema,
  POOL_FEE_PERCENT_DECIMALS,
  POOL_SEAL_FEE_ADDRESS,
} from "@clc/core/features/pool-admin/logic";
import { buildCollectPoolFeesCalls } from "@clc/core/features/pool-swaps/logic";
import {
  buildInvalidateOracleRelayCall,
  buildSetOracleRelayWriterCall,
} from "@clc/core/features/protocol-admin/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { parseTokenAmount } from "@clc/core/features/wallet/logic";
import { isAddress, zeroAddress } from "viem";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { errorMessage } from "#/lib/data-state";
import { POOL_OWNERSHIP_TRANSFER_ENABLED } from "#/lib/ownership-transfer-config";
import { sameAddress, useOperatorAddress } from "#/features/operator/operator-address";
import { useOperatorCalls } from "#/features/operator/use-operator-calls";
import { SEAL_BITS } from "./pool-seal-bits";
import { usePoolStewardState } from "../use-pool-steward";
import { useState } from "react";

const percentSchema = z
  .string()
  .trim()
  .refine((value) => {
    try {
      const ppm = BigInt(parseTokenAmount(value, POOL_FEE_PERCENT_DECIMALS));
      return ppm <= 1_000_000n;
    } catch {
      return false;
    }
  }, "Enter a fee from 0 to 100");

const addressSchema = z
  .string()
  .trim()
  .refine((value) => isAddress(value) && value.toLowerCase() !== zeroAddress, "Enter an address");

function feePpm(percent: string): string {
  return parseTokenAmount(percent, POOL_FEE_PERCENT_DECIMALS);
}

export function PoolControlsSheet({
  pool,
  vouchers,
  open,
  onClose,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  open: boolean;
  onClose: () => void;
}) {
  const operator = useOperatorAddress();
  const steward = usePoolStewardState(pool);
  const calls = useOperatorCalls();
  const chainOwner = steward.data?.owner ?? pool.ownerAddress;
  const canSign = sameAddress(operator, chainOwner);
  const seal = steward.data?.sealState ?? 0;
  const feeAddressSealed = (seal & POOL_SEAL_FEE_ADDRESS) === POOL_SEAL_FEE_ADDRESS;
  const [sealMask, setSealMask] = useState(0);

  async function send(label: string, build: () => Parameters<typeof calls.mutateAsync>[0]) {
    try {
      await calls.mutateAsync(build());
      toast.success(label);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && !calls.isPending && onClose()}>
      <SheetContent className="w-full bg-card shadow-none data-[side=right]:sm:max-w-[32rem]">
        <SheetHeader className="border-border border-b">
          <SheetTitle>Pool controls</SheetTitle>
          <SheetDescription>{pool.symbol}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          <dl className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground text-xs">Owner</dt>
            <dd className="font-data min-w-0 truncate text-xs">{chainOwner ?? "—"}</dd>
          </dl>
          {canSign ? (
            <>
              <FeeForm
                pool={pool}
                pending={calls.isPending}
                feeAddressSealed={feeAddressSealed}
                onSubmit={(value) =>
                  void send("Fee updated", () =>
                    buildSetPoolFeeCalls({
                      poolAddress: pool.address,
                      feePolicyAddress: pool.feePolicyAddress,
                      ...(value.percent ? { feePpm: feePpm(value.percent) } : {}),
                      ...(value.recipient ? { feeAddress: value.recipient as `0x${string}` } : {}),
                    }),
                  )
                }
              />
              <PairFeeForm
                pending={calls.isPending}
                onSet={(value) =>
                  void send("Pair fee set", () => [
                    buildSetPairFeeCall({
                      feePolicyAddress: pool.feePolicyAddress as `0x${string}`,
                      tokenIn: value.tokenIn as `0x${string}`,
                      tokenOut: value.tokenOut as `0x${string}`,
                      feePpm: feePpm(value.percent),
                    }),
                  ])
                }
                onRemove={(value) =>
                  void send("Pair fee removed", () => [
                    buildRemovePairFeeCall({
                      feePolicyAddress: pool.feePolicyAddress as `0x${string}`,
                      tokenIn: value.tokenIn as `0x${string}`,
                      tokenOut: value.tokenOut as `0x${string}`,
                    }),
                  ])
                }
              />
              <LiquidityForm
                vouchers={vouchers}
                operator={operator}
                pending={calls.isPending}
                onWithdraw={(value) =>
                  void send("Liquidity withdrawn", () =>
                    buildWithdrawPoolLiquidityCalls({
                      poolAddress: pool.address,
                      tokenAddress: value.token as `0x${string}`,
                      recipientAddress: value.recipient as `0x${string}`,
                      amountRaw: parseTokenAmount(value.amount, decimalsOf(vouchers, value.token)),
                    }),
                  )
                }
                onCollect={(token) =>
                  void send("Fees collected", () =>
                    buildCollectPoolFeesCalls({
                      poolAddress: pool.address,
                      tokenOut: token as `0x${string}`,
                    }),
                  )
                }
              />
              {pool.quoterType === "oracle" && pool.quoterAddress ? (
                <OracleForm
                  pending={calls.isPending}
                  onStaleness={(seconds) =>
                    void send("Staleness updated", () => [
                      buildSetOracleMaxStalenessCall({
                        quoterAddress: pool.quoterAddress as `0x${string}`,
                        maxStalenessSeconds: seconds,
                      }),
                    ])
                  }
                  onMultiplier={(ppm) =>
                    void send("Multiplier updated", () => [
                      buildSetOracleMultiplierCall({
                        quoterAddress: pool.quoterAddress as `0x${string}`,
                        multiplierPpm: ppm,
                      }),
                    ])
                  }
                  onWriter={(relay, writer, invalidate) =>
                    void send(invalidate ? "Feed invalidated" : "Writer updated", () => [
                      invalidate
                        ? buildInvalidateOracleRelayCall({
                            relayAddress: relay as `0x${string}`,
                            writerAddress: writer as `0x${string}`,
                          })
                        : buildSetOracleRelayWriterCall({
                            relayAddress: relay as `0x${string}`,
                            writerAddress: writer as `0x${string}`,
                          }),
                    ])
                  }
                />
              ) : null}
              {pool.limiterAddress ? (
                <HolderLimitForm
                  pending={calls.isPending}
                  onSubmit={(value) =>
                    void send("Holder limit set", () => [
                      buildSetHolderLimitCall({
                        limiterAddress: pool.limiterAddress as `0x${string}`,
                        tokenAddress: value.token as `0x${string}`,
                        holderAddress: value.holder as `0x${string}`,
                        limitRaw: parseTokenAmount(value.amount, decimalsOf(vouchers, value.token)),
                      }),
                    ])
                  }
                />
              ) : null}
              <section className="space-y-3">
                <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
                  Seal
                </h2>
                <ul className="space-y-2">
                  {SEAL_BITS.map((item) => {
                    const locked = (seal & item.bit) === item.bit;
                    const blocked =
                      item.bit === POOL_SEAL_FEE_ADDRESS &&
                      (steward.data?.feeAddress ?? pool.feeAddress) === zeroAddress;
                    return (
                      <li key={item.bit} className="flex items-center gap-2">
                        <Checkbox
                          checked={locked || (sealMask & item.bit) === item.bit}
                          disabled={locked || blocked || calls.isPending}
                          onCheckedChange={(checked) =>
                            setSealMask((current) =>
                              checked ? current | item.bit : current & ~item.bit,
                            )
                          }
                        />
                        <span className="text-sm">{item.label}</span>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  type="button"
                  disabled={calls.isPending || sealMask === 0}
                  onClick={() =>
                    void send("Pool sealed", () => [
                      buildSealPoolCall({ poolAddress: pool.address, state: sealMask }),
                    ]).then(() => setSealMask(0))
                  }
                >
                  Seal
                </Button>
              </section>
              {POOL_OWNERSHIP_TRANSFER_ENABLED ? (
                <OwnershipForm
                  pool={pool}
                  pending={calls.isPending}
                  onSubmit={(recipient) =>
                    void send("Ownership transferred", () =>
                      buildTransferPoolOwnershipCalls({
                        poolAddress: pool.address,
                        registryAddress: pool.tokenRegistryAddress,
                        limiterAddress: pool.limiterAddress,
                        feePolicyAddress: pool.feePolicyAddress,
                        quoterAddress: pool.quoterAddress,
                        protocolFeeControllerAddress: pool.protocolFeeControllerAddress,
                        quoterType: pool.quoterType,
                        ownerAddress: (chainOwner ?? pool.address) as `0x${string}`,
                        newOwnerAddress: recipient as `0x${string}`,
                      }),
                    )
                  }
                />
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function decimalsOf(vouchers: PoolVoucher[], token: string): number {
  const match = vouchers.find(
    (voucher) => voucher.tokenAddress.toLowerCase() === token.toLowerCase(),
  );
  return match?.decimals ?? 0;
}

function FeeForm({
  pool,
  pending,
  feeAddressSealed,
  onSubmit,
}: {
  pool: UserPool;
  pending: boolean;
  feeAddressSealed: boolean;
  onSubmit: (value: { percent: string; recipient: string }) => void;
}) {
  const form = useForm({
    defaultValues: { percent: "", recipient: "" },
    validators: {
      onSubmit: z.object({
        percent: z.string(),
        recipient: z.string(),
      }),
    },
    onSubmit: ({ value }) => {
      try {
        if (!value.percent.trim() && !value.recipient.trim()) return;
        if (value.percent.trim()) percentSchema.parse(value.percent);
        if (value.recipient.trim()) addressSchema.parse(value.recipient);
        if (feeAddressSealed && value.recipient.trim()) {
          throw new Error("The fee recipient is sealed.");
        }
        onSubmit(value);
      } catch (error) {
        toastIssue(error);
      }
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
        Default fee
      </h2>
      <form.Field name="percent">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor={field.name}>Percent</Label>
            <Input
              id={field.name}
              inputMode="decimal"
              className="font-data"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError message={getFieldError(field.state.meta.errors)} />
          </div>
        )}
      </form.Field>
      <form.Field name="recipient">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor={field.name}>Recipient</Label>
            <Input
              id={field.name}
              className="font-data"
              disabled={feeAddressSealed}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder={pool.feeAddress ?? ""}
            />
            <FieldError message={getFieldError(field.state.meta.errors)} />
          </div>
        )}
      </form.Field>
      <Button type="submit" disabled={pending || !pool.feePolicyAddress}>
        {pending ? "Working…" : "Save fee"}
      </Button>
    </form>
  );
}

function PairFeeForm({
  pending,
  onSet,
  onRemove,
}: {
  pending: boolean;
  onSet: (value: { tokenIn: string; tokenOut: string; percent: string }) => void;
  onRemove: (value: { tokenIn: string; tokenOut: string }) => void;
}) {
  const form = useForm({
    defaultValues: { tokenIn: "", tokenOut: "", percent: "" },
    onSubmit: ({ value }) => {
      try {
        addressSchema.parse(value.tokenIn);
        addressSchema.parse(value.tokenOut);
        if (value.percent.trim()) {
          const parsed = percentSchema.parse(value.percent);
          if (feePpm(parsed) === "0") {
            throw new Error("Remove the pair fee instead of storing zero.");
          }
          onSet(value);
          return;
        }
        onRemove(value);
      } catch (error) {
        toastIssue(error);
      }
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
        Pair fee
      </h2>
      <form.Field name="tokenIn">
        {(field) => (
          <AddressInput
            id={field.name}
            label="Token in"
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="tokenOut">
        {(field) => (
          <AddressInput
            id={field.name}
            label="Token out"
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="percent">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="pair-percent">Percent</Label>
            <Input
              id="pair-percent"
              inputMode="decimal"
              className="font-data"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Set pair fee
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            const value = form.state.values;
            try {
              addressSchema.parse(value.tokenIn);
              addressSchema.parse(value.tokenOut);
              onRemove(value);
            } catch (error) {
              toastIssue(error);
            }
          }}
        >
          Remove
        </Button>
      </div>
    </form>
  );
}

function LiquidityForm({
  vouchers,
  operator,
  pending,
  onWithdraw,
  onCollect,
}: {
  vouchers: PoolVoucher[];
  operator: `0x${string}` | null;
  pending: boolean;
  onWithdraw: (value: { token: string; amount: string; recipient: string }) => void;
  onCollect: (token: string) => void;
}) {
  const form = useForm({
    defaultValues: {
      token: `${vouchers[0]?.tokenAddress ?? ""}`,
      amount: "",
      recipient: operator ?? "",
    },
    onSubmit: ({ value }) => {
      try {
        addressSchema.parse(value.token);
        addressSchema.parse(value.recipient);
        if (!value.amount.trim()) throw new Error("Enter an amount.");
        onWithdraw(value);
      } catch (error) {
        toastIssue(error);
      }
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
        Liquidity
      </h2>
      <form.Field name="token">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="liquidity-token">Voucher</Label>
            <Input
              id="liquidity-token"
              className="font-data"
              list="pool-voucher-addresses"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <datalist id="pool-voucher-addresses">
              {vouchers.map((voucher) => (
                <option key={voucher.id} value={voucher.tokenAddress}>
                  {voucher.symbol}
                </option>
              ))}
            </datalist>
          </div>
        )}
      </form.Field>
      <form.Field name="amount">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="liquidity-amount">Amount</Label>
            <Input
              id="liquidity-amount"
              inputMode="decimal"
              className="font-data"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="recipient">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="liquidity-recipient">Recipient</Label>
            <Input
              id="liquidity-recipient"
              className="font-data"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Withdraw
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            try {
              onCollect(addressSchema.parse(form.state.values.token));
            } catch (error) {
              toastIssue(error);
            }
          }}
        >
          Collect fees
        </Button>
      </div>
    </form>
  );
}

function OracleForm({
  pending,
  onStaleness,
  onMultiplier,
  onWriter,
}: {
  pending: boolean;
  onStaleness: (seconds: string) => void;
  onMultiplier: (ppm: string) => void;
  onWriter: (relay: string, writer: string, invalidate: boolean) => void;
}) {
  const form = useForm({
    defaultValues: { staleness: "", multiplier: "", relay: "", writer: "" },
    onSubmit: () => undefined,
  });
  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
        Oracle
      </h2>
      <form.Field name="staleness">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="oracle-staleness">Max staleness, seconds</Label>
            <Input
              id="oracle-staleness"
              inputMode="numeric"
              className="font-data"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          const value = form.state.values.staleness.trim();
          if (!/^\d+$/.test(value)) {
            toast.error("Enter staleness in whole seconds.");
            return;
          }
          onStaleness(value);
        }}
      >
        Save staleness
      </Button>
      <form.Field name="multiplier">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="oracle-multiplier">Multiplier, PPM</Label>
            <Input
              id="oracle-multiplier"
              inputMode="numeric"
              className="font-data"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          const value = form.state.values.multiplier.trim();
          if (!/^\d+$/.test(value)) {
            toast.error("Enter a multiplier in PPM.");
            return;
          }
          const ppm = BigInt(value);
          if (ppm < BigInt(ORACLE_MIN_MULTIPLIER) || ppm > BigInt(ORACLE_MAX_MULTIPLIER)) {
            toast.error("Multiplier must be between 900000 and 1000000.");
            return;
          }
          onMultiplier(value);
        }}
      >
        Save multiplier
      </Button>
      <form.Field name="relay">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="oracle-relay">Relay</Label>
            <Input
              id="oracle-relay"
              className="font-data"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="writer">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="oracle-writer">Writer</Label>
            <Input
              id="oracle-writer"
              className="font-data"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => onWriter(form.state.values.relay, form.state.values.writer, false)}
        >
          Set writer
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => onWriter(form.state.values.relay, form.state.values.writer, true)}
        >
          Invalidate
        </Button>
      </div>
    </section>
  );
}

function HolderLimitForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (value: { token: string; holder: string; amount: string }) => void;
}) {
  const form = useForm({
    defaultValues: { token: "", holder: "", amount: "0" },
    onSubmit: ({ value }) => {
      try {
        addressSchema.parse(value.token);
        addressSchema.parse(value.holder);
        onSubmit(value);
      } catch (error) {
        toastIssue(error);
      }
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
        Holder limit
      </h2>
      <form.Field name="token">
        {(field) => (
          <AddressInput
            id={field.name}
            label="Token"
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="holder">
        {(field) => (
          <AddressInput
            id={field.name}
            label="Holder"
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="amount">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="holder-amount">Amount</Label>
            <Input
              id="holder-amount"
              inputMode="decimal"
              className="font-data"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>
      <Button type="submit" disabled={pending}>
        Set limit
      </Button>
    </form>
  );
}

function OwnershipForm({
  pool,
  pending,
  onSubmit,
}: {
  pool: UserPool;
  pending: boolean;
  onSubmit: (recipient: string) => void;
}) {
  const form = useForm({
    defaultValues: { recipient: "" },
    onSubmit: ({ value }) => {
      try {
        ownershipRecipientSchema(pool.ownerAddress ?? "", [
          pool.address,
          pool.tokenRegistryAddress,
          pool.limiterAddress,
          pool.feePolicyAddress,
          pool.quoterAddress,
          pool.protocolFeeControllerAddress,
        ]).parse(value.recipient);
        onSubmit(value.recipient);
      } catch (error) {
        toastIssue(error);
      }
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
        Ownership
      </h2>
      <form.Field name="recipient">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="pool-owner">New owner</Label>
            <Input
              id="pool-owner"
              className="font-data"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError message={getFieldError(field.state.meta.errors)} />
          </div>
        )}
      </form.Field>
      <Button type="submit" disabled={pending}>
        Transfer ownership
      </Button>
    </form>
  );
}

function AddressInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className="font-data"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function toastIssue(error: unknown) {
  if (error instanceof z.ZodError) {
    toast.error(error.issues[0]?.message ?? "Check the fields.");
    return;
  }
  toast.error(errorMessage(error));
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}
