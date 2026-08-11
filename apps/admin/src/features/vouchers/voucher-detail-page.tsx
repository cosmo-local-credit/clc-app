import { clcQueries } from "@clc/api/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { formatOfferingPrice, formatOfferingQuantity } from "@clc/core/features/market/logic";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { CopyButton } from "#/components/admin/copy-button";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { SectionState } from "#/components/admin/section-state";
import { StateBadge } from "#/components/admin/state-badge";
import { Badge } from "#/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { errorMessage } from "#/lib/data-state";
import { useDataState } from "#/lib/use-data-state";

const OFFERING_PAGE_SIZE = 100;

export function VoucherDetailPage({ address }: { address: string }) {
  const voucherQuery = useQuery(clcQueries.voucher(address));
  const offeringsQuery = useQuery(clcQueries.voucherOfferings(address, OFFERING_PAGE_SIZE));
  // Every hook must run before the early returns below, or hook order changes
  // between the loading and loaded renders.
  const offeringsState = useDataState(offeringsQuery, (page) => page.offerings.length === 0);

  if (voucherQuery.isPending) return <LoadingBlock rows={8} />;
  if (voucherQuery.isError) {
    return <PageState title="Could not load voucher" message={errorMessage(voucherQuery.error)} />;
  }

  const voucher = voucherQuery.data;
  const offerings = offeringsQuery.data?.offerings ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={
          <AppBreadcrumb
            items={[{ label: "Vouchers", to: "/vouchers" }, { label: voucher.name }]}
          />
        }
        title={voucher.name}
        description={voucher.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {voucher.symbol}
            </Badge>
            <Badge variant="outline" className="font-mono uppercase">
              {voucher.kind}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Identity">
          <Field label="Address" value={<AddressValue address={voucher.address} />} />
          <Field label="Owner" value={<AddressValue address={voucher.ownerAddress} />} />
          <Field
            label="Chain ID"
            value={<span className="font-data">{voucher.chainId ?? "—"}</span>}
          />
          <Field
            label="Decimals"
            value={<span className="font-data">{voucher.decimals ?? "—"}</span>}
          />
        </Panel>

        <Panel title="Valuation">
          <Field label="Unit of account" value={voucher.voucherUoa ?? "—"} />
          <Field
            label="Value"
            value={<span className="font-data">{voucher.voucherValue ?? "—"}</span>}
          />
        </Panel>

        <Panel title="Contact">
          <Field label="Phone" value={voucher.phone ?? "—"} />
          <Field label="Email" value={voucher.email ?? "—"} />
          <Field label="Website" value={voucher.website ?? "—"} />
        </Panel>

        <Panel title="Location">
          <Field label="Name" value={voucher.locationName ?? "—"} />
          <Field
            label="Coordinates"
            value={
              voucher.lat !== null && voucher.lng !== null ? (
                <span className="font-data">
                  {voucher.lat.toFixed(5)}, {voucher.lng.toFixed(5)}
                </span>
              ) : (
                "—"
              )
            }
          />
        </Panel>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Offerings ({offerings.length})
        </h2>
        <SectionState
          state={offeringsState}
          errorTitle="Could not load this voucher's offerings"
          emptyTitle="No offerings"
          emptyDescription="Nothing is listed against this voucher."
        >
          <div className="overflow-x-auto border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Commodity</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offerings.map((offering) => {
                  const quantity = formatOfferingQuantity(offering.quantity, offering.unit);
                  const price = formatOfferingPrice(offering.price);
                  return (
                    <TableRow key={offering.id}>
                      <TableCell>
                        <div className="truncate font-medium">{offering.commodityName}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {offering.commodityType}
                        </div>
                      </TableCell>
                      <TableCell className="font-data text-xs">
                        {formatVoucherAddress(offering.sellerAddress)}
                      </TableCell>
                      <TableCell className="font-data text-xs">
                        {quantity ? [quantity.value, quantity.unit].filter(Boolean).join(" ") : "—"}
                      </TableCell>
                      <TableCell className="font-data text-xs">{price?.value ?? "—"}</TableCell>
                      <TableCell>
                        <StateBadge
                          state={offering.available ? "active" : "inactive"}
                          kind="offering"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </SectionState>
      </section>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border border-border bg-card p-4">
      <h2 className="mb-3 font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h2>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{value}</dd>
    </div>
  );
}

function AddressValue({ address }: { address: string | null }) {
  if (!address) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-data text-xs">{formatVoucherAddress(address as `0x${string}`)}</span>
      <CopyButton value={address} label="Copy address" />
    </span>
  );
}
