import { clcQueries } from "@clc/api/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
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
import { formatDateTime, formatFeePpm } from "#/lib/format";
import { useDataState } from "#/lib/use-data-state";

const VOUCHER_PAGE_SIZE = 100;

export function PoolDetailPage({ address }: { address: string }) {
  const poolQuery = useQuery(clcQueries.pool(address));
  const vouchersQuery = useQuery(clcQueries.poolVouchers(address, VOUCHER_PAGE_SIZE));
  // Every hook must run before the early returns below, or hook order changes
  // between the loading and loaded renders.
  const vouchersState = useDataState(vouchersQuery, (page) => page.vouchers.length === 0);

  if (poolQuery.isPending) return <LoadingBlock rows={8} />;
  if (poolQuery.isError) {
    return <PageState title="Could not load pool" message={errorMessage(poolQuery.error)} />;
  }

  const pool = poolQuery.data;
  const vouchers = vouchersQuery.data?.vouchers ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={
          <AppBreadcrumb items={[{ label: "Pools", to: "/pools" }, { label: pool.name }]} />
        }
        title={pool.name}
        description={pool.description}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {pool.symbol}
            </Badge>
            <StateBadge state={pool.feesDecoupled ? "internal" : "active"} kind="pool" />
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Identity">
          <Field label="Address" value={<AddressValue address={pool.address} />} />
          <Field label="Owner" value={<AddressValue address={pool.ownerAddress} />} />
          <Field
            label="Chain ID"
            value={<span className="font-data">{pool.chainId ?? "—"}</span>}
          />
          <Field
            label="Decimals"
            value={<span className="font-data">{pool.decimals ?? "—"}</span>}
          />
        </Panel>

        <Panel title="Economics">
          <Field
            label="Swap fee"
            value={<span className="font-data">{formatFeePpm(pool.feePpm)}</span>}
          />
          <Field label="Fee recipient" value={<AddressValue address={pool.feeAddress} />} />
          <Field label="Fees decoupled" value={pool.feesDecoupled ? "Yes" : "No"} />
          <Field label="Unit of account" value={pool.unitOfAccount ?? "—"} />
        </Panel>

        <Panel title="Contracts">
          <Field
            label="Token registry"
            value={<AddressValue address={pool.tokenRegistryAddress} />}
          />
          <Field label="Limiter" value={<AddressValue address={pool.limiterAddress} />} />
          <Field label="Quoter" value={<AddressValue address={pool.quoterAddress} />} />
          <Field label="Fee policy" value={<AddressValue address={pool.feePolicyAddress} />} />
        </Panel>

        <Panel title="Contact">
          <Field label="Phone" value={pool.phone ?? "—"} />
          <Field label="Email" value={pool.email ?? "—"} />
          <Field label="Website" value={pool.website ?? "—"} />
        </Panel>

        <Panel title="Location">
          <Field label="Name" value={pool.locationName ?? "—"} />
          <Field
            label="Coordinates"
            value={
              pool.geoLat !== null && pool.geoLng !== null ? (
                <span className="font-data">
                  {pool.geoLat.toFixed(5)}, {pool.geoLng.toFixed(5)}
                </span>
              ) : (
                "—"
              )
            }
          />
        </Panel>

        <Panel title="Lifecycle">
          <Field label="Created" value={formatDateTime(pool.createdAt)} />
          <Field label="Updated" value={formatDateTime(pool.updatedAt)} />
          <Field
            label="Tags"
            value={
              pool.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {pool.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="font-mono text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : (
                "—"
              )
            }
          />
        </Panel>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Vouchers ({pool.voucherCount})
        </h2>
        <SectionState
          state={vouchersState}
          errorTitle="Could not load this pool's vouchers"
          emptyTitle="No vouchers"
          emptyDescription="This pool allows no vouchers yet."
        >
          <div className="overflow-x-auto border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Offers</TableHead>
                  <TableHead>Limit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchers.map((voucher) => (
                  <TableRow key={voucher.id}>
                    <TableCell>
                      <div className="truncate font-medium">{voucher.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {voucher.symbol}
                      </div>
                    </TableCell>
                    <TableCell className="font-data text-xs">
                      {formatVoucherAddress(voucher.tokenAddress)}
                    </TableCell>
                    <TableCell>
                      <StateBadge
                        state={voucher.isAllowed ? "allowed" : "blocked"}
                        kind="voucher"
                      />
                    </TableCell>
                    <TableCell className="font-data">
                      {voucher.availableOfferCount}/{voucher.offerCount}
                    </TableCell>
                    <TableCell className="font-data text-xs">{voucher.tokenLimit ?? "—"}</TableCell>
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
