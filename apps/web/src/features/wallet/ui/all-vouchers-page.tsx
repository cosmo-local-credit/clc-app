import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RiAddLine, RiArrowDownSLine, RiArrowRightSLine } from "react-icons/ri";
import { useConnection } from "wagmi";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { TokenLogo, type WalletToken } from "#/components/wallet";
import { useAccountTokensInfinite } from "#/features/wallet/hooks/use-account-balances";
import { usePartitionedVouchers } from "#/features/wallet/hooks/use-partitioned-vouchers";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { resetVoucherCreateHistory } from "#/lib/navigation/voucher-create-history";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { VoucherContactDetails } from "./voucher-contact-details";

function VoucherRow({
  voucher,
  open,
  onToggle,
  voucherAddress,
  showBorder,
}: {
  voucher: WalletToken;
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
            <p className="text-sm font-bold tracking-tight">{voucher.symbol}</p>
            {voucher.admin ? (
              <Badge className="h-4 px-1 text-[0.5rem] tracking-[0.06em] uppercase">
                <Trans>Admin</Trans>
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">{voucher.name}</p>
        </div>
        <p className="font-heading shrink-0 text-sm font-semibold tracking-tight">
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
        <div className="px-3 pt-1 pb-3">
          <VoucherContactDetails voucher={voucher} />
          {voucherAddress ? (
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

function CreateVoucherButton() {
  return (
    <Button asChild variant="outline" tap>
      <Link to="/vouchers/create/$step" params={{ step: "voucher" }}>
        <RiAddLine className="size-4" aria-hidden="true" />
        <Trans>Create</Trans>
      </Link>
    </Button>
  );
}

export function AllVouchersPage() {
  const { t } = useLingui();
  const { address } = useConnection();
  // The voucher list is this screen's whole purpose, so it keeps a live poll.
  const vouchersQuery = useAccountTokensInfinite(address, { poll: true });
  const vouchers =
    vouchersQuery.data?.pages.flatMap((page) => page.tokens.map(accountTokenToWalletToken)) ?? [];
  const voucherGroups = usePartitionedVouchers(vouchers, address);
  // Rows are grouped as their owners arrive. The list waits, or fails, as a
  // whole only until the first one lands; after that the rows a new page or a
  // poll adds wait in a status tile, so Load more does not blank the list.
  const resolved = voucherGroups.holdings.length + voucherGroups.issued.length > 0;
  const unresolved = voucherGroups.pending || voucherGroups.failed;
  const ownersPending = vouchers.length > 0 && !resolved && voucherGroups.pending;
  const ownersFailed =
    vouchers.length > 0 && !resolved && !voucherGroups.pending && voucherGroups.failed;
  const vouchersReady = vouchersQuery.isSuccess && vouchers.length > 0 && resolved;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const renderGroup = (list: typeof vouchers) =>
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
        <CreateVoucherButton />
      </div>

      {!vouchersReady ? (
        <div className="border-border bg-card border">
          {vouchersQuery.isPending || ownersPending ? (
            <div className="text-muted-foreground p-3 text-sm">
              <Trans>Loading vouchers…</Trans>
            </div>
          ) : null}
          {vouchersQuery.isError || ownersFailed ? (
            <div className="space-y-2 p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>Couldn't load vouchers.</Trans>
              </p>
              <Button
                variant="outline"
                tap
                onClick={() => {
                  void vouchersQuery.refetch();
                  void voucherGroups.refetch();
                }}
              >
                <Trans>Try again</Trans>
              </Button>
            </div>
          ) : null}
          {vouchersQuery.isSuccess &&
          !resolved &&
          !voucherGroups.pending &&
          !voucherGroups.failed ? (
            <div className="flex min-h-14 items-center justify-between gap-3 p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>No vouchers yet.</Trans>
              </p>
              <CreateVoucherButton />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          {voucherGroups.holdings.length > 0 ? (
            <section aria-labelledby="holdings-title">
              <h2 id="holdings-title" className="font-heading mb-2 text-base font-semibold">
                <Trans>Holdings</Trans>
              </h2>
              <div className="border-border bg-card border">
                {renderGroup(voucherGroups.holdings)}
              </div>
            </section>
          ) : null}
          {voucherGroups.issued.length > 0 || (!vouchersQuery.hasNextPage && !unresolved) ? (
            <section aria-labelledby="my-vouchers-title">
              <h2 id="my-vouchers-title" className="font-heading mb-2 text-base font-semibold">
                <Trans>My Vouchers</Trans>
              </h2>
              <div className="border-border bg-card border">
                {voucherGroups.issued.length === 0 ? (
                  <p className="text-muted-foreground p-3 text-sm">
                    <Trans>You haven't issued a voucher yet.</Trans>
                  </p>
                ) : (
                  renderGroup(voucherGroups.issued)
                )}
              </div>
            </section>
          ) : null}
          {unresolved ? (
            <div className="border-border bg-card space-y-2 border p-3">
              {voucherGroups.pending ? (
                <p className="text-muted-foreground text-sm">
                  <Trans>Loading vouchers…</Trans>
                </p>
              ) : null}
              {voucherGroups.failed ? (
                <>
                  <p className="text-muted-foreground text-sm">
                    <Trans>Some vouchers couldn't load.</Trans>
                  </p>
                  <Button
                    variant="outline"
                    tap
                    onClick={() => {
                      void voucherGroups.refetch();
                    }}
                  >
                    <Trans>Try again</Trans>
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {vouchersQuery.hasNextPage ? (
        <Button
          variant="outline"
          tap
          className="mt-3 w-full"
          disabled={vouchersQuery.isFetchingNextPage}
          onClick={() => vouchersQuery.fetchNextPage()}
        >
          {vouchersQuery.isFetchingNextPage ? t`Loading…` : t`Load more`}
        </Button>
      ) : null}
    </div>
  );
}
