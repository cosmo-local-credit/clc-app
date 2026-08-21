import { adminVoucherTransactionsQueryOptions } from "@clc/api/features/admin/queries";
import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import type { Offering } from "@clc/api/features/offerings/client";
import { voucherOfferingsQueryOptions } from "@clc/api/features/offerings/queries";
import { poolFilteredQueryOptions } from "@clc/api/features/pools/queries";
import { reportFilteredQueryOptions } from "@clc/api/features/reports/queries";
import type { CatalogFilter, HexAddress } from "@clc/core/features/catalog/logic";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { AddressCell, PoolCell, TokenAmount, TxLink } from "#/components/admin/chain-cells";
import { EmptyState } from "#/components/admin/empty-state";
import { RecordPanel } from "#/components/admin/record-panel";
import { SectionState } from "#/components/admin/section-state";
import { SectionLabel } from "#/components/admin/section-heading";
import { StateBadge } from "#/components/admin/state-badge";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
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
import { formatDateTime, formatFeePpm } from "#/lib/format";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";
import { isModifiedClick } from "#/lib/tab-navigation";
import { useDataState } from "#/lib/use-data-state";
import { cn } from "#/lib/utils";
import { VoucherOfferingCard } from "./ui/voucher-offering-card";
import {
  VOUCHER_DETAIL_TABS,
  type VoucherDetailSearch,
  type VoucherDetailTab,
} from "./voucher-detail-search";

const RECORD_PAGE_SIZE = 25;
const OFFERING_PAGE_SIZE = 100;

const TAB_LABELS: Record<VoucherDetailTab, string> = {
  offerings: "Offerings",
  transactions: "Transactions",
  reports: "Reports",
  pools: "Pools",
};

/**
 * The voucher's records, one tab per relationship.
 *
 * The open tab is a router search parameter rather than component state, so each
 * tab is linkable and Back returns to the previous one. Base UI's `render` prop
 * makes each tab an actual `<Link>`, which keeps that navigation in the router
 * instead of duplicating it in a click handler.
 *
 * Each panel owns its own request, so one tab's failure is contained: an offerings
 * endpoint that is down must not take the transaction history with it. That is
 * what `SectionState` renders, and `RecordPanel` is the one rule about where the
 * padding goes.
 */
export function VoucherRecordTabs({
  voucher,
  search,
  onEditOffering,
  onAddOffering,
}: {
  voucher: MarketVoucherDetail;
  search: VoucherDetailSearch;
  onEditOffering: (offering: Offering) => void;
  onAddOffering: () => void;
}) {
  const navigate = useNavigate();
  const tab = search.tab;

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        if (next === tab) return;
        void navigate({
          to: "/vouchers/$address",
          params: { address: voucher.address },
          search: { tab: next as VoucherDetailTab },
        });
      }}
    >
      <TabsList>
        {VOUCHER_DETAIL_TABS.map((candidate) => (
          <TabsTab
            key={candidate}
            value={candidate}
            // Rendered as an anchor, so Base UI must stop treating it as a native
            // button — otherwise it applies button semantics to an element that
            // has none.
            nativeButton={false}
            render={
              <Link
                to="/vouchers/$address"
                params={{ address: voucher.address }}
                search={{ tab: candidate }}
                aria-current={candidate === tab ? "page" : undefined}
                onClick={(event) => {
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
        {tab === "offerings" ? (
          <OfferingsPanel
            voucher={voucher}
            onEditOffering={onEditOffering}
            onAddOffering={onAddOffering}
          />
        ) : tab === "transactions" ? (
          <TransactionsPanel address={voucher.address} />
        ) : (
          <CatalogPanel tab={tab} voucher={voucher} />
        )}
      </TabsPanel>
    </Tabs>
  );
}

/**
 * What is being sold for this voucher, as the marketplace shows it — and where an
 * operator adds to it.
 *
 * There is no retired-voucher state here, because this screen cannot reach one.
 * `get-market-voucher-by-address` ends `AND v.active`, so a retired voucher is a
 * 404 from the detail endpoint and the page never renders far enough to show its
 * tabs. clc-core's `409` on a write is what covers the remaining case — a voucher
 * retired while this screen was open — and it arrives as its own message rather
 * than as a state that cannot otherwise happen.
 */
function OfferingsPanel({
  voucher,
  onEditOffering,
  onAddOffering,
}: {
  voucher: MarketVoucherDetail;
  onEditOffering: (offering: Offering) => void;
  onAddOffering: () => void;
}) {
  const query = useQuery(
    voucherOfferingsQueryOptions(clcApi.offerings, voucher.address, OFFERING_PAGE_SIZE),
  );
  const state = useDataState(query, (page) => page.offerings.length === 0);

  return (
    <RecordPanel state={state} content="grid">
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionLabel>Offerings</SectionLabel>
        <Button type="button" size="sm" onClick={onAddOffering}>
          Add offering
        </Button>
      </div>
      <SectionState
        state={state}
        errorTitle="Could not load offerings"
        emptyTitle="No offerings"
        emptyDescription="Nobody is offering anything for this voucher yet."
        loadingRows={4}
      >
        {/* Thumbnails, so the density is the point: eight across from xl, which is
            where the console is actually used, and ten on a wide monitor. gap-2
            rather than gap-3 because the tiles are small enough that a wider
            gutter starts to read as the dominant element. */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
          {(query.data?.offerings ?? []).map((offering) => (
            <VoucherOfferingCard
              key={offering.id}
              offering={offering}
              onEdit={() => onEditOffering(offering)}
            />
          ))}
        </div>
      </SectionState>
    </RecordPanel>
  );
}

/**
 * Transfers, mints and burns of this voucher, newest first.
 *
 * One page only. The full table pages, filters by type and can be linked; this tab
 * is the first screenful of it, and the strip above says where the rest is.
 */
function TransactionsPanel({ address }: { address: string }) {
  const query = useQuery(
    adminVoucherTransactionsQueryOptions(clcApi.admin, {
      perPage: RECORD_PAGE_SIZE,
      voucher: address,
    }),
  );
  const state = useDataState(query, (page) => page.transactions.length === 0);

  return (
    <>
      <div className="border-border flex items-center justify-end border-b px-4 py-2.5">
        <Link
          to="/transactions/vouchers"
          search={{ perPage: DEFAULT_PAGE_SIZE, voucher: address }}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Open transactions
        </Link>
      </div>

      <RecordPanel state={state}>
        <SectionState
          state={state}
          errorTitle="Could not load transactions"
          emptyTitle="No indexed activity"
          emptyDescription="The indexer has recorded no transfer of this voucher."
          loadingRows={6}
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tx</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.transactions ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-data text-xs">{formatDateTime(row.t)}</TableCell>
                    <TableCell className="font-mono text-xs uppercase">{row.type}</TableCell>
                    <TableCell>
                      <AddressCell address={row.from} />
                    </TableCell>
                    <TableCell>
                      <AddressCell address={row.to} />
                    </TableCell>
                    <TableCell>
                      <TokenAmount amount={row.amount} decimals={row.voucherDecimals} />
                    </TableCell>
                    <TableCell>
                      {/* The same chip the transaction index pages use, rather
                          than the compact tick: this table's rows are the
                          voucher's whole indexed history, and a reverted mint is
                          what an operator opens the tab to find. */}
                      <StateBadge
                        state={row.success ? "SUCCESS" : "REVERTED"}
                        kind="voucher transaction"
                      />
                    </TableCell>
                    <TableCell>
                      <TxLink txHash={row.txHash} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionState>
      </RecordPanel>
    </>
  );
}

/**
 * Reports and pools, both reached by asking the catalog for rows that reference
 * this voucher.
 *
 * The join is `(chainId, address)`, so a voucher the catalog holds without a chain
 * cannot be asked about at all. That is said plainly rather than rendered as an
 * empty list: "no pools" and "the question could not be put" are different
 * answers, and only one of them is about the voucher.
 */
function CatalogPanel({
  tab,
  voucher,
}: {
  tab: "reports" | "pools";
  voucher: MarketVoucherDetail;
}) {
  const filter = catalogFilter(voucher);

  if (!filter) {
    return (
      <div className="p-4">
        <EmptyState
          title="Chain unknown"
          description={`The catalog holds no chain for this voucher, so it cannot be joined to ${tab}.`}
        />
      </div>
    );
  }

  return tab === "reports" ? <ReportsPanel filter={filter} /> : <PoolsPanel filter={filter} />;
}

function catalogFilter(voucher: MarketVoucherDetail): CatalogFilter | null {
  if (voucher.chainId === null) return null;
  return {
    term: "",
    tags: [],
    tagMatch: "any",
    vouchers: [{ chainId: voucher.chainId, address: voucher.address as HexAddress }],
    voucherMatch: "any",
  };
}

function ReportsPanel({ filter }: { filter: CatalogFilter }) {
  const query = useQuery(reportFilteredQueryOptions(clcApi.reports, filter, RECORD_PAGE_SIZE));
  const state = useDataState(query, (page) => page.reports.length === 0);

  return (
    <RecordPanel state={state}>
      <SectionState
        state={state}
        errorTitle="Could not load reports"
        emptyTitle="No reports"
        emptyDescription="No report in the catalog references this voucher."
        loadingRows={6}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Tags</TableHead>
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
                  <TableCell className="text-muted-foreground">
                    {report.locationName ?? "—"}
                  </TableCell>
                  <TableCell className="font-data text-xs">
                    {formatDateTime(report.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {report.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="font-mono text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </span>
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
 * The pools that allow this voucher — where it can be swapped, and on what terms.
 *
 * The swap fee is the column that makes this more than a list of names: it is what
 * a holder pays to leave the voucher, and it differs per pool.
 */
function PoolsPanel({ filter }: { filter: CatalogFilter }) {
  const query = useQuery(poolFilteredQueryOptions(clcApi.pools, filter, RECORD_PAGE_SIZE));
  const state = useDataState(query, (page) => page.pools.length === 0);

  return (
    <RecordPanel state={state}>
      <SectionState
        state={state}
        errorTitle="Could not load pools"
        emptyTitle="Not in any pool"
        emptyDescription="No pool's registry allows this voucher, so it cannot be swapped."
        loadingRows={6}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pool</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Vouchers</TableHead>
                <TableHead>Swap fee</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(query.data?.pools ?? []).map((pool) => (
                <TableRow key={pool.address}>
                  <TableCell>
                    <Link
                      to="/pools/$address"
                      params={{ address: pool.address }}
                      search={{ tab: "vouchers" }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {pool.name}
                    </Link>
                    <div className="text-muted-foreground font-mono text-xs">{pool.symbol}</div>
                  </TableCell>
                  <TableCell>
                    <PoolCell address={pool.address} />
                  </TableCell>
                  <TableCell className="font-data text-xs">{pool.voucherCount}</TableCell>
                  <TableCell className="font-data text-xs">{formatFeePpm(pool.feePpm)}</TableCell>
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
  );
}
