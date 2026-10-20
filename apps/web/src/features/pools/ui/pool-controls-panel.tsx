import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  buildSetPoolFeeCalls,
  buildWithdrawPoolLiquidityCalls,
  POOL_FEE_PERCENT_DECIMALS,
} from "@clc/core/features/pool-admin/logic";
import { buildCollectPoolFeesCalls } from "@clc/core/features/pool-swaps/logic";
import { formatTokenAmount, parseTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import {
  RiHandCoinLine,
  RiPencilLine,
  RiSafe2Line,
  RiUserSharedLine,
  RiWalletLine,
} from "react-icons/ri";
import { toast } from "sonner";
import { isAddress, zeroAddress } from "viem";
import { useConnection } from "wagmi";

import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { RecipientAddressInput } from "#/components/wallet/recipient-address-input";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { usePoolAdminRelay } from "#/features/pools/hooks/use-pool-admin";
import {
  type PoolFeeSettings,
  usePoolFeeSettings,
} from "#/features/pools/hooks/use-pool-fee-settings";
import { usePoolTreasury } from "#/features/pools/hooks/use-pool-treasury";

import { POOL_OWNERSHIP_TRANSFER_ENABLED } from "#/lib/ownership-transfer-config";

import { PoolOwnershipTransferForm } from "./pool-ownership-transfer-form";
import { PoolProfileEditorSheet } from "./pool-profile-editor-sheet";

type ControlSheet = "details" | "liquidity" | "fees" | "feeSettings" | "ownership";

/**
 * Everything a steward can change about one pool, in a single group.
 *
 * The three on-chain rows land on SwapPool itself and are the same whichever
 * quoter the pool runs, so they sit apart from the voucher sheet rather than
 * inside it: nothing here changes when a pool is repriced, and nothing here is
 * affected by adding a quoter the app does not yet configure.
 *
 * Editing the catalog record rides along rather than sitting above as a button
 * of its own — it is the same kind of settings row, and a lone full-width
 * control stranded over a row group reads as a different class of action than
 * it is. The two are separately gated: a superadmin may correct any pool's
 * record, while every on-chain call below is `onlyOwner` on a contract the
 * pool's owner deployed, so a superadmin would only be signing a revert.
 */
export function PoolControlsPanel({
  pool,
  vouchers,
  canManageOnChain,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  canManageOnChain: boolean;
}) {
  const { t } = useLingui();
  const [sheet, setSheet] = useState<ControlSheet | null>(null);
  // Balances are read for the withdraw sheets alone, so a superadmin who can
  // only edit the record never pays for the calls.
  const treasury = usePoolTreasury(
    pool,
    vouchers.map((voucher) => voucher.tokenAddress),
    canManageOnChain,
  );
  const feeSettings = usePoolFeeSettings(pool, canManageOnChain);
  const fee = feeSettings.data;

  return (
    <>
      <section className="border border-border bg-card" aria-label={t`Pool controls`}>
        <ActionRow
          icon={<RiPencilLine className="size-4" aria-hidden="true" />}
          label={t`Edit details`}
          onClick={() => setSheet("details")}
        />
        {canManageOnChain ? (
          <>
            <ActionRow
              icon={<RiSafe2Line className="size-4" aria-hidden="true" />}
              label={t`Withdraw liquidity`}
              onClick={() => setSheet("liquidity")}
            />
            <ActionRow
              icon={<RiHandCoinLine className="size-4" aria-hidden="true" />}
              label={t`Withdraw fees`}
              onClick={() => setSheet("fees")}
            />
            <ActionRow
              icon={<RiWalletLine className="size-4" aria-hidden="true" />}
              label={t`Fee % and recipient`}
              value={
                <span className="font-mono">
                  {fee
                    ? `${fee.feePercent}% · ${fee.feeAddress ? formatVoucherAddress(fee.feeAddress) : t`Not set`}`
                    : feeSettings.isError
                      ? t`Unavailable`
                      : t`Reading…`}
                </span>
              }
              onClick={() => setSheet("feeSettings")}
            />
            {POOL_OWNERSHIP_TRANSFER_ENABLED ? (
              <ActionRow
                icon={<RiUserSharedLine className="size-4" aria-hidden="true" />}
                label={t`Transfer ownership`}
                onClick={() => setSheet("ownership")}
              />
            ) : null}
          </>
        ) : null}
      </section>

      <PoolProfileEditorSheet
        open={sheet === "details"}
        pool={pool}
        onClose={() => setSheet(null)}
      />

      <ControlSheetShell
        open={sheet === "liquidity"}
        title={t`Withdraw liquidity`}
        onClose={() => setSheet(null)}
      >
        <WithdrawLiquidityForm
          pool={pool}
          vouchers={vouchers}
          treasury={treasury.data}
          onDone={() => setSheet(null)}
        />
      </ControlSheetShell>

      <ControlSheetShell
        open={sheet === "fees"}
        title={t`Withdraw fees`}
        onClose={() => setSheet(null)}
      >
        <CollectFeesForm
          pool={pool}
          vouchers={vouchers}
          treasury={treasury.data}
          feeAddress={fee?.feeAddress ?? null}
          onDone={() => setSheet(null)}
        />
      </ControlSheetShell>

      <ControlSheetShell
        open={sheet === "ownership"}
        title={t`Transfer ownership`}
        onClose={() => setSheet(null)}
      >
        <PoolOwnershipTransferForm pool={pool} settings={fee} onDone={() => setSheet(null)} />
      </ControlSheetShell>

      <ControlSheetShell
        open={sheet === "feeSettings"}
        title={t`Fee % and recipient`}
        onClose={() => setSheet(null)}
      >
        <FeeSettingsForm pool={pool} settings={fee} onDone={() => setSheet(null)} />
      </ControlSheetShell>
    </>
  );
}

function ControlSheetShell({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
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
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {/* Mounted only while open so each visit starts from the current
              balances rather than the ones the sheet last closed on. */}
          {open ? children : null}
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

/**
 * Sends pool liquidity to the owner's own wallet.
 *
 * Recipient is not a field: `withdrawLiquidity` is the emergency exit, the
 * caller is already the only address allowed to make it, and offering a free-text
 * destination on a phone turns a typo into an irrecoverable transfer.
 */
function WithdrawLiquidityForm({
  pool,
  vouchers,
  treasury,
  onDone,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  treasury: Map<string, { withdrawableRaw: string }> | undefined;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const { address } = useConnection();
  const relay = usePoolAdminRelay();
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const selected = vouchers.find((voucher) => voucher.tokenAddress.toLowerCase() === tokenAddress);
  const decimals = selected?.decimals ?? null;
  const withdrawableRaw = tokenAddress ? treasury?.get(tokenAddress)?.withdrawableRaw : undefined;
  const withdrawable =
    withdrawableRaw !== undefined && decimals !== null
      ? formatTokenAmount(withdrawableRaw, decimals, 2)
      : null;

  const submit = async () => {
    if (!selected || decimals === null || !address) return;
    let amountRaw: string;
    try {
      amountRaw = parseTokenAmount(amount.trim(), decimals);
    } catch {
      toast.error(t`Enter an amount this voucher supports.`);
      return;
    }
    if (BigInt(amountRaw) <= 0n) {
      toast.error(t`Enter an amount greater than zero.`);
      return;
    }
    if (withdrawableRaw !== undefined && BigInt(amountRaw) > BigInt(withdrawableRaw)) {
      toast.error(t`The pool doesn't hold that much ${selected.symbol}.`);
      return;
    }

    try {
      await relay.mutateAsync(
        buildWithdrawPoolLiquidityCalls({
          poolAddress: pool.address,
          tokenAddress: selected.tokenAddress,
          recipientAddress: address,
          amountRaw,
        }),
      );
      toast.success(t`${amount} ${selected.symbol} withdrawn.`);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`The transaction failed.`);
    }
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        <TokenChooser
          vouchers={vouchers}
          selectedAddress={tokenAddress}
          onSelect={(next) => {
            setTokenAddress(next);
            setAmount("");
          }}
          amountFor={(voucher) => {
            const entry = treasury?.get(voucher.tokenAddress.toLowerCase());
            if (!entry || voucher.decimals === null) return null;
            return `${formatTokenAmount(entry.withdrawableRaw, voucher.decimals, 2)} ${voucher.symbol}`;
          }}
        />

        {selected ? (
          <Field
            label={t`Amount`}
            htmlFor="pool-withdraw-amount"
            hint={
              withdrawable
                ? t`${withdrawable} ${selected.symbol} available. Fees held for collection stay in the pool.`
                : t`Reading the pool's balance…`
            }
          >
            <div className="flex gap-2">
              <Input
                id="pool-withdraw-amount"
                dir="ltr"
                inputMode="decimal"
                value={amount}
                placeholder="0"
                onChange={(event) => setAmount(event.target.value)}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                tap
                disabled={!withdrawable}
                onClick={() => withdrawable && setAmount(withdrawable)}
              >
                <Trans>Max</Trans>
              </Button>
            </div>
          </Field>
        ) : null}
      </div>

      <SheetFooter>
        <Button
          type="button"
          tap
          className="w-full"
          disabled={!selected || !amount.trim()}
          pending={relay.isPending}
          onClick={() => void submit()}
        >
          {relay.isPending ? <Trans>Waiting for the chain…</Trans> : <Trans>Withdraw</Trans>}
        </Button>
      </SheetFooter>
    </>
  );
}

/**
 * Pays out everything accrued in one voucher. `withdraw(token)` sends the whole
 * balance to the pool's own `feeAddress`, never to the caller, so the
 * destination is shown rather than chosen — and a pool with no recipient set
 * cannot collect at all, which is stated instead of being discovered at relay.
 */
function CollectFeesForm({
  pool,
  vouchers,
  treasury,
  feeAddress,
  onDone,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  treasury: Map<string, { feesRaw: string }> | undefined;
  /** Read from the pool, not the catalog — see `usePoolFeeSettings`. */
  feeAddress: `0x${string}` | null;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const relay = usePoolAdminRelay();
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);

  const selected = vouchers.find((voucher) => voucher.tokenAddress.toLowerCase() === tokenAddress);
  const accruedRaw = tokenAddress ? treasury?.get(tokenAddress)?.feesRaw : undefined;

  const submit = async () => {
    if (!selected) return;
    if (accruedRaw !== undefined && BigInt(accruedRaw) === 0n) {
      toast.error(t`No ${selected.symbol} fees have accrued yet.`);
      return;
    }
    try {
      await relay.mutateAsync(
        buildCollectPoolFeesCalls({
          poolAddress: pool.address,
          tokenOut: selected.tokenAddress,
        }),
      );
      toast.success(t`${selected.symbol} fees sent to the fee recipient.`);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`The transaction failed.`);
    }
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        {feeAddress ? (
          <p className="text-muted-foreground text-xs">
            <Trans>Fees are paid to {formatVoucherAddress(feeAddress)}.</Trans>
          </p>
        ) : (
          <p role="alert" className="border border-border bg-card p-4 text-destructive text-sm">
            <Trans>Set a fee recipient before collecting, or the pool has nowhere to pay.</Trans>
          </p>
        )}

        <TokenChooser
          vouchers={vouchers}
          selectedAddress={tokenAddress}
          onSelect={setTokenAddress}
          amountFor={(voucher) => {
            const entry = treasury?.get(voucher.tokenAddress.toLowerCase());
            if (!entry || voucher.decimals === null) return null;
            return `${formatTokenAmount(entry.feesRaw, voucher.decimals, 2)} ${voucher.symbol}`;
          }}
        />
      </div>

      <SheetFooter>
        <Button
          type="button"
          tap
          className="w-full"
          disabled={!selected || !feeAddress}
          pending={relay.isPending}
          onClick={() => void submit()}
        >
          {relay.isPending ? <Trans>Waiting for the chain…</Trans> : <Trans>Collect fees</Trans>}
        </Button>
      </SheetFooter>
    </>
  );
}

/**
 * The pool's swap fee and the account it is paid to, changed together.
 *
 * Two contracts — the fee is the FeePolicy's `defaultFee`, the recipient is
 * SwapPool's `feeAddress` — and therefore two calls, relayed as one batch so a
 * steward never signs twice for one decision or lands halfway. Whichever field
 * is unchanged is left out of the batch rather than re-sent.
 *
 * Both fields start from the chain read, so the form shows what the pool
 * actually charges rather than what the catalog failed to record.
 */
function FeeSettingsForm({
  pool,
  settings,
  onDone,
}: {
  pool: UserPool;
  settings: PoolFeeSettings | undefined;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const relay = usePoolAdminRelay();
  const { address } = useConnection();
  const [feePercent, setFeePercent] = useState(settings?.feePercent ?? "");
  // Blank rather than the connected wallet when the pool has none: seeding the
  // owner's address here would present a recipient the pool does not have as
  // one it does, and `withdraw` would keep reverting until it was submitted.
  const [recipient, setRecipient] = useState<string>(settings?.feeAddress ?? "");

  const trimmedFee = feePercent.trim();
  const feeIsValid =
    trimmedFee !== "" &&
    /^\d+(\.\d{1,4})?$/.test(trimmedFee) &&
    Number(trimmedFee) >= 0 &&
    Number(trimmedFee) <= 100;
  const trimmedRecipient = recipient.trim();
  const recipientIsValid =
    isAddress(trimmedRecipient) && trimmedRecipient.toLowerCase() !== zeroAddress;

  const feeChanged = feeIsValid && trimmedFee !== settings?.feePercent;
  const recipientChanged =
    recipientIsValid && trimmedRecipient.toLowerCase() !== settings?.feeAddress?.toLowerCase();
  const canSubmit = feeIsValid && recipientIsValid && (feeChanged || recipientChanged);

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await relay.mutateAsync(
        buildSetPoolFeeCalls({
          poolAddress: pool.address,
          feePolicyAddress: pool.feePolicyAddress,
          ...(feeChanged
            ? { feePpm: parseTokenAmount(trimmedFee, POOL_FEE_PERCENT_DECIMALS) }
            : {}),
          ...(recipientChanged ? { feeAddress: trimmedRecipient as `0x${string}` } : {}),
        }),
      );
      toast.success(t`Pool fee updated.`);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`The transaction failed.`);
    }
  };

  // Both fields are seeded from the chain read, so a sheet opened before it
  // lands would present an empty form as though the pool charged nothing.
  if (!settings) {
    return (
      <div className="px-4 pb-4 text-muted-foreground text-xs">
        <Trans>Reading this pool's fee…</Trans>
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        <Field
          label={t`Swap fee (%)`}
          htmlFor="pool-fee-percent"
          error={trimmedFee && !feeIsValid ? t`Enter a fee from 0 to 100` : null}
        >
          <Input
            id="pool-fee-percent"
            dir="ltr"
            inputMode="decimal"
            value={feePercent}
            placeholder="0"
            onChange={(event) => setFeePercent(event.target.value)}
            className="font-mono"
            aria-invalid={!!trimmedFee && !feeIsValid}
          />
        </Field>

        <Field
          label={t`Fee recipient`}
          htmlFor="pool-fee-address"
          hint={
            address && !trimmedRecipient
              ? t`Collected swap fees are paid here. Your own wallet is ${formatVoucherAddress(address as `0x${string}`)}.`
              : undefined
          }
          error={trimmedRecipient && !recipientIsValid ? t`Enter a valid wallet address` : null}
        >
          <RecipientAddressInput
            id="pool-fee-address"
            defaultValue={recipient}
            onValueChange={setRecipient}
            onRecipientChange={(next) => {
              if (next) setRecipient(next.address);
            }}
            ariaLabel={t`Fee recipient`}
            ariaInvalid={!!trimmedRecipient && !recipientIsValid}
          />
        </Field>
      </div>

      <SheetFooter>
        <Button
          type="button"
          tap
          className="w-full"
          disabled={!canSubmit}
          pending={relay.isPending}
          onClick={() => void submit()}
        >
          {relay.isPending ? (
            <Trans>Waiting for the chain…</Trans>
          ) : (
            <Trans>Save fee settings</Trans>
          )}
        </Button>
      </SheetFooter>
    </>
  );
}

/** One row per pool voucher, each carrying whichever figure the caller is about to act on. */
function TokenChooser({
  vouchers,
  selectedAddress,
  onSelect,
  amountFor,
}: {
  vouchers: PoolVoucher[];
  selectedAddress: string | null;
  onSelect: (address: string) => void;
  amountFor: (voucher: PoolVoucher) => string | null;
}) {
  if (vouchers.length === 0) {
    return (
      <p className="border border-border bg-card p-4 text-muted-foreground text-sm">
        <Trans>This pool holds no vouchers yet.</Trans>
      </p>
    );
  }

  return (
    <ul className="border border-border bg-card" aria-label="Vouchers">
      {vouchers.map((voucher, index) => {
        const address = voucher.tokenAddress.toLowerCase();
        const amount = amountFor(voucher);
        const isSelected = selectedAddress === address;
        return (
          <li key={voucher.id}>
            <button
              type="button"
              onClick={() => onSelect(address)}
              aria-pressed={isSelected}
              className={[
                "flex w-full items-center gap-3 p-3 text-start",
                index === vouchers.length - 1 ? "" : "border-b border-border",
                isSelected ? "bg-muted" : "",
              ].join(" ")}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-sm">{voucher.name}</span>
                <span className="block font-mono text-muted-foreground text-xs">
                  {voucher.symbol}
                </span>
              </span>
              <span className="shrink-0 font-mono text-sm font-semibold">{amount ?? "—"}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
