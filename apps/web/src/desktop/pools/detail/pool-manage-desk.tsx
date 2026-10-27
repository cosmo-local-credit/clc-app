import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { resourceRetirementRequestsQueryOptions } from "@clc/api/features/retirement/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import {
  RiArchiveLine,
  RiArrowDownSLine,
  RiHandCoinLine,
  RiPencilLine,
  RiSafe2Line,
  RiShieldKeyholeLine,
  RiUserSharedLine,
  RiWalletLine,
} from "react-icons/ri";

import { RetirementRequestForm } from "#/components/retirement/retirement-request-form";
import { RetirementRequestList } from "#/components/retirement/retirement-request-list";
import { RecipientOwnerNotice } from "#/components/safe/recipient-owner-notice";
import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "#/components/ui/popover";
import { RecipientAddressInput } from "#/components/wallet/recipient-address-input";
import { PoolSidePanel, type PoolSide } from "#/desktop/pools/detail/pool-side-panel";
import { DeskKV } from "#/desktop/ui/kv";
import {
  usePoolCollectFeesForm,
  usePoolControls,
  usePoolFeeSettingsForm,
  usePoolWithdrawLiquidityForm,
} from "#/features/pools/hooks/use-pool-control-forms";
import type { PoolFeeSettings } from "#/features/pools/hooks/use-pool-fee-settings";
import { usePoolOwnershipTransferForm } from "#/features/pools/hooks/use-pool-ownership-transfer-form";
import { useSafeSheet } from "#/features/safe/state/safe-sheet";
import { retirementClient } from "#/lib/api/retirement";
import { POOL_OWNERSHIP_TRANSFER_ENABLED } from "#/lib/ownership-transfer-config";
import { cn } from "#/lib/utils";
import { getFieldError } from "@clc/core/lib/forms";

function useRetirement(pool: UserPool, viewer: string) {
  const { t } = useLingui();
  const history = useQuery(
    resourceRetirementRequestsQueryOptions(retirementClient, "pool", pool.address, viewer),
  );
  const pending = history.data?.some((request) => request.status === "pending") === true;
  const active = pool.active !== false;
  const title = pending
    ? t`Retirement requested`
    : active
      ? t`Request retirement`
      : t`Retirement history`;
  return { history, pending, active, title };
}

/**
 * The steward's tools as one menu at the end of the title row. Each item opens
 * its form in the side column; Safe transactions opens the shared Safe surface.
 * Editing the record is open to a superadmin; every on-chain item is
 * `onlyOwner`, so it is offered to the owner alone.
 */
export function PoolManageMenu({
  pool,
  vouchers,
  canManageOnChain,
  viewerAddress,
  onOpen,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  canManageOnChain: boolean;
  viewerAddress: string | undefined;
  onOpen: (side: PoolSide) => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const { owner, fee, feeSettings } = usePoolControls(pool, vouchers, canManageOnChain);
  const pick = (side: PoolSide) => {
    setOpen(false);
    onOpen(side);
  };
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline">
            <Trans>Manage</Trans>
            <RiArrowDownSLine aria-hidden="true" className="text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="end" className="grid w-80 p-1">
        <MenuItem
          icon={<RiPencilLine className="size-4" />}
          onClick={() => pick({ kind: "details" })}
        >
          <Trans>Edit details</Trans>
        </MenuItem>
        {canManageOnChain ? (
          <>
            {owner.isSafeOwned && owner.owner ? (
              <MenuItem
                icon={<RiShieldKeyholeLine className="size-4" />}
                onClick={() => {
                  setOpen(false);
                  useSafeSheet.getState().show(owner.owner!);
                }}
              >
                <Trans>Safe transactions</Trans>
              </MenuItem>
            ) : null}
            <MenuItem
              icon={<RiSafe2Line className="size-4" />}
              onClick={() => pick({ kind: "liquidity" })}
            >
              <Trans>Withdraw liquidity</Trans>
            </MenuItem>
            <MenuItem
              icon={<RiHandCoinLine className="size-4" />}
              onClick={() => pick({ kind: "fees" })}
            >
              <Trans>Withdraw fees</Trans>
            </MenuItem>
            <MenuItem
              icon={<RiWalletLine className="size-4" />}
              value={
                fee
                  ? `${fee.feePercent}% · ${fee.feeAddress ? formatVoucherAddress(fee.feeAddress) : t`Not set`}`
                  : feeSettings.isError
                    ? t`Unavailable`
                    : t`Reading…`
              }
              onClick={() => pick({ kind: "feeSettings" })}
            >
              <Trans>Fee % and recipient</Trans>
            </MenuItem>
            {POOL_OWNERSHIP_TRANSFER_ENABLED ? (
              <MenuItem
                icon={<RiUserSharedLine className="size-4" />}
                onClick={() => pick({ kind: "ownership" })}
              >
                <Trans>Transfer ownership</Trans>
              </MenuItem>
            ) : null}
            {pool.ownerAddress ? (
              <RetirementMenuItem
                pool={pool}
                viewer={viewerAddress ?? pool.ownerAddress}
                onClick={() => pick({ kind: "retirement" })}
              />
            ) : null}
          </>
        ) : null}
      </PopoverContent>
    </PopoverRoot>
  );
}

function MenuItem({
  icon,
  value,
  tone = "default",
  onClick,
  children,
}: {
  icon: ReactNode;
  value?: string;
  tone?: "default" | "destructive";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 min-w-0 items-center gap-2.5 px-2.5 text-start text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        tone === "destructive" ? "text-destructive" : "text-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("flex shrink-0", tone !== "destructive" && "text-muted-foreground")}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {value ? (
        <span dir="ltr" className="shrink-0 font-mono text-xs text-muted-foreground">
          {value}
        </span>
      ) : null}
    </button>
  );
}

function RetirementMenuItem({
  pool,
  viewer,
  onClick,
}: {
  pool: UserPool;
  viewer: string;
  onClick: () => void;
}) {
  const { title, pending, active } = useRetirement(pool, viewer);
  return (
    <MenuItem
      icon={<RiArchiveLine className="size-4" />}
      tone={pending || !active ? "default" : "destructive"}
      onClick={onClick}
    >
      {title}
    </MenuItem>
  );
}

/** The owner forms the Manage menu opens, one at a time, in the side column. */
export function PoolControlSide({
  side,
  pool,
  vouchers,
  canManageOnChain,
  viewerAddress,
  onClose,
}: {
  side: Extract<
    PoolSide,
    { kind: "liquidity" | "fees" | "feeSettings" | "ownership" | "retirement" }
  >;
  pool: UserPool;
  vouchers: PoolVoucher[];
  canManageOnChain: boolean;
  viewerAddress: string | undefined;
  onClose: () => void;
}) {
  const { withdrawalVouchers, treasury, fee, indexed } = usePoolControls(
    pool,
    vouchers,
    canManageOnChain,
  );
  const inventory = indexed.isPending ? (
    <p role="status" className="text-sm text-muted-foreground">
      <Trans>Loading vouchers…</Trans>
    </p>
  ) : indexed.isError ? (
    <div role="alert" className="flex items-center justify-between gap-3 text-sm">
      <p>
        <Trans>Couldn't load vouchers.</Trans>
      </p>
      <Button type="button" variant="outline" onClick={() => void indexed.refetch()}>
        <Trans>Try again</Trans>
      </Button>
    </div>
  ) : null;
  switch (side.kind) {
    case "liquidity":
      return (
        <WithdrawLiquiditySide
          pool={pool}
          vouchers={withdrawalVouchers}
          treasury={treasury.data}
          inventory={inventory}
          onClose={onClose}
        />
      );
    case "fees":
      return (
        <CollectFeesSide
          pool={pool}
          vouchers={withdrawalVouchers}
          treasury={treasury.data}
          feeAddress={fee?.feeAddress ?? null}
          inventory={inventory}
          onClose={onClose}
        />
      );
    case "feeSettings":
      return fee ? (
        <FeeSettingsSide pool={pool} settings={fee} onClose={onClose} />
      ) : (
        <PoolSidePanel title={<Trans>Fee % and recipient</Trans>} onClose={onClose}>
          <p className="text-xs text-muted-foreground">
            <Trans>Reading this pool's fee…</Trans>
          </p>
        </PoolSidePanel>
      );
    case "ownership":
      return <OwnershipSide pool={pool} settings={fee} onClose={onClose} />;
    case "retirement":
      return (
        <RetirementSide
          pool={pool}
          viewer={viewerAddress ?? pool.ownerAddress ?? ""}
          onClose={onClose}
        />
      );
  }
}

/** One row per pool voucher, each carrying the figure the steward is about to act on. */
function TokenChoice({
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
  const { t } = useLingui();
  if (vouchers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <Trans>This pool holds no vouchers yet.</Trans>
      </p>
    );
  }
  return (
    <ul className="border border-border" aria-label={t`Vouchers`}>
      {vouchers.map((voucher) => {
        const address = voucher.tokenAddress.toLowerCase();
        const selected = selectedAddress === address;
        return (
          <li key={voucher.id} className="border-border not-last:border-b">
            <button
              type="button"
              onClick={() => onSelect(address)}
              aria-pressed={selected}
              className={cn(
                "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-start hover:bg-muted/60",
                selected && "bg-primary/[0.07] shadow-[inset_2px_0_0_var(--color-primary)]",
              )}
            >
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-sm font-semibold">
                  {voucher.name}
                </span>
                <span dir="ltr" className="block font-mono text-xs text-muted-foreground">
                  {voucher.symbol}
                </span>
              </span>
              <span dir="ltr" className="shrink-0 font-mono text-sm font-semibold">
                {amountFor(voucher) ?? "—"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function WithdrawLiquiditySide({
  pool,
  vouchers,
  treasury,
  inventory,
  onClose,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  treasury: Map<string, { withdrawableRaw: string }> | undefined;
  inventory: ReactNode;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const form = usePoolWithdrawLiquidityForm({ pool, vouchers, treasury, onDone: onClose });
  const { selected, withdrawable, relay } = form;
  return (
    <PoolSidePanel
      title={<Trans>Withdraw liquidity</Trans>}
      onClose={onClose}
      onSubmit={() => void form.submit()}
      footer={
        <Button type="submit" disabled={!form.canSubmit} pending={relay.isPending}>
          {relay.isPending ? <Trans>Waiting for the chain…</Trans> : <Trans>Withdraw</Trans>}
        </Button>
      }
    >
      {inventory}
      <TokenChoice
        vouchers={vouchers}
        selectedAddress={form.tokenAddress}
        onSelect={form.selectToken}
        amountFor={form.amountFor}
      />
      {selected ? (
        <Field
          label={t`Amount`}
          htmlFor="desk-pool-withdraw-amount"
          hint={
            withdrawable
              ? t`${withdrawable} ${selected.symbol} available. Fees held for collection stay in the pool.`
              : t`Reading the pool's balance…`
          }
        >
          <div className="flex gap-2">
            <Input
              id="desk-pool-withdraw-amount"
              dir="ltr"
              inputMode="decimal"
              value={form.amount}
              placeholder="0"
              onChange={(event) => form.setAmount(event.target.value)}
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!withdrawable}
              onClick={() => withdrawable && form.setAmount(withdrawable)}
            >
              <Trans>Max</Trans>
            </Button>
          </div>
        </Field>
      ) : null}
    </PoolSidePanel>
  );
}

function CollectFeesSide({
  pool,
  vouchers,
  treasury,
  feeAddress,
  inventory,
  onClose,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  treasury: Map<string, { feesRaw: string }> | undefined;
  feeAddress: `0x${string}` | null;
  inventory: ReactNode;
  onClose: () => void;
}) {
  const form = usePoolCollectFeesForm({ pool, vouchers, treasury, onDone: onClose });
  return (
    <PoolSidePanel
      title={<Trans>Withdraw fees</Trans>}
      onClose={onClose}
      onSubmit={() => void form.submit()}
      footer={
        <Button
          type="submit"
          disabled={!form.selected || !feeAddress}
          pending={form.relay.isPending}
        >
          {form.relay.isPending ? (
            <Trans>Waiting for the chain…</Trans>
          ) : (
            <Trans>Collect fees</Trans>
          )}
        </Button>
      }
    >
      {feeAddress ? (
        <p className="text-xs text-muted-foreground">
          <Trans>Fees are paid to {formatVoucherAddress(feeAddress)}.</Trans>
        </p>
      ) : (
        <p role="alert" className="text-sm text-destructive">
          <Trans>Set a fee recipient before collecting, or the pool has nowhere to pay.</Trans>
        </p>
      )}
      {inventory}
      <TokenChoice
        vouchers={vouchers}
        selectedAddress={form.tokenAddress}
        onSelect={form.selectToken}
        amountFor={form.amountFor}
      />
    </PoolSidePanel>
  );
}

function FeeSettingsSide({
  pool,
  settings,
  onClose,
}: {
  pool: UserPool;
  settings: PoolFeeSettings;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const form = usePoolFeeSettingsForm({ pool, settings, onDone: onClose });
  const { trimmedFee, feeIsValid, trimmedRecipient, recipientIsValid, connectedAddress } = form;
  return (
    <PoolSidePanel
      title={<Trans>Fee % and recipient</Trans>}
      onClose={onClose}
      onSubmit={() => void form.submit()}
      footer={
        <Button type="submit" disabled={!form.canSubmit} pending={form.relay.isPending}>
          {form.relay.isPending ? (
            <Trans>Waiting for the chain…</Trans>
          ) : (
            <Trans>Save fee settings</Trans>
          )}
        </Button>
      }
    >
      <Field
        label={t`Swap fee (%)`}
        htmlFor="desk-pool-fee-percent"
        error={trimmedFee && !feeIsValid ? t`Enter a fee from 0 to 100` : null}
      >
        <Input
          id="desk-pool-fee-percent"
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
        htmlFor="desk-pool-fee-address"
        hint={
          connectedAddress && !trimmedRecipient
            ? t`Collected swap fees are paid here. Your own wallet is ${formatVoucherAddress(connectedAddress as `0x${string}`)}.`
            : undefined
        }
        error={trimmedRecipient && !recipientIsValid ? t`Enter a valid wallet address` : null}
      >
        <RecipientAddressInput
          id="desk-pool-fee-address"
          defaultValue={form.recipient}
          onValueChange={form.setRecipient}
          onRecipientChange={(next) => {
            if (next) form.setRecipient(next.address);
          }}
          ariaLabel={t`Fee recipient`}
          className="min-w-0"
          ariaInvalid={!!trimmedRecipient && !recipientIsValid}
        />
      </Field>
    </PoolSidePanel>
  );
}

function OwnershipSide({
  pool,
  settings,
  onClose,
}: {
  pool: UserPool;
  settings: PoolFeeSettings | undefined;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { form, transfer, submission } = usePoolOwnershipTransferForm({ pool, onDone: onClose });
  return (
    <PoolSidePanel
      title={<Trans>Transfer ownership</Trans>}
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      footer={
        <Button type="submit" pending={transfer.isPending} disabled={!settings && !submission}>
          {transfer.isPending ? (
            <Trans>Waiting for the chain…</Trans>
          ) : submission ? (
            <Trans>Check transfer status</Trans>
          ) : (
            <Trans>Transfer ownership</Trans>
          )}
        </Button>
      }
    >
      <p className="text-sm">
        <Trans>
          The recipient gains pool management and liquidity withdrawal authority. You lose ownership
          immediately when the transaction confirms.
        </Trans>
      </p>
      <DeskKV
        labelWidth="150px"
        rows={[
          [
            <Trans key="label">Existing fee recipient</Trans>,
            <span key="value" dir="ltr" className="block truncate">
              {settings ? (settings.feeAddress ?? t`Not set`) : t`Reading…`}
            </span>,
          ],
        ]}
      />
      {submission ? (
        <p role="status" className="break-all text-xs">
          <Trans>Check the existing submission before another transfer:</Trans>{" "}
          <span className="font-mono">{submission.trackingId}</span>
        </p>
      ) : null}
      <form.Field name="newOwnerAddress">
        {(field) => (
          <Field
            label={t`New owner address`}
            htmlFor="desk-pool-new-owner"
            error={getFieldError(field.state.meta.errors)}
          >
            <RecipientAddressInput
              id="desk-pool-new-owner"
              defaultValue={field.state.value}
              onValueChange={field.handleChange}
              onRecipientChange={(recipient) => {
                if (recipient) field.handleChange(recipient.address);
              }}
              onBlur={field.handleBlur}
              ariaLabel={t`New owner address`}
              className="min-w-0"
              ariaInvalid={field.state.meta.errors.length > 0}
              disabled={transfer.isPending || !!submission}
            />
            <RecipientOwnerNotice address={field.state.value} />
          </Field>
        )}
      </form.Field>
    </PoolSidePanel>
  );
}

/** Requesting retirement never removes the active page; history stays readable. */
function RetirementSide({
  pool,
  viewer,
  onClose,
}: {
  pool: UserPool;
  viewer: string;
  onClose: () => void;
}) {
  const { history, pending, active, title } = useRetirement(pool, viewer);
  return (
    <PoolSidePanel
      title={
        <>
          {title}: {pool.name}
        </>
      }
      onClose={onClose}
    >
      {history.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          <Trans>Loading retirement requests…</Trans>
        </p>
      ) : history.isError ? (
        <div role="alert" className="flex items-center justify-between gap-3 text-sm">
          <p>
            <Trans>Could not load retirement requests.</Trans>
          </p>
          <Button
            variant="outline"
            pending={history.isFetching}
            onClick={() => void history.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : (
        <>
          {pending ? (
            <p role="status" className="text-sm">
              <Trans>
                Retirement requested — awaiting admin review. This resource stays active until
                approval.
              </Trans>
            </p>
          ) : active ? (
            <RetirementRequestForm
              type="pool"
              address={pool.address}
              viewer={viewer}
              onSubmitted={() => void history.refetch()}
            />
          ) : null}
          {history.data.length > 0 ? (
            <RetirementRequestList requests={history.data} viewer={viewer} />
          ) : null}
        </>
      )}
    </PoolSidePanel>
  );
}
