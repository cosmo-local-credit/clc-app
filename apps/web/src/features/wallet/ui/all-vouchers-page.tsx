import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RiAddLine, RiArrowDownSLine, RiArrowRightSLine } from "react-icons/ri";
import { useConnection } from "wagmi";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { TokenLogo } from "#/components/wallet";
import { ResourceQuotaTitle } from "#/components/resource-usage";
import { useAllAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { useAllOwnedVouchers } from "#/features/wallet/hooks/use-owned-vouchers";
import {
  groupWalletVouchers,
  type WalletVoucherListItem,
} from "#/features/wallet/logic/owned-voucher-groups";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { resetVoucherCreateHistory } from "#/lib/navigation/voucher-create-history";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { VoucherContactDetails } from "./voucher-contact-details";
import { ListSkeleton } from "#/components/ui/list-skeleton";

function VoucherRow({
  voucher,
  open,
  onToggle,
  voucherAddress,
  showBorder,
}: {
  voucher: WalletVoucherListItem;
  open: boolean;
  onToggle: () => void;
  voucherAddress?: `0x${string}`;
  showBorder: boolean;
}) {
  return (
    <div className={showBorder ? "border-border border-b" : ""}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 p-3 text-start"
      >
        <TokenLogo token={voucher} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold">{voucher.symbol}</p>
            {voucher.catalogActive === false ? (
              <Badge size="sm" variant="outline">
                <Trans>Retired</Trans>
              </Badge>
            ) : voucher.admin ? (
              <Badge size="sm" caps>
                <Trans>Admin</Trans>
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">{voucher.name}</p>
        </div>
        {voucher.balanceState === "ready" ? (
          <p className="font-heading shrink-0 text-sm font-semibold tracking-tight">
            {voucher.amount}
          </p>
        ) : (
          <p className="font-heading shrink-0 text-sm font-semibold tracking-tight">
            {voucher.balanceState === "loading" ? (
              <Trans>Loading…</Trans>
            ) : (
              <Trans>Unavailable</Trans>
            )}
          </p>
        )}
        <RiArrowDownSLine
          className={[
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="px-3 pt-1 pb-3">
          <VoucherContactDetails voucher={voucher} />
          {voucherAddress && voucher.catalogActive !== false ? (
            <Button asChild tap className="mt-3 w-full">
              <Link
                to="/vouchers/$voucherAddress"
                params={{ voucherAddress }}
                search={{ from: "vouchers" }}
              >
                <Trans>View voucher</Trans>
                <RiArrowRightSLine className="rtl:-scale-x-100 size-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CreateVoucherButton({ enabled = true }: { enabled?: boolean }) {
  return (
    <Button asChild={enabled} disabled={!enabled} variant="outline" tap>
      {enabled ? (
        <Link to="/vouchers/create/$step" params={{ step: "voucher" }}>
          <RiAddLine className="size-4" aria-hidden="true" />
          <Trans>Create</Trans>
        </Link>
      ) : (
        <span>
          <RiAddLine className="size-4" aria-hidden="true" />
          <Trans>Create</Trans>
        </span>
      )}
    </Button>
  );
}

export function AllVouchersPage() {
  const { t } = useLingui();
  const { address } = useConnection();
  const balancesQuery = useAllAccountTokens(address, { poll: true });
  const ownedVouchersQuery = useAllOwnedVouchers(address, { poll: true });
  const usage = useResourceUsage();
  const voucherGroups = groupWalletVouchers(
    ownedVouchersQuery.vouchers,
    balancesQuery.tokens,
    balancesQuery.isError ? "unavailable" : balancesQuery.isPending ? "loading" : "complete",
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const renderGroup = (list: readonly WalletVoucherListItem[]) =>
    list.map((voucher, index) => {
      const voucherAddress = parseVoucherAddress(voucher.contractAddress ?? voucher.id);
      return (
        <VoucherRow
          key={voucher.id}
          voucher={voucher}
          open={expanded[voucher.id] ?? false}
          onToggle={() => setExpanded((prev) => ({ ...prev, [voucher.id]: !prev[voucher.id] }))}
          voucherAddress={voucherAddress}
          showBorder={index < list.length - 1}
        />
      );
    });

  useEffect(() => {
    resetVoucherCreateHistory();
  }, []);

  return (
    <div className="bg-background pb-bottom-nav flex min-h-[100svh] flex-col px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
      <BackChevron label={t`Wallet`} to="/" search={{ tab: "wallet" }} />

      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-heading text-[1.75rem] leading-tight font-bold">
          <Trans>All Vouchers</Trans>
        </h1>
        <CreateVoucherButton enabled={usage.data?.vouchers.canCreate === true && !usage.isError} />
      </div>

      {ownedVouchersQuery.isPending ? (
        <div className="border-border bg-card border">
          <ListSkeleton framed={false} count={4} label={<Trans>Loading vouchers…</Trans>} />
        </div>
      ) : ownedVouchersQuery.isError ? (
        <div className="border-border bg-card border">
          <div className="space-y-2 p-3">
            <p className="text-muted-foreground text-sm">
              <Trans>Couldn't load vouchers.</Trans>
            </p>
            <Button
              variant="outline"
              tap
              pending={ownedVouchersQuery.isFetching}
              onClick={() => void ownedVouchersQuery.refetch()}
            >
              <Trans>Try again</Trans>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {balancesQuery.isError ? (
            <div role="alert" className="border-border bg-card space-y-2 border p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>Couldn't load vouchers.</Trans>
              </p>
              <Button
                variant="outline"
                tap
                pending={balancesQuery.isFetching}
                onClick={() => void balancesQuery.refetch()}
              >
                <Trans>Try again</Trans>
              </Button>
            </div>
          ) : null}
          {voucherGroups.holdings.length > 0 ? (
            <section aria-labelledby="holdings-title">
              <SectionHeading id="holdings-title" className="mb-2">
                <Trans>Holdings</Trans>
              </SectionHeading>
              <div className="border-border bg-card border">
                {renderGroup(voucherGroups.holdings)}
              </div>
            </section>
          ) : null}
          <section aria-labelledby="my-vouchers-title">
            <SectionHeading id="my-vouchers-title" className="mb-2">
              <ResourceQuotaTitle
                quota={usage.data?.vouchers}
                pending={usage.isPending}
                error={usage.isError}
              >
                <Trans>My Vouchers</Trans>
              </ResourceQuotaTitle>
            </SectionHeading>
            <div className="border-border bg-card border">
              {voucherGroups.owned.length === 0 ? (
                <p className="text-muted-foreground p-3 text-sm">
                  <Trans>No vouchers yet.</Trans>
                </p>
              ) : (
                renderGroup(voucherGroups.owned)
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
