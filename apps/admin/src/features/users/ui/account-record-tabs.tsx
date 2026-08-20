import { voucherFilteredPageQueryOptions } from "@clc/api/features/market/queries";
import { accountPoolsQueryOptions } from "@clc/api/features/pools/queries";
import { reportsByAuthorQueryOptions } from "@clc/api/features/reports/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { AddressCell, PoolCell } from "#/components/admin/chain-cells";
import { RecordPanel } from "#/components/admin/record-panel";
import { SectionState } from "#/components/admin/section-state";
import { StateBadge } from "#/components/admin/state-badge";
import { TablePagination } from "#/components/admin/table-pagination";
import { Badge } from "#/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs";
import { clcApi } from "#/lib/api";
import { termFilter } from "#/lib/catalog-filter";
import type { DataState } from "#/lib/data-state";
import { formatDateTime } from "#/lib/format";
import { isModifiedClick } from "#/lib/tab-navigation";
import { firstPageSearch } from "#/lib/table-search";
import { useDataState } from "#/lib/use-data-state";
import { usePagedTable } from "#/lib/use-paged-table";
import { useAccountTransfers } from "../use-account-balances";
import {
  ACCOUNT_DETAIL_TABS,
  type AccountDetailTab,
  type UserDetailSearch,
} from "../user-detail-search";

// The reports feed pages by an opaque (updated_at, id) cursor rather than the
// numeric one this screen's search params carry, so its tab reads one page.
const RECORD_PAGE_SIZE = 50;

const DIRECTIONS = [
  { value: "all", label: "All types" },
  { value: "IN", label: "Received" },
  { value: "OUT", label: "Sent" },
] as const;

const TAB_LABELS: Record<AccountDetailTab, string> = {
  transactions: "Transactions",
  reports: "Reports",
  vouchers: "Vouchers created",
  pools: "Pool memberships",
};

/**
 * The account's records, one tab per relationship.
 *
 * The open tab is a router search parameter rather than component state, so each
 * tab is linkable and Back returns to the previous one. Base UI's `render` prop
 * makes each tab an actual `<Link>`, which keeps that navigation in the router
 * instead of duplicating it in a click handler.
 *
 * Every panel resolves its query through `SectionState` inside a `RecordPanel`,
 * the same as the pool and voucher records: one place decides what a failed tab
 * looks like, and a table is flush against its frame on all three screens.
 */
export function AccountRecordTabs({
  address,
  search,
}: {
  address: string;
  search: UserDetailSearch;
}) {
  const navigate = useNavigate();
  const tab = search.tab;

  return (
    <Tabs
      value={tab}
      // Navigation happens here rather than through the anchor's default, so every
      // way of activating a tab agrees: Base UI activates on click, on Enter and
      // on Space, and all three land on one navigation and one history entry.
      onValueChange={(next) => {
        if (next === tab) return;
        // Switching tabs resets the table: a cursor issued for transfers names no
        // page in another tab's records.
        void navigate({
          to: "/users/$address",
          params: { address },
          search: { ...firstPageSearch(search), tab: next },
        });
      }}
    >
      <TabsList>
        {ACCOUNT_DETAIL_TABS.map((candidate) => (
          <TabsTab
            key={candidate}
            value={candidate}
            // These render as anchors, so Base UI must stop treating them as
            // native buttons — otherwise it applies button semantics to an
            // element that has none.
            nativeButton={false}
            render={
              <Link
                to="/users/$address"
                params={{ address }}
                search={{ ...firstPageSearch(search), tab: candidate }}
                aria-current={candidate === tab ? "page" : undefined}
                onClick={(event) => {
                  // A modified click is the browser's to handle — that is what makes
                  // "open this tab in a new window" work, and the reason these are
                  // real anchors at all. A plain click defers to onValueChange
                  // above so it cannot navigate twice.
                  if (event.button === 0 && !isModifiedClick(event)) event.preventDefault();
                }}
              />
            }
          >
            {TAB_LABELS[candidate]}
          </TabsTab>
        ))}
      </TabsList>

      <TabsPanel value={tab} className="border-border bg-card border">
        {tab === "transactions" ? (
          <TransfersPanel address={address} search={search} />
        ) : tab === "reports" ? (
          <ReportsPanel address={address} />
        ) : tab === "vouchers" ? (
          <VouchersPanel address={address} search={search} />
        ) : (
          <PoolsPanel address={address} search={search} />
        )}
      </TabsPanel>
    </Tabs>
  );
}

/**
 * Transfers for this account, newest first, paged by cursor.
 *
 * The same controls as the transactions page and for the same reason: page size,
 * First, Previous and Next come from `TablePagination`, and the page state lives in
 * the URL, so an operator deep in an account's history can link it and Back returns
 * them to it. The endpoint reports no total, so nothing here claims how many pages
 * exist — Next is offered while a full page came back.
 *
 * Direction is filtered on the fetched page, because the endpoint takes no such
 * parameter. The count beside the filter says "on this page" so a filtered figure
 * is never read as the account's history.
 */
function TransfersPanel({ address, search }: { address: string; search: UserDetailSearch }) {
  const navigate = useNavigate();
  const [direction, setDirection] = useState<"all" | "IN" | "OUT">("all");

  const query = useAccountTransfers(address, {
    perPage: search.perPage,
    cursor: search.cursor,
    next: search.dir === undefined ? undefined : search.dir === "next",
  });
  const state = useDataState(query, (result) => result.transfers.length === 0);

  const fetched = query.data?.transfers ?? [];
  const transfers = fetched.filter(
    (transfer) => direction === "all" || transfer.direction === direction,
  );

  const table = usePagedTable({
    search,
    // receivedCount is the fetched page, not the filtered view: the pager steps
    // through what the backend sent, and a direction filter must not make it think
    // it has reached the end.
    page: query.data
      ? { first: query.data.first, last: query.data.last, receivedCount: fetched.length }
      : undefined,
    navigate: useCallback(
      (next: UserDetailSearch) =>
        void navigate({ to: "/users/$address", params: { address }, search: next }),
      [navigate, address],
    ),
  });

  return (
    <>
      {/* The filter is a property of rows that arrived, so the strip appears with
          them rather than sitting above a skeleton or an error. */}
      {hasRows(state) ? (
        <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <span className="font-data text-muted-foreground text-xs">
            {transfers.length} on this page
          </span>
          <Select
            // Base UI renders the raw value in the trigger until the popup has
            // mounted, so without `items` the closed control reads "all".
            items={DIRECTIONS}
            value={direction}
            onValueChange={(value) => {
              if (value === "all" || value === "IN" || value === "OUT") setDirection(value);
            }}
          >
            <SelectTrigger size="default" className="w-36 px-2.5" aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {DIRECTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <RecordPanel state={state}>
        <SectionState
          state={state}
          errorTitle="Could not load transactions"
          emptyTitle="No transactions"
          emptyDescription="The indexer has recorded no transfer for this address."
          loadingRows={6}
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Voucher</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((transfer) => (
                  <TableRow key={transfer.id}>
                    <TableCell className="font-data text-xs">
                      {formatDateTime(transfer.dateBlock)}
                    </TableCell>
                    <TableCell className="font-mono text-xs uppercase">
                      {transfer.direction === "IN" ? "received" : "sent"}
                    </TableCell>
                    <TableCell>
                      {/* Linked, as every other address in the console is: the
                          counterparty is an account with a screen of its own, and
                          following a transfer to the other side of it is how an
                          operator reads a dispute. */}
                      <AddressCell address={transfer.counterpartyAddress} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{transfer.tokenSymbol}</TableCell>
                    <TableCell className="font-data text-right">
                      {formatTokenAmount(transfer.amount, transfer.tokenDecimals)}
                    </TableCell>
                    <TableCell>
                      <StateBadge state={transfer.success ? "SUCCESS" : "FAIL"} kind="transfer" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionState>
      </RecordPanel>

      {hasRows(state) ? (
        <PanelPagination search={search} table={table} isFetching={query.isFetching} />
      ) : null}
    </>
  );
}

/** Reports this account authored, filtered at the backend by author. */
function ReportsPanel({ address }: { address: string }) {
  const query = useQuery(reportsByAuthorQueryOptions(clcApi.reports, address, RECORD_PAGE_SIZE));
  const state = useDataState(query, (page) => page.reports.length === 0);

  return (
    <RecordPanel state={state}>
      <SectionState
        state={state}
        errorTitle="Could not load reports"
        emptyTitle="No reports"
        emptyDescription="This account has authored nothing in the catalog."
        loadingRows={6}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(query.data?.reports ?? []).map((report) => (
                <TableRow key={report.id}>
                  <TableCell>
                    <div className="truncate font-medium">{report.title}</div>
                    {report.description ? (
                      <div className="text-muted-foreground truncate text-xs">
                        {report.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {report.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="font-mono text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {report.locationName ?? "—"}
                  </TableCell>
                  <TableCell className="font-data text-xs">
                    {formatDateTime(report.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionState>
    </RecordPanel>
  );
}

/**
 * Vouchers this account owns, filtered at the backend by owner.
 *
 * The catalog answers with active, geolocated vouchers only, so this is what the
 * public catalog can show — the same rule the `Voucher holdings` figure counts by,
 * which is what keeps the two in agreement.
 */
function VouchersPanel({ address, search }: { address: string; search: UserDetailSearch }) {
  const navigate = useNavigate();
  const query = useQuery(
    voucherFilteredPageQueryOptions(clcApi.market, {
      perPage: search.perPage,
      cursor: search.cursor,
      next: search.dir === undefined ? undefined : search.dir === "next",
      filter: termFilter(""),
      owner: address,
    }),
  );
  const state = useDataState(query, (page) => page.vouchers.length === 0);
  const table = usePagedTable({
    search,
    page: query.data,
    navigate: useCallback(
      (next: UserDetailSearch) =>
        void navigate({ to: "/users/$address", params: { address }, search: next }),
      [navigate, address],
    ),
  });

  return (
    <>
      <RecordPanel state={state}>
        <SectionState
          state={state}
          errorTitle="Could not load vouchers"
          emptyTitle="No vouchers created"
          emptyDescription="This account issues no voucher the catalog can show."
          loadingRows={6}
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.vouchers ?? []).map((voucher) => (
                  <TableRow key={voucher.id}>
                    <TableCell>
                      <div className="truncate font-medium">{voucher.name}</div>
                      <div className="text-muted-foreground font-mono text-xs">
                        {voucher.symbol}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/vouchers/$address"
                        params={{ address: voucher.address }}
                        search={{ tab: "offerings" }}
                        className="font-data text-xs underline-offset-4 hover:underline"
                      >
                        {formatVoucherAddress(voucher.address)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs uppercase">
                        {voucher.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {voucher.locationName ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionState>
      </RecordPanel>

      {hasRows(state) ? (
        <PanelPagination search={search} table={table} isFetching={query.isFetching} />
      ) : null}
    </>
  );
}

/**
 * Pools this account belongs to.
 *
 * Membership is derived by clc-core: a pool belongs to an account when it allows a
 * voucher that account owns. Nothing records a user joining a pool.
 */
function PoolsPanel({ address, search }: { address: string; search: UserDetailSearch }) {
  const navigate = useNavigate();
  const query = useQuery(
    accountPoolsQueryOptions(clcApi.pools, address, {
      perPage: search.perPage,
      cursor: search.cursor,
      next: search.dir === undefined ? undefined : search.dir === "next",
    }),
  );
  const state = useDataState(query, (page) => page.pools.length === 0);
  const table = usePagedTable({
    search,
    page: query.data,
    navigate: useCallback(
      (next: UserDetailSearch) =>
        void navigate({ to: "/users/$address", params: { address }, search: next }),
      [navigate, address],
    ),
  });

  return (
    <>
      <RecordPanel state={state}>
        <SectionState
          state={state}
          errorTitle="Could not load pool memberships"
          emptyTitle="No pool memberships"
          emptyDescription="No pool allows a voucher this account owns."
          loadingRows={6}
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pool</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Vouchers</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.pools ?? []).map((pool) => (
                  <TableRow key={pool.id}>
                    <TableCell>
                      <Link
                        to="/pools/$address"
                        params={{ address: pool.address }}
                        search={{ tab: "vouchers" }}
                        className="truncate font-medium underline-offset-4 hover:underline"
                      >
                        {pool.name}
                      </Link>
                      <div className="text-muted-foreground font-mono text-xs">{pool.symbol}</div>
                    </TableCell>
                    <TableCell>
                      <PoolCell address={pool.address} />
                    </TableCell>
                    <TableCell className="font-data text-xs">{pool.voucherCount}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {pool.locationName ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionState>
      </RecordPanel>

      {hasRows(state) ? (
        <PanelPagination search={search} table={table} isFetching={query.isFetching} />
      ) : null}
    </>
  );
}

/**
 * Whether the panel is showing rows, and so whether the controls that act on them
 * belong on screen. A pager over a skeleton or an error block is a control with
 * nothing to page.
 */
function hasRows(state: DataState): boolean {
  return state.kind === "ready" || state.kind === "stale";
}

function PanelPagination({
  search,
  table,
  isFetching,
}: {
  search: UserDetailSearch;
  table: ReturnType<typeof usePagedTable<UserDetailSearch>>;
  isFetching: boolean;
}) {
  return (
    // The same footer the paged tables carry, flush under the rows.
    <div className="border-border border-t px-4 py-3">
      <TablePagination
        search={search}
        dropped={0}
        isFirstPage={table.isFirstPage}
        mightHaveMore={table.mightHaveMore}
        isFetching={isFetching}
        onFirstPage={table.onFirstPage}
        onPreviousPage={table.onPreviousPage}
        onNextPage={table.onNextPage}
        onPageSize={table.onPageSize}
      />
    </div>
  );
}
