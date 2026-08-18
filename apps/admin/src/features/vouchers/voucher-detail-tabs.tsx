import { adminVoucherTransactionsQueryOptions } from "@clc/api/features/admin/queries";
import type { Offering } from "@clc/api/features/offerings/client";
import { voucherOfferingsQueryOptions } from "@clc/api/features/offerings/queries";
import { poolFilteredQueryOptions } from "@clc/api/features/pools/queries";
import { reportFilteredQueryOptions } from "@clc/api/features/reports/queries";
import type { CatalogFilter, HexAddress } from "@clc/core/features/catalog/logic";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { formatOfferingPrice, formatOfferingQuantity } from "@clc/core/features/market/logic";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { AddressCell, TokenAmount, TxLink, TxOutcome } from "#/components/admin/chain-cells";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageState } from "#/components/admin/page-state";
import { formatDateTime, formatFeePpm } from "#/lib/format";
import { useDataState } from "#/lib/use-data-state";
import { clcApi } from "#/lib/api";
import type { VoucherDetailTab } from "./voucher-detail-search";

const PAGE_SIZE = 25;

export function VoucherTabPanel({
  tab,
  address,
  chainId,
  onEditOffering,
}: {
  tab: VoucherDetailTab;
  address: string;
  chainId: number | null;
  onEditOffering: (offering: Offering) => void;
}) {
  if (tab === "offerings") {
    return <OfferingsPanel address={address} onEditOffering={onEditOffering} />;
  }
  if (tab === "transactions") {
    return <TransactionsPanel address={address} />;
  }
  const filter = voucherCatalogFilter(chainId, address);
  if (!filter) {
    return (
      <p className="border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Chain is unknown, so this voucher cannot be joined to {tab}.
      </p>
    );
  }
  if (tab === "reports") return <ReportsPanel filter={filter} />;
  return <PoolsPanel filter={filter} />;
}

function voucherCatalogFilter(chainId: number | null, address: string): CatalogFilter | null {
  if (chainId === null || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  return {
    term: "",
    tags: [],
    tagMatch: "any",
    vouchers: [{ chainId, address: address as HexAddress }],
    voucherMatch: "any",
  };
}

function OfferingsPanel({
  address,
  onEditOffering,
}: {
  address: string;
  onEditOffering: (offering: Offering) => void;
}) {
  const query = useQuery(voucherOfferingsQueryOptions(clcApi.offerings, address, 100));
  const state = useDataState(query, (page) => page.offerings.length === 0);
  const offerings = query.data?.offerings ?? [];

  if (state.kind === "pending") return <LoadingBlock rows={4} />;
  if (state.kind === "error") {
    return <PageState title="Could not load offerings" message={state.message} />;
  }
  if (state.kind === "empty") {
    return (
      <p className="border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        No offerings
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {offerings.map((offering) => (
        <OfferingCard
          key={offering.id}
          offering={offering}
          onEdit={() => onEditOffering(offering)}
        />
      ))}
    </div>
  );
}

function TransactionsPanel({ address }: { address: string }) {
  const query = useQuery(
    adminVoucherTransactionsQueryOptions(clcApi.admin, { perPage: PAGE_SIZE, voucher: address }),
  );
  const state = useDataState(query, (page) => page.transactions.length === 0);
  const rows = query.data?.transactions ?? [];

  if (state.kind === "pending") return <LoadingBlock rows={6} />;
  if (state.kind === "error") {
    return <PageState title="Could not load transactions" message={state.message} />;
  }
  if (state.kind === "empty") {
    return (
      <p className="border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        No transactions
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        {/* One page only. The full table pages, filters by type and can be
            linked; this tab is the first screenful of it. */}
        <Link
          to="/transactions/vouchers"
          search={{ perPage: PAGE_SIZE, voucher: address }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Open in transactions
        </Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Tx</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-data text-xs">{formatDateTime(row.t)}</TableCell>
              <TableCell className="font-mono text-xs uppercase">{row.type}</TableCell>
              <TableCell>
                <AddressCell address={row.from} />
              </TableCell>
              <TableCell>
                <AddressCell address={row.to} />
              </TableCell>
              <TableCell className="text-right">
                <TokenAmount amount={row.amount} decimals={row.voucherDecimals} />
              </TableCell>
              <TableCell>
                <TxOutcome success={row.success} />
              </TableCell>
              <TableCell>
                <TxLink txHash={row.txHash} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ReportsPanel({ filter }: { filter: CatalogFilter }) {
  const query = useQuery(reportFilteredQueryOptions(clcApi.reports, filter, PAGE_SIZE));
  const state = useDataState(query, (page) => page.reports.length === 0);
  const reports = query.data?.reports ?? [];

  if (state.kind === "pending") return <LoadingBlock rows={6} />;
  if (state.kind === "error") {
    return <PageState title="Could not load reports" message={state.message} />;
  }
  if (state.kind === "empty") {
    return (
      <p className="border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        No reports
      </p>
    );
  }

  return (
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
        {reports.map((report) => (
          <TableRow key={report.id}>
            <TableCell>
              <div className="truncate font-medium">{report.title}</div>
              {report.description ? (
                <div className="truncate text-xs text-muted-foreground">{report.description}</div>
              ) : null}
            </TableCell>
            <TableCell className="text-muted-foreground">{report.locationName ?? "—"}</TableCell>
            <TableCell className="font-data text-xs">{formatDateTime(report.updatedAt)}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {report.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="font-mono text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PoolsPanel({ filter }: { filter: CatalogFilter }) {
  const query = useQuery(poolFilteredQueryOptions(clcApi.pools, filter, PAGE_SIZE));
  const state = useDataState(query, (page) => page.pools.length === 0);
  const pools = query.data?.pools ?? [];

  if (state.kind === "pending") return <LoadingBlock rows={6} />;
  if (state.kind === "error") {
    return <PageState title="Could not load pools" message={state.message} />;
  }
  if (state.kind === "empty") {
    return (
      <p className="border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Not in any pool
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pool</TableHead>
          <TableHead>Address</TableHead>
          <TableHead>Vouchers</TableHead>
          <TableHead>Swap fee</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pools.map((pool) => (
          <TableRow key={pool.address}>
            <TableCell>
              <Link
                to="/pools/$address"
                params={{ address: pool.address }}
                className="font-medium underline-offset-4 hover:underline"
              >
                {pool.name}
              </Link>
              <div className="font-mono text-xs text-muted-foreground">{pool.symbol}</div>
            </TableCell>
            <TableCell className="font-data text-xs">
              {formatVoucherAddress(pool.address)}
            </TableCell>
            <TableCell className="font-data">{pool.voucherCount}</TableCell>
            <TableCell className="font-data text-xs">{formatFeePpm(pool.feePpm)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OfferingCard({ offering, onEdit }: { offering: Offering; onEdit: () => void }) {
  const quantity = formatOfferingQuantity(offering.quantity, offering.unit);
  const price = formatOfferingPrice(offering.price);

  return (
    <Card size="sm">
      <div className="-mt-(--card-spacing) aspect-square bg-muted">
        {offering.imageUrl ? (
          <img
            src={offering.imageUrl}
            alt={offering.commodityName}
            className="size-full object-cover"
          />
        ) : null}
      </div>
      <CardHeader>
        <CardTitle className="truncate">{offering.commodityName}</CardTitle>
        <CardDescription className="font-mono uppercase">{offering.commodityType}</CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-xs" aria-label="Offering actions" />}
            >
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem>Delist</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Quantity</span>
          <span className="font-data text-xs">
            {quantity ? [quantity.value, quantity.unit].filter(Boolean).join(" ") : "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Price</span>
          <span className="font-data text-xs">{price?.value ?? "—"}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Seller</span>
          <span className="font-data text-xs">{formatVoucherAddress(offering.sellerAddress)}</span>
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <Badge variant="outline" className="font-mono uppercase">
          {offering.available ? "listed" : "delisted"}
        </Badge>
        <Button type="button" variant="ghost" size="xs" onClick={onEdit}>
          Edit
        </Button>
      </CardFooter>
    </Card>
  );
}
