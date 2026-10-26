import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { RiAddLine } from "react-icons/ri";
import { useConnection } from "wagmi";

import { ResourceQuotaTitle } from "#/components/resource-usage";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { TokenLogo, type WalletToken } from "#/components/wallet";
import { useDeskTrailLabel } from "#/desktop/trail";
import type { DeskColumn } from "#/desktop/ui/data-table";
import { DeskTable } from "#/desktop/ui/data-table";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { DeskCanvas, DeskSection, DeskTitle } from "#/desktop/ui/page";
import { useAccountTokensInfinite } from "#/features/wallet/hooks/use-account-balances";
import { usePartitionedVouchers } from "#/features/wallet/hooks/use-partitioned-vouchers";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { resetVoucherCreateHistory } from "#/lib/navigation/voucher-create-history";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { VoucherContactDetails } from "#/features/wallet/ui/voucher-contact-details";

export function AllVouchersDesk() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const router = useRouter();
  const { address } = useConnection();
  const { voucher } = useSearch({ from: "/_nav/wallet/vouchers" });
  const selectedAddress = parseVoucherAddress(voucher);
  const balancesQuery = useAccountTokensInfinite(address, { poll: true });
  const usage = useResourceUsage();
  const groups = usePartitionedVouchers(
    balancesQuery.data?.pages.flatMap((page) => page.tokens.map(accountTokenToWalletToken)) ?? [],
    address,
  );
  const selected = selectedAddress
    ? [...groups.holdings, ...groups.issued].find(
        (row) => (row.contractAddress ?? row.id).toLowerCase() === selectedAddress.toLowerCase(),
      )
    : undefined;
  const armed = useRef<string | null>(null);
  useDeskTrailLabel(selected?.symbol ?? selected?.name ?? null);

  useEffect(() => {
    resetVoucherCreateHistory();
  }, []);
  useEffect(() => {
    if (selectedAddress) armed.current = null;
  }, [selectedAddress]);

  function openVoucher(row: WalletToken) {
    const voucherAddress = parseVoucherAddress(row.contractAddress ?? row.id);
    if (!voucherAddress) return;
    if (voucherAddress.toLowerCase() === selectedAddress?.toLowerCase()) return;
    if (armed.current === voucherAddress.toLowerCase()) return;
    const replace = selectedAddress != null || armed.current != null;
    armed.current = voucherAddress.toLowerCase();
    void navigate({
      to: "/wallet/vouchers",
      search: { voucher: voucherAddress, panel: "open" },
      replace,
    });
  }

  const columns = useMemo<DeskColumn<WalletToken>[]>(
    () => [
      {
        id: "voucher",
        header: t`Vouchers`,
        sortValue: (row) => row.symbol,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <TokenLogo token={row} size={20} />
            <span className="truncate text-sm font-semibold">{row.symbol}</span>
            <span className="truncate text-xs text-muted-foreground">{row.name}</span>
            {row.admin ? (
              <Badge size="sm" caps>
                <Trans>Admin</Trans>
              </Badge>
            ) : null}
          </span>
        ),
      },
      {
        id: "balance",
        header: t`Balance`,
        align: "end",
        width: "8rem",
        sortValue: (row) => Number(row.balance ?? 0),
        cell: (row) => (
          <span className="font-heading font-semibold tracking-tight" dir="ltr">
            {row.amount}
          </span>
        ),
      },
    ],
    [t],
  );
  const canCreate = usage.data?.vouchers.canCreate === true && !usage.isError;
  const pending = Boolean(address) && (groups.isPending || balancesQuery.isPending);

  return (
    <div className="flex h-full min-h-0">
      <DeskSplit
        main={
          <DeskCanvas width="full">
            <div className="mb-4 flex items-center justify-between gap-3">
              <DeskTitle>
                <Trans>All Vouchers</Trans>
              </DeskTitle>
              <Button asChild={canCreate} disabled={!canCreate} variant="outline">
                {canCreate ? (
                  <Link to="/vouchers/create/$step" params={{ step: "voucher" }}>
                    <RiAddLine aria-hidden="true" />
                    <Trans>Create</Trans>
                  </Link>
                ) : (
                  <span>
                    <RiAddLine aria-hidden="true" />
                    <Trans>Create</Trans>
                  </span>
                )}
              </Button>
            </div>
            {pending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                <Trans>Loading vouchers…</Trans>
              </p>
            ) : groups.isError ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  <Trans>Couldn't load vouchers.</Trans>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  pending={groups.isFetching}
                  onClick={() => void groups.refetch()}
                >
                  <Trans>Try again</Trans>
                </Button>
              </div>
            ) : (
              <>
                {balancesQuery.isError ? (
                  <div role="alert" className="mb-4 space-y-2 border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">
                      <Trans>Couldn't load vouchers.</Trans>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      pending={balancesQuery.isFetching}
                      onClick={() => void balancesQuery.refetch()}
                    >
                      <Trans>Try again</Trans>
                    </Button>
                  </div>
                ) : null}
                <div className="space-y-6">
                  {groups.holdings.length > 0 ? (
                    <DeskSection title={<Trans>Holdings</Trans>}>
                      <DeskTable
                        label={t`Holdings`}
                        rows={groups.holdings}
                        columns={columns}
                        rowKey={(row) => row.id}
                        selectedKey={selected?.id}
                        onSelect={openVoucher}
                      />
                    </DeskSection>
                  ) : null}
                  <DeskSection
                    title={
                      <ResourceQuotaTitle
                        quota={usage.data?.vouchers}
                        pending={usage.isPending}
                        error={usage.isError}
                      >
                        <Trans>My Vouchers</Trans>
                      </ResourceQuotaTitle>
                    }
                  >
                    <DeskTable
                      label={t`My Vouchers`}
                      rows={groups.issued}
                      columns={columns}
                      rowKey={(row) => row.id}
                      selectedKey={selected?.id}
                      onSelect={openVoucher}
                      empty={<Trans>No vouchers yet.</Trans>}
                    />
                  </DeskSection>
                </div>
              </>
            )}
            {balancesQuery.hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                pending={balancesQuery.isFetchingNextPage}
                onClick={() => void balancesQuery.fetchNextPage()}
              >
                <Trans>Load more</Trans>
              </Button>
            ) : null}
          </DeskCanvas>
        }
        side={
          selectedAddress ? (
            <DeskInspector
              title={selected?.symbol ?? t`Vouchers`}
              onClose={() => router.history.back()}
              footer={
                <Button asChild>
                  <Link
                    to="/vouchers/$voucherAddress"
                    params={{ voucherAddress: selectedAddress }}
                    search={{ from: "vouchers" }}
                  >
                    <Trans>View voucher</Trans>
                  </Link>
                </Button>
              }
            >
              {selected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <TokenLogo token={selected} size={36} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{selected.name}</p>
                      <p className="font-heading font-semibold tracking-tight" dir="ltr">
                        {selected.amount}
                      </p>
                    </div>
                  </div>
                  <VoucherContactDetails voucher={selected} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Trans>Couldn't load vouchers.</Trans>
                </p>
              )}
            </DeskInspector>
          ) : null
        }
      />
    </div>
  );
}
