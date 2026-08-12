import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { useQuery } from "@tanstack/react-query";
import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { CopyButton } from "#/components/admin/copy-button";
import { PageHeader } from "#/components/admin/page-header";
import { SectionState } from "#/components/admin/section-state";
import { StateBadge } from "#/components/admin/state-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { formatDateTime } from "#/lib/format";
import { useDataState } from "#/lib/use-data-state";
import { accountTransfersQueryOptions } from "@clc/api/features/accounts/queries";
import { latestAccountTokensQueryOptions } from "@clc/api/features/accounts/queries";
import { clcApi } from "#/lib/api";
import { AccountAdminPanel } from "./ui/account-admin-panel";

const TRANSFER_PAGE_SIZE = 50;

export function UserDetailPage({ address }: { address: string }) {
  const tokensQuery = useQuery(latestAccountTokensQueryOptions(clcApi.accounts, address));
  const transfersQuery = useQuery(
    accountTransfersQueryOptions(clcApi.accounts, address, TRANSFER_PAGE_SIZE),
  );

  const tokensState = useDataState(tokensQuery, (result) => result.tokens.length === 0);
  const transfersState = useDataState(transfersQuery, (result) => result.transfers.length === 0);

  const tokens = tokensQuery.data?.tokens ?? [];
  const transfers = transfersQuery.data?.transfers ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={
          <AppBreadcrumb
            items={[
              { label: "Accounts", to: "/users" },
              { label: formatVoucherAddress(address as `0x${string}`) },
            ]}
          />
        }
        title={formatVoucherAddress(address as `0x${string}`)}
        description={
          <span className="inline-flex items-center gap-1">
            <span className="font-data text-xs">{address}</span>
            <CopyButton value={address} label="Copy address" />
          </span>
        }
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Account
        </h2>
        <AccountAdminPanel address={address} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Balances ({tokens.length})
        </h2>
        <SectionState
          state={tokensState}
          errorTitle="Could not load balances"
          emptyTitle="No balances"
          emptyDescription="This account holds no indexed tokens."
        >
          <div className="overflow-x-auto border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Last block</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell>
                      <div className="truncate font-medium">{token.tokenName}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {token.tokenSymbol}
                      </div>
                    </TableCell>
                    <TableCell className="font-data text-xs">
                      {formatVoucherAddress(token.tokenAddress as `0x${string}`)}
                    </TableCell>
                    <TableCell className="text-right font-data">
                      {formatTokenAmount(token.balance, token.tokenDecimals)}
                    </TableCell>
                    <TableCell className="font-data text-xs">{token.lastDateBlock}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionState>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Transfers ({transfers.length})
        </h2>
        <SectionState
          state={transfersState}
          errorTitle="Could not load transfers"
          emptyTitle="No transfers"
          emptyDescription="This account has no indexed transfers."
        >
          <div className="overflow-x-auto border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Direction</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((transfer) => (
                  <TableRow key={transfer.id}>
                    <TableCell className="font-mono text-xs uppercase">
                      {transfer.direction}
                    </TableCell>
                    <TableCell className="font-data text-xs">
                      {formatVoucherAddress(transfer.counterpartyAddress as `0x${string}`)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{transfer.tokenSymbol}</TableCell>
                    <TableCell className="text-right font-data">
                      {formatTokenAmount(transfer.amount, transfer.tokenDecimals)}
                    </TableCell>
                    <TableCell>
                      <StateBadge state={transfer.success ? "SUCCESS" : "FAIL"} kind="transfer" />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(transfer.dateBlock)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionState>
      </section>
    </div>
  );
}
