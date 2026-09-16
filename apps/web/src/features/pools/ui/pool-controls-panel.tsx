import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  buildSetPoolFeeAddressCalls,
  buildWithdrawPoolLiquidityCalls,
} from "@clc/core/features/pool-admin/logic";
import { buildCollectPoolFeesCalls } from "@clc/core/features/pool-swaps/logic";
import { formatTokenAmount, parseTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { RiHandCoinLine, RiPencilLine, RiSafe2Line, RiWalletLine } from "react-icons/ri";
import { toast } from "sonner";
import { isAddress, zeroAddress } from "viem";
import { useConnection } from "wagmi";

import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { SignHint } from "#/components/wallet";
import { usePoolAdminRelay } from "#/features/pools/hooks/use-pool-admin";
import { usePoolTreasury } from "#/features/pools/hooks/use-pool-treasury";

import { PoolProfileEditorSheet } from "./pool-profile-editor-sheet";

type ControlSheet = "details" | "liquidity" | "fees" | "feeAddress";

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
  const treasury = usePoolTreasury(pool, vouchers, canManageOnChain);

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
              label={t`Fee recipient`}
              value={pool.feeAddress ? formatVoucherAddress(pool.feeAddress) : t`Not set`}
              onClick={() => setSheet("feeAddress")}
            />
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
          onDone={() => setSheet(null)}
        />
      </ControlSheetShell>

      <ControlSheetShell
        open={sheet === "feeAddress"}
        title={t`Fee recipient`}
        onClose={() => setSheet(null)}
      >
        <FeeAddressForm pool={pool} onDone={() => setSheet(null)} />
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
        <SheetContent className="rounded-none border-t border-border bg-background shadow-none">
          <SheetHeader>
            <SheetTitle className="font-heading text-base font-semibold">{title}</SheetTitle>
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
                inputMode="decimal"
                value={amount}
                placeholder="0"
                onChange={(event) => setAmount(event.target.value)}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                className="h-9 shrink-0 bg-card"
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
        <SignHint className="bg-card" />
        <Button
          type="button"
          className="h-11 w-full"
          disabled={!selected || !amount.trim() || relay.isPending}
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
  onDone,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  treasury: Map<string, { feesRaw: string }> | undefined;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const relay = usePoolAdminRelay();
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);

  const selected = vouchers.find((voucher) => voucher.tokenAddress.toLowerCase() === tokenAddress);
  const hasRecipient = !!pool.feeAddress && pool.feeAddress.toLowerCase() !== zeroAddress;
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
        {hasRecipient ? (
          <p className="text-muted-foreground text-xs">
            <Trans>
              Fees are paid to {formatVoucherAddress(pool.feeAddress as `0x${string}`)}.
            </Trans>
          </p>
        ) : (
          <p role="alert" className="border border-border bg-card p-4 text-destructive text-xs">
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
        <SignHint className="bg-card" />
        <Button
          type="button"
          className="h-11 w-full"
          disabled={!selected || !hasRecipient || relay.isPending}
          onClick={() => void submit()}
        >
          {relay.isPending ? <Trans>Waiting for the chain…</Trans> : <Trans>Collect fees</Trans>}
        </Button>
      </SheetFooter>
    </>
  );
}

function FeeAddressForm({ pool, onDone }: { pool: UserPool; onDone: () => void }) {
  const { t } = useLingui();
  const relay = usePoolAdminRelay();
  const [value, setValue] = useState(pool.feeAddress ?? "");
  const trimmed = value.trim();
  const isValid = isAddress(trimmed) && trimmed.toLowerCase() !== zeroAddress;

  const submit = async () => {
    if (!isValid) return;
    try {
      await relay.mutateAsync(
        buildSetPoolFeeAddressCalls({
          poolAddress: pool.address,
          feeAddress: trimmed as `0x${string}`,
        }),
      );
      toast.success(t`Fee recipient updated.`);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`The transaction failed.`);
    }
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        <Field
          label={t`Wallet address`}
          htmlFor="pool-fee-address"
          hint={t`Collected swap fees are paid here.`}
          error={trimmed && !isValid ? t`Enter a valid wallet address` : null}
        >
          <Input
            id="pool-fee-address"
            value={value}
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={!!trimmed && !isValid}
            className="font-mono text-sm"
          />
        </Field>
      </div>

      <SheetFooter>
        <SignHint className="bg-card" />
        <Button
          type="button"
          className="h-11 w-full"
          disabled={!isValid || relay.isPending}
          onClick={() => void submit()}
        >
          {relay.isPending ? <Trans>Waiting for the chain…</Trans> : <Trans>Save recipient</Trans>}
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
      <p className="border border-border bg-card p-4 text-muted-foreground text-xs">
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
                "flex w-full items-center gap-3 p-3 text-left",
                index === vouchers.length - 1 ? "" : "border-b border-border",
                isSelected ? "bg-muted" : "",
              ].join(" ")}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-sm tracking-tight">
                  {voucher.name}
                </span>
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
