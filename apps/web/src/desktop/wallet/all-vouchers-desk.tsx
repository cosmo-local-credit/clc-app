import type { ResourceUsage } from "@clc/api/features/resource-limits/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { RiAddLine, RiSendPlane2Line } from "react-icons/ri";
import { useConnection } from "wagmi";

import { ResourceLimitMessage } from "#/components/resource-usage";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { TokenLogo, type WalletToken } from "#/components/wallet";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { useDeskTrailLabel } from "#/desktop/trail";
import type { DeskColumn } from "#/desktop/ui/data-table";
import { DeskTable } from "#/desktop/ui/data-table";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskCanvas, DeskSection, DeskTitleRow } from "#/desktop/ui/page";
import { useAccountTokensInfinite } from "#/features/wallet/hooks/use-account-balances";
import { usePartitionedVouchers } from "#/features/wallet/hooks/use-partitioned-vouchers";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { resetVoucherCreateHistory } from "#/lib/navigation/voucher-create-history";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";

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
        header: t`Voucher`,
        sortValue: (row) => row.symbol,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-3">
            <TokenLogo token={row} size={28} />
            <span className="shrink-0 text-sm font-semibold" dir="ltr">
              {row.symbol}
            </span>
            {row.admin ? (
              <Badge variant="outline" size="sm" caps>
                <Trans>Admin</Trans>
              </Badge>
            ) : null}
            <span className="truncate text-sm text-muted-foreground">{row.name}</span>
          </span>
        ),
      },
      {
        id: "balance",
        header: t`Balance`,
        align: "end",
        width: "10rem",
        sortValue: (row) => Number(row.balance ?? 0),
        cell: (row) => (
          <span className="font-heading text-base font-semibold tracking-tight" dir="ltr">
            {row.amount}
          </span>
        ),
      },
    ],
    [t],
  );
  const canCreate = usage.data?.vouchers.canCreate === true && !usage.isError;
  const pending = Boolean(address) && (groups.isPending || balancesQuery.isPending);

  const quota = usage.data?.vouchers;

  return (
    <div className="flex h-full min-h-0">
      <DeskSplit
        main={
          <DeskCanvas>
            <DeskTitleRow
              title={<Trans>All Vouchers</Trans>}
              actions={
                <Button asChild={canCreate} disabled={!canCreate}>
                  {canCreate ? (
                    <Link to="/vouchers/create/$step" params={{ step: "voucher" }}>
                      <RiAddLine aria-hidden="true" />
                      <Trans>Create</Trans>
                    </Link>
                  ) : (
                    <>
                      <RiAddLine aria-hidden="true" />
                      <Trans>Create</Trans>
                    </>
                  )}
                </Button>
              }
            />
            {pending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                <Trans>Loading vouchers…</Trans>
              </p>
            ) : groups.isError ? (
              <div className="grid justify-items-start gap-2 border border-border bg-card p-4">
                <p role="alert" className="text-sm text-muted-foreground">
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
                  <div
                    role="alert"
                    className="grid justify-items-start gap-2 border border-border bg-card p-4"
                  >
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
                    {balancesQuery.hasNextPage ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3 self-start"
                        pending={balancesQuery.isFetchingNextPage}
                        onClick={() => void balancesQuery.fetchNextPage()}
                      >
                        <Trans>Load more</Trans>
                      </Button>
                    ) : null}
                  </DeskSection>
                ) : null}
                <DeskSection
                  title={<Trans>My Vouchers</Trans>}
                  action={
                    usage.isError ? (
                      <span className="text-xs text-muted-foreground">
                        <Trans>Unavailable</Trans>
                      </span>
                    ) : quota ? (
                      <QuotaUsed quota={quota} />
                    ) : null
                  }
                >
                  <DeskTable
                    label={t`My Vouchers`}
                    rows={groups.issued}
                    columns={columns}
                    rowKey={(row) => row.id}
                    selectedKey={selected?.id}
                    onSelect={openVoucher}
                    empty={
                      <span className="grid gap-1">
                        <Trans>No vouchers yet.</Trans>
                        <ResourceLimitMessage quota={quota} />
                      </span>
                    }
                  />
                  {groups.holdings.length === 0 && balancesQuery.hasNextPage ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 self-start"
                      pending={balancesQuery.isFetchingNextPage}
                      onClick={() => void balancesQuery.fetchNextPage()}
                    >
                      <Trans>Load more</Trans>
                    </Button>
                  ) : null}
                </DeskSection>
              </>
            )}
          </DeskCanvas>
        }
        side={
          selectedAddress ? (
            <DeskInspector
              title={
                <span className="flex min-w-0 items-center gap-2">
                  {selected ? <TokenLogo token={selected} size={20} /> : null}
                  <span className="truncate">{selected?.name ?? t`Vouchers`}</span>
                </span>
              }
              onClose={() => router.history.back()}
            >
              {selected ? (
                <>
                  <p className="flex items-baseline gap-1.5">
                    <span className="font-heading text-xl font-semibold tracking-tight" dir="ltr">
                      {selected.amount}
                    </span>
                    <span className="font-mono text-sm text-muted-foreground" dir="ltr">
                      {selected.symbol}
                    </span>
                  </p>
                  {selected.location || selected.phone || selected.email || selected.owner ? (
                    <DeskKV
                      rows={[
                        selected.location
                          ? [
                              <Trans key="label">Location</Trans>,
                              <span key="value" dir="auto" className="font-sans">
                                {selected.location}
                              </span>,
                            ]
                          : null,
                        selected.phone
                          ? [
                              <Trans key="label">Phone</Trans>,
                              <span key="value" dir="ltr">
                                {selected.phone}
                              </span>,
                            ]
                          : null,
                        selected.email
                          ? [
                              <Trans key="label">Email</Trans>,
                              <span key="value" dir="ltr">
                                {selected.email}
                              </span>,
                            ]
                          : null,
                        selected.owner
                          ? [
                              <Trans key="label">Issuer</Trans>,
                              <RecipientIdentityLabel key="value" address={selected.owner} />,
                            ]
                          : null,
                      ]}
                    />
                  ) : null}
                  {hasBalance(selected) ? (
                    <Button asChild variant="outline">
                      <Link to="/wallet/send" search={{ token: selectedAddress }}>
                        <RiSendPlane2Line aria-hidden="true" />
                        <Trans>Send</Trans>
                      </Link>
                    </Button>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Trans>Couldn't load vouchers.</Trans>
                </p>
              )}
              <Button asChild>
                <Link
                  to="/vouchers/$voucherAddress"
                  params={{ voucherAddress: selectedAddress }}
                  search={{ from: "vouchers" }}
                >
                  <Trans>View voucher</Trans>
                </Link>
              </Button>
            </DeskInspector>
          ) : null
        }
      />
    </div>
  );
}

function hasBalance(token: WalletToken): boolean {
  try {
    return BigInt(token.balance ?? "0") > 0n;
  } catch {
    return false;
  }
}

function QuotaUsed({ quota }: { quota: ResourceUsage["vouchers"] }) {
  const { i18n } = useLingui();
  const digits = new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale);
  const used = digits.format(quota.used);
  const limit = digits.format(quota.limit);
  return (
    <span className="text-xs text-muted-foreground" aria-live="polite">
      {quota.unlimited ? (
        <Trans id="{used} used · Unlimited">{used} used · Unlimited</Trans>
      ) : (
        <Trans id="{used} of {limit} used">
          {used} of {limit} used
        </Trans>
      )}
    </span>
  );
}
