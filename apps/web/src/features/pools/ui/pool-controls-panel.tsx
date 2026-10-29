import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import {
  RiHandCoinLine,
  RiPencilLine,
  RiSafe2Line,
  RiShieldKeyholeLine,
  RiUserSharedLine,
  RiWalletLine,
} from "react-icons/ri";

import { ActionRow } from "#/components/ui/action-row";
import { RetirementControl } from "#/components/retirement/retirement-control";
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
import { useSafeSheet } from "#/features/safe/state/safe-sheet";
import type { PoolFeeSettings } from "#/features/pools/hooks/use-pool-fee-settings";
import {
  usePoolCollectFeesForm,
  usePoolControls,
  usePoolFeeSettingsForm,
  usePoolWithdrawLiquidityForm,
} from "#/features/pools/hooks/use-pool-control-forms";

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
 * it is. The two are separately gated: an administrator may correct any pool's
 * record, while every on-chain call below is `onlyOwner` on a contract the
 * pool's owner deployed, so an administrator would only be signing a revert.
 */
export function PoolControlsPanel({
  pool,
  vouchers,
  canManageOnChain,
  viewerAddress,
  privateInfo,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  canManageOnChain: boolean;
  viewerAddress?: string;
  privateInfo?: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    retry: () => void;
  };
}) {
  const { t } = useLingui();
  const [sheet, setSheet] = useState<ControlSheet | null>(null);
  const { owner, indexed, withdrawalVouchers, treasury, feeSettings, fee } = usePoolControls(
    pool,
    vouchers,
    canManageOnChain,
  );

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
            {owner.isSafeOwned && owner.owner ? (
              <ActionRow
                icon={<RiShieldKeyholeLine className="size-4" aria-hidden="true" />}
                label={t`Safe transactions`}
                onClick={() => useSafeSheet.getState().show(owner.owner!)}
              />
            ) : null}
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
            {pool.ownerAddress ? (
              <RetirementControl
                type="pool"
                address={pool.address}
                name={pool.name}
                viewer={viewerAddress ?? pool.ownerAddress}
                active={pool.active}
              />
            ) : null}
          </>
        ) : null}
      </section>

      <PoolProfileEditorSheet
        open={sheet === "details"}
        pool={pool}
        privateInfo={privateInfo}
        onClose={() => setSheet(null)}
      />

      <ControlSheetShell
        open={sheet === "liquidity"}
        title={t`Withdraw liquidity`}
        onClose={() => setSheet(null)}
      >
        <WithdrawalInventoryNotice
          pending={indexed.isPending}
          error={indexed.isError}
          retry={() => void indexed.refetch()}
        />
        <WithdrawLiquidityForm
          pool={pool}
          vouchers={withdrawalVouchers}
          treasury={treasury.data}
          onDone={() => setSheet(null)}
        />
      </ControlSheetShell>

      <ControlSheetShell
        open={sheet === "fees"}
        title={t`Withdraw fees`}
        onClose={() => setSheet(null)}
      >
        <WithdrawalInventoryNotice
          pending={indexed.isPending}
          error={indexed.isError}
          retry={() => void indexed.refetch()}
        />
        <CollectFeesForm
          pool={pool}
          vouchers={withdrawalVouchers}
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

function WithdrawalInventoryNotice({
  pending,
  error,
  retry,
}: {
  pending: boolean;
  error: boolean;
  retry: () => void;
}) {
  return pending ? (
    <p role="status" className="px-4 pb-3 text-sm text-muted-foreground">
      <Trans>Loading vouchers…</Trans>
    </p>
  ) : error ? (
    <div role="alert" className="space-y-2 px-4 pb-3">
      <p className="text-sm">
        <Trans>Couldn't load vouchers.</Trans>
      </p>
      <Button type="button" variant="outline" tap onClick={retry}>
        <Trans>Try again</Trans>
      </Button>
    </div>
  ) : null;
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

/** Sends pool liquidity to the owner's own wallet; see `usePoolWithdrawLiquidityForm`. */
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
  const form = usePoolWithdrawLiquidityForm({ pool, vouchers, treasury, onDone });
  const { selected, withdrawable, amount, relay } = form;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        <TokenChooser
          vouchers={vouchers}
          selectedAddress={form.tokenAddress}
          onSelect={form.selectToken}
          amountFor={form.amountFor}
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
                onChange={(event) => form.setAmount(event.target.value)}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                tap
                disabled={!withdrawable}
                onClick={() => withdrawable && form.setAmount(withdrawable)}
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
          disabled={!form.canSubmit}
          pending={relay.isPending}
          onClick={() => void form.submit()}
        >
          {relay.isPending ? <Trans>Waiting for the chain…</Trans> : <Trans>Withdraw</Trans>}
        </Button>
      </SheetFooter>
    </>
  );
}

/** Pays out everything accrued in one voucher; see `usePoolCollectFeesForm`. */
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
  const form = usePoolCollectFeesForm({ pool, vouchers, treasury, onDone });

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
          selectedAddress={form.tokenAddress}
          onSelect={form.selectToken}
          amountFor={form.amountFor}
        />
      </div>

      <SheetFooter>
        <Button
          type="button"
          tap
          className="w-full"
          disabled={!form.selected || !feeAddress}
          pending={form.relay.isPending}
          onClick={() => void form.submit()}
        >
          {form.relay.isPending ? (
            <Trans>Waiting for the chain…</Trans>
          ) : (
            <Trans>Collect fees</Trans>
          )}
        </Button>
      </SheetFooter>
    </>
  );
}

/** The pool's swap fee and its recipient; see `usePoolFeeSettingsForm`. */
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
  const form = usePoolFeeSettingsForm({ pool, settings, onDone });
  const { trimmedFee, feeIsValid, trimmedRecipient, recipientIsValid, connectedAddress } = form;

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
            value={form.feePercent}
            placeholder="0"
            onChange={(event) => form.setFeePercent(event.target.value)}
            className="font-mono"
            aria-invalid={!!trimmedFee && !feeIsValid}
          />
        </Field>

        <Field
          label={t`Fee recipient`}
          htmlFor="pool-fee-address"
          hint={
            connectedAddress && !trimmedRecipient
              ? t`Collected swap fees are paid here. Your own wallet is ${formatVoucherAddress(connectedAddress as `0x${string}`)}.`
              : undefined
          }
          error={trimmedRecipient && !recipientIsValid ? t`Enter a valid wallet address` : null}
        >
          <RecipientAddressInput
            id="pool-fee-address"
            defaultValue={form.recipient}
            onValueChange={form.setRecipient}
            onRecipientChange={(next) => {
              if (next) form.setRecipient(next.address);
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
          disabled={!form.canSubmit}
          pending={form.relay.isPending}
          onClick={() => void form.submit()}
        >
          {form.relay.isPending ? (
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
