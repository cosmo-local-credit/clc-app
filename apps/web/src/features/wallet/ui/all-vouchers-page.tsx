import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { RiArrowDownSLine, RiArrowRightSLine } from "react-icons/ri";
import { useConnection } from "wagmi";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { TokenLogo, type WalletToken } from "#/components/wallet";
import { useAccountTokensInfinite } from "#/features/wallet/hooks/use-account-balances";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { VoucherContactDetails } from "./voucher-contact-details";

function VoucherRow({
  voucher,
  open,
  onToggle,
  showBorder,
}: {
  voucher: WalletToken;
  open: boolean;
  onToggle: () => void;
  showBorder: boolean;
}) {
  return (
    <div className={showBorder ? "border-b border-border" : ""}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 p-3 text-left"
      >
        <TokenLogo token={voucher} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold tracking-tight">{voucher.symbol}</p>
            {voucher.admin ? (
              <Badge className="h-4 px-1 text-[0.5rem] uppercase tracking-[0.06em]">
                <Trans>Admin</Trans>
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">{voucher.name}</p>
        </div>
        <p className="shrink-0 font-heading text-sm font-semibold tracking-tight">
          {voucher.amount}
        </p>
        <RiArrowDownSLine
          className={[
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="px-3 pb-3 pt-1">
          <VoucherContactDetails voucher={voucher} />
          <Button asChild className="mt-3 h-11 w-full gap-1.5 text-xs">
            <Link
              to="/vouchers/$voucherAddress"
              params={{ voucherAddress: voucher.id }}
              search={{ from: "vouchers" }}
              preload="intent"
            >
              <Trans>View voucher</Trans>
              <RiArrowRightSLine className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AllVouchersPage() {
  const { t } = useLingui();
  const { address } = useConnection();
  // The voucher list is this screen's whole purpose, so it keeps a live poll.
  const vouchersQuery = useAccountTokensInfinite(address, { poll: true });
  const vouchers =
    vouchersQuery.data?.pages.flatMap((page) => page.tokens.map(accountTokenToWalletToken)) ?? [];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-bottom-nav">
      <BackChevron label={t`Wallet`} to="/" search={{ tab: "wallet" }} />

      <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
        <Trans>All Vouchers</Trans>
      </h1>
      <p className="mt-1 mb-4 text-muted-foreground text-sm">
        <Trans>Community vouchers and their details.</Trans>
      </p>

      <div className="border border-border bg-card">
        {vouchersQuery.isPending ? (
          <div className="p-3 text-muted-foreground text-sm">
            <Trans>Loading vouchers…</Trans>
          </div>
        ) : null}
        {vouchersQuery.isError ? (
          <div className="space-y-2 p-3">
            <p className="text-muted-foreground text-sm">
              <Trans>Couldn't load vouchers.</Trans>
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-9 bg-card"
              onClick={() => vouchersQuery.refetch()}
            >
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}
        {vouchersQuery.isSuccess && vouchers.length === 0 ? (
          <div className="p-3 text-muted-foreground text-sm">
            <Trans>No vouchers yet.</Trans>
          </div>
        ) : null}
        {vouchers.map((voucher, index, list) => {
          const isOpen = expanded[voucher.id] ?? false;
          return (
            <VoucherRow
              key={voucher.id}
              voucher={voucher}
              open={isOpen}
              onToggle={() => setExpanded((prev) => ({ ...prev, [voucher.id]: !prev[voucher.id] }))}
              showBorder={index < list.length - 1}
            />
          );
        })}
      </div>

      {vouchersQuery.hasNextPage ? (
        <Button
          variant="outline"
          className="mt-3 h-11 w-full bg-card"
          disabled={vouchersQuery.isFetchingNextPage}
          onClick={() => vouchersQuery.fetchNextPage()}
        >
          {vouchersQuery.isFetchingNextPage ? t`Loading…` : t`Load more`}
        </Button>
      ) : null}
    </div>
  );
}
