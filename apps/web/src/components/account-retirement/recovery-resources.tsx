import type { UserPool } from "@clc/api/features/pools/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiUserSharedLine } from "react-icons/ri";

import { VoucherOwnershipTransferSheet } from "#/components/vouchers/voucher-contract-actions-panel";
import { RetirementControl } from "#/components/retirement/retirement-control";
import { ActionRow } from "#/components/ui/action-row";
import {
  SheetBackdrop,
  SheetContent,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { HoldingBalance, PoolLogo, TokenLogo, type WalletToken } from "#/components/wallet";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useAssetOwner } from "#/features/ownership/hooks/use-asset-owner";
import { usePoolFeeSettings } from "#/features/pools/hooks/use-pool-fee-settings";
import { PoolWithdrawActions } from "#/features/pools/ui/pool-controls-panel";
import { PoolOwnershipTransferForm } from "#/features/pools/ui/pool-ownership-transfer-form";
import { useVoucherControls } from "#/features/vouchers/hooks/use-voucher-controls";
import { POOL_OWNERSHIP_TRANSFER_ENABLED } from "#/lib/ownership-transfer-config";

/**
 * One voucher the account issued, with the two things a retiring account may do
 * about it: hand it to someone else, or ask for its retirement. Minting,
 * burning and editing are normal activity and stay out of the shell.
 */
export function RecoveryVoucherRow({
  token,
  walletAddress,
}: {
  token: WalletToken;
  walletAddress: `0x${string}`;
}) {
  const { t } = useLingui();
  const [transferOpen, setTransferOpen] = useState(false);
  // The chain owner, not the signer: an issued voucher can belong to a Safe the
  // wallet signs for, and the transfer checks the owner it is given.
  const detail = useMarketVoucherDetail(token.contractAddress);
  const ownerAddress = useAssetOwner(
    token.contractAddress ?? "",
    detail.data?.ownerAddress ?? token.owner,
  );
  const { contract, canRequestRetirement } = useVoucherControls({
    tokenAddress: token.contractAddress,
    tokenDecimals: token.tokenDecimals,
    ownerAddress: ownerAddress ?? null,
    walletAddress,
    requesterAddress: walletAddress,
  });

  return (
    <li className="border-border border-b last:border-b-0">
      <div className="flex items-center gap-3 p-3">
        <TokenLogo token={token} size={34} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{token.symbol}</p>
          <p className="truncate text-muted-foreground text-xs">{token.name}</p>
        </div>
        <HoldingBalance token={token} />
      </div>
      <div className="border-border border-t">
        {contract ? (
          <ActionRow
            icon={<RiUserSharedLine className="size-4" aria-hidden="true" />}
            label={t`Transfer ownership`}
            ariaLabel={t`Transfer ownership of ${token.name}`}
            onClick={() => setTransferOpen(true)}
          />
        ) : null}
        {canRequestRetirement && token.contractAddress ? (
          <RetirementControl
            type="voucher"
            address={token.contractAddress}
            name={token.name}
            viewer={walletAddress}
          />
        ) : null}
      </div>
      {contract ? (
        <VoucherOwnershipTransferSheet
          open={transferOpen}
          onClose={() => setTransferOpen(false)}
          tokenAddress={contract.tokenAddress}
          ownerAddress={contract.ownerAddress}
          walletAddress={contract.walletAddress}
        />
      ) : null}
    </li>
  );
}

/** One pool the account owns: withdraw what it holds, hand it over, or ask for its retirement. */
export function RecoveryPoolRow({
  pool,
  walletAddress,
}: {
  pool: UserPool;
  walletAddress: `0x${string}`;
}) {
  const { t } = useLingui();
  const [transferOpen, setTransferOpen] = useState(false);
  const fee = usePoolFeeSettings(pool, transferOpen);

  return (
    <li className="border-border border-b last:border-b-0">
      <div className="flex items-center gap-3 p-3">
        <PoolLogo imageUrl={pool.imageUrl} name={pool.name} seed={pool.address} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-sm">{pool.name}</p>
          {pool.active === false ? (
            <p className="font-semibold text-xs">
              <Trans>Retired — withdrawals available</Trans>
            </p>
          ) : null}
        </div>
      </div>
      <div className="border-border border-t">
        <PoolWithdrawActions pool={pool} />
        {POOL_OWNERSHIP_TRANSFER_ENABLED ? (
          <ActionRow
            icon={<RiUserSharedLine className="size-4" aria-hidden="true" />}
            label={t`Transfer ownership`}
            ariaLabel={t`Transfer ownership of ${pool.name}`}
            onClick={() => setTransferOpen(true)}
          />
        ) : null}
        <RetirementControl
          type="pool"
          address={pool.address}
          name={pool.name}
          viewer={walletAddress}
          active={pool.active}
        />
      </div>
      {POOL_OWNERSHIP_TRANSFER_ENABLED ? (
        <SheetRoot open={transferOpen} onOpenChange={setTransferOpen}>
          <SheetPortal>
            <SheetBackdrop />
            <SheetContent>
              <SheetHeader>
                <SheetTitle>
                  <Trans>Transfer ownership</Trans>
                </SheetTitle>
              </SheetHeader>
              {transferOpen ? (
                <PoolOwnershipTransferForm
                  pool={pool}
                  settings={fee.data}
                  onDone={() => setTransferOpen(false)}
                />
              ) : null}
            </SheetContent>
          </SheetPortal>
        </SheetRoot>
      ) : null}
    </li>
  );
}
