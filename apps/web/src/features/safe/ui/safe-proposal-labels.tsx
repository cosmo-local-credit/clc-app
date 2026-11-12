import { voucherQueryOptions } from "@clc/api/features/market/queries";
import { swapPoolFeeAddressAbi } from "@clc/core/features/pool-admin/logic";
import {
  describeSafeCall,
  safeCallName,
  safeWithdrawals,
  type SafeCall,
  type SafeCallDetail,
  type SafeOwnerChange,
  type SafeWithdrawal,
} from "@clc/core/features/safe/logic";
import { formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Fragment, type ReactNode } from "react";
import { zeroAddress } from "viem";
import { readContract } from "viem/actions";
import { useClient } from "wagmi";
import { Skeleton } from "#/components/ui/skeleton";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { marketClient } from "#/lib/api/market";
import { CHAIN_ID } from "#/lib/chain";

/** The owner action a call performs, in the words its own control uses. */
export function callGroup(call: SafeCall, safe: `0x${string}`): string {
  return safeCallName(call, safe) ?? "unknown";
}

export function CallLabel({ group }: { group: string }) {
  switch (group) {
    case "addSigner":
      return <Trans>Add signer</Trans>;
    case "removeSigner":
      return <Trans>Remove signer</Trans>;
    case "replaceSigner":
      return <Trans>Replace signer</Trans>;
    case "changeThreshold":
      return <Trans>Change approvals required</Trans>;
    case "mintTo":
      return <Trans>Create vouchers</Trans>;
    case "transferOwnership":
      return <Trans>Transfer ownership</Trans>;
    case "withdrawLiquidity":
      return <Trans>Withdraw liquidity</Trans>;
    case "withdraw":
      return <Trans>Withdraw fees</Trans>;
    case "setDefaultFee":
    case "setFeeAddress":
      return <Trans>Fee % and recipient</Trans>;
    case "add":
      return <Trans>Approve voucher</Trans>;
    case "setLimitFor":
    case "setPriceIndexValue":
    case "setOracle":
      return <Trans>Manage voucher</Trans>;
    case "remove":
      return <Trans>Remove</Trans>;
    case "unknown":
      return <Trans>Unknown call</Trans>;
    default:
      return <span className="font-mono">{group}</span>;
  }
}

/** Calls that share a control's label, so a batch reads as one action each. */
function labelKey(group: string): string {
  if (group === "setDefaultFee" || group === "setFeeAddress") return "fee";
  if (group === "setLimitFor" || group === "setPriceIndexValue" || group === "setOracle") {
    return "manage";
  }
  return group;
}

export function proposalTitle(calls: readonly SafeCall[] | null, safe: `0x${string}`): ReactNode {
  if (!calls) return <Trans>Unknown call</Trans>;
  const groups = calls.map((call) => callGroup(call, safe));
  const byLabel = new Map<string, string>();
  for (const group of groups) byLabel.set(labelKey(group), group);
  // Approving a voucher already sets its limit and rate.
  if (byLabel.has("add")) byLabel.delete("manage");
  // Fees paid elsewhere point the fee address at the recipient and back; with
  // no rate change in the batch, that is the collection, not a fee setting.
  if (byLabel.has("withdraw") && !groups.includes("setDefaultFee")) byLabel.delete("fee");
  return [...byLabel.values()].map((group, index) => (
    <Fragment key={group}>
      {index > 0 ? ", " : null}
      <CallLabel group={group} />
    </Fragment>
  ));
}

/**
 * Who receives what, for the calls where that is the decision: each mint's
 * recipient and amount, each liquidity or fee withdrawal's, the new owner of a
 * handover (one entry for a pool's batch of wiring contracts), and who signs
 * for the multisig afterwards.
 */
export function proposalRecipients(calls: readonly SafeCall[] | null, safe: `0x${string}`) {
  const details = (calls ?? [])
    .map((call) => describeSafeCall(call, safe))
    .filter((detail): detail is SafeCallDetail => detail !== null);
  const mints = details.filter(
    (detail): detail is Extract<SafeCallDetail, { kind: "mint" }> => detail.kind === "mint",
  );
  const newOwners = [
    ...new Set(
      details.flatMap((detail) =>
        detail.kind === "ownership" ? [detail.newOwner.toLowerCase()] : [],
      ),
    ),
  ];
  const signerChanges = details.filter(
    (detail): detail is SafeOwnerChange =>
      detail.kind === "addSigner" ||
      detail.kind === "removeSigner" ||
      detail.kind === "replaceSigner" ||
      detail.kind === "changeThreshold",
  );
  return { mints, withdrawals: safeWithdrawals(calls, safe), newOwners, signerChanges };
}

export type SignerChangeRow = { key: string; label: ReactNode; value: ReactNode };

/** The rows a signer change reads as: who joins or leaves, and the approvals that follow. */
export function signerChangeRows(change: SafeOwnerChange, locale: string): SignerChangeRow[] {
  const approvals: SignerChangeRow[] =
    "threshold" in change
      ? [
          {
            key: "threshold",
            label: <Trans>Approvals required</Trans>,
            value: new Intl.NumberFormat(locale).format(change.threshold),
          },
        ]
      : [];
  switch (change.kind) {
    case "addSigner":
      return [
        {
          key: "signer",
          label: <Trans>New signer</Trans>,
          value: <RecipientIdentityLabel address={change.signer} showAddress />,
        },
        ...approvals,
      ];
    case "removeSigner":
      return [
        {
          key: "signer",
          label: <Trans>Removed signer</Trans>,
          value: <RecipientIdentityLabel address={change.signer} showAddress />,
        },
        ...approvals,
      ];
    case "replaceSigner":
      return [
        {
          key: "old",
          label: <Trans>Removed signer</Trans>,
          value: <RecipientIdentityLabel address={change.oldSigner} showAddress />,
        },
        {
          key: "new",
          label: <Trans>New signer</Trans>,
          value: <RecipientIdentityLabel address={change.newSigner} showAddress />,
        },
      ];
    case "changeThreshold":
      return approvals;
  }
}

export function MintAmount({ token, amountRaw }: { token: `0x${string}`; amountRaw: string }) {
  const { i18n } = useLingui();
  const voucher = useQuery(voucherQueryOptions(marketClient, token));
  if (voucher.isPending) return <Skeleton className="ms-auto h-3.5 w-16 rounded-none" />;
  const decimals = voucher.data?.decimals;
  if (decimals === undefined || decimals === null)
    return <span className="text-muted-foreground">—</span>;
  const locale = i18n.locales?.[0] ?? i18n.locale;
  return (
    <span className="font-mono font-semibold">
      {formatTokenAmountFixed(amountRaw, decimals, 2, locale)}{" "}
      <span dir="ltr">{voucher.data?.symbol}</span>
    </span>
  );
}

/**
 * Who a withdrawal pays. A fee collection without its own recipient pays the
 * pool's fee address, which only the chain knows.
 */
export function WithdrawalRecipient({
  withdrawal,
  className,
}: {
  withdrawal: SafeWithdrawal;
  className?: string;
}) {
  const client = useClient({ chainId: CHAIN_ID });
  const feeAddress = useQuery({
    queryKey: ["safe-proposal", "pool-fee-address", withdrawal.pool],
    queryFn: () =>
      readContract(client!, {
        address: withdrawal.pool,
        abi: swapPoolFeeAddressAbi,
        functionName: "feeAddress",
      }),
    enabled: withdrawal.recipient === null && !!client,
    staleTime: 15_000,
    retry: false,
  });
  const recipient = withdrawal.recipient ?? feeAddress.data;
  if (recipient && recipient !== zeroAddress) {
    return <RecipientIdentityLabel address={recipient} showAddress className={className} />;
  }
  if (withdrawal.recipient === null && feeAddress.isPending) {
    return <Skeleton className="ms-auto h-3.5 w-24 rounded-none" />;
  }
  return <span className="text-muted-foreground">—</span>;
}

/** What a withdrawal takes; a fee collection without an amount takes all accrued. */
export function WithdrawalAmount({ withdrawal }: { withdrawal: SafeWithdrawal }) {
  const voucher = useQuery({
    ...voucherQueryOptions(marketClient, withdrawal.token),
    enabled: withdrawal.amountRaw === null,
  });
  if (withdrawal.amountRaw !== null) {
    return <MintAmount token={withdrawal.token} amountRaw={withdrawal.amountRaw} />;
  }
  if (voucher.isPending) return <Skeleton className="ms-auto h-3.5 w-16 rounded-none" />;
  const symbol = voucher.data?.symbol;
  return symbol ? (
    <Trans>
      All accrued <span dir="ltr">{symbol}</span>
    </Trans>
  ) : (
    <Trans>All accrued</Trans>
  );
}
