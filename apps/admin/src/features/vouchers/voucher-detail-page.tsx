/* Hallmark · redesign · genre: modern-minimal · macrostructure: Workbench
 * theme: Lyra (admin tokens) · designed-as-app · shadcn only
 * Pre-emit: P4 H4 E4 S4 R4 V4
 */
import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import type { Offering } from "@clc/api/features/offerings/client";
import { voucherQueryOptions } from "@clc/api/features/market/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { CopyButton } from "#/components/admin/copy-button";
import { Tabs, TabsList, TabsTab } from "#/components/ui/tabs";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { Textarea } from "#/components/ui/textarea";
import { copyText } from "#/lib/copy";
import { errorMessage } from "#/lib/data-state";
import { useDataState } from "#/lib/use-data-state";
import { clcApi } from "#/lib/api";
import {
  type VoucherDetailTab,
  VOUCHER_DETAIL_TABS,
  type VoucherDetailSearch,
} from "./voucher-detail-search";
import { VoucherTabPanel } from "./voucher-detail-tabs";

type Editor = { kind: "voucher" } | { kind: "offering"; offering: Offering } | null;

const VOUCHER_TAB_LABELS: Record<VoucherDetailTab, string> = {
  offerings: "Offerings",
  transactions: "Transactions",
  reports: "Reports",
  pools: "Pools",
};

export function VoucherDetailPage({
  address,
  search,
}: {
  address: string;
  search: VoucherDetailSearch;
}) {
  const navigate = useNavigate();
  const voucherQuery = useQuery(voucherQueryOptions(clcApi.market, address));
  const voucherState = useDataState(voucherQuery, () => false);
  const [editor, setEditor] = useState<Editor>(null);

  if (voucherState.kind === "pending") return <LoadingBlock rows={8} />;

  const voucher = voucherQuery.data;
  if (!voucher) {
    return (
      <PageState
        title="Could not load voucher"
        message={
          voucherState.kind === "error" ? voucherState.message : errorMessage(voucherQuery.error)
        }
      />
    );
  }

  const facts: Array<{ label: string; value: ReactNode }> = [
    { label: "Owner", value: <MonoCopy value={voucher.ownerAddress} /> },
    { label: "Chain", value: <span className="font-data">{voucher.chainId ?? "—"}</span> },
    { label: "Decimals", value: <span className="font-data">{voucher.decimals ?? "—"}</span> },
    { label: "Unit", value: voucher.voucherUoa ?? "—" },
    { label: "Value", value: <span className="font-data">{voucher.voucherValue ?? "—"}</span> },
    { label: "Location", value: voucher.locationName ?? "—" },
    {
      label: "Coordinates",
      value:
        voucher.lat !== null && voucher.lng !== null ? (
          <span className="font-data">
            {voucher.lat.toFixed(5)}, {voucher.lng.toFixed(5)}
          </span>
        ) : (
          "—"
        ),
    },
    { label: "Phone", value: voucher.phone ?? "—" },
    { label: "Email", value: voucher.email ?? "—" },
    { label: "Website", value: <ExternalHref href={voucher.website} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      {voucherState.kind === "stale" ? <StaleNotice message={voucherState.message} /> : null}

      <AppBreadcrumb items={[{ label: "Vouchers", to: "/vouchers" }, { label: voucher.name }]} />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {voucher.iconUrl ? (
            <img
              src={voucher.iconUrl}
              alt=""
              className="size-12 shrink-0 border border-border bg-card object-cover"
            />
          ) : null}
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">{voucher.name}</h1>
              <Badge variant="outline" className="font-mono">
                {voucher.symbol}
              </Badge>
              <Badge variant="outline" className="font-mono uppercase">
                {voucher.kind}
              </Badge>
            </div>
            <MonoCopy value={voucher.address} full />
            {voucher.description ? (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {voucher.description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" onClick={() => setEditor({ kind: "voucher" })}>
            Edit
          </Button>
          <Button type="button" variant="outline">
            List
          </Button>
          <Button type="button" variant="outline">
            Delist
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" aria-label="More actions" />}>
              More
              <ChevronDownIcon className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem onClick={() => void copyText(voucher.address, "Copy address")}>
                Copy address
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">Archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <section className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0 space-y-1">
            <div className="font-mono text-[0.6875rem] tracking-[0.14em] text-muted-foreground uppercase">
              {fact.label}
            </div>
            <div className="text-sm">{fact.value}</div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={search.tab}
            aria-label="Voucher records"
            onValueChange={(next) => {
              if (next === search.tab) return;
              void navigate({
                to: "/vouchers/$address",
                params: { address },
                search: { tab: next },
              });
            }}
          >
            <TabsList>
              {VOUCHER_DETAIL_TABS.map((tab) => (
                <TabsTab
                  key={tab}
                  value={tab}
                  nativeButton={false}
                  render={
                    <Link
                      to="/vouchers/$address"
                      params={{ address }}
                      search={{ tab }}
                      aria-current={tab === search.tab ? "page" : undefined}
                      onClick={(event) => {
                        if (
                          event.button === 0 &&
                          !event.metaKey &&
                          !event.ctrlKey &&
                          !event.shiftKey
                        ) {
                          event.preventDefault();
                        }
                      }}
                    />
                  }
                >
                  {VOUCHER_TAB_LABELS[tab]}
                </TabsTab>
              ))}
            </TabsList>
          </Tabs>
          {search.tab === "offerings" ? (
            <Button type="button" variant="outline" size="sm">
              Add offering
            </Button>
          ) : null}
        </div>
        <VoucherTabPanel
          tab={search.tab}
          address={address}
          chainId={voucher.chainId}
          onEditOffering={(offering) => setEditor({ kind: "offering", offering })}
        />
      </section>

      <EditorSheet editor={editor} voucher={voucher} onClose={() => setEditor(null)} />
    </div>
  );
}

function EditorSheet({
  editor,
  voucher,
  onClose,
}: {
  editor: Editor;
  voucher: MarketVoucherDetail;
  onClose: () => void;
}) {
  const offering = editor?.kind === "offering" ? editor.offering : null;

  return (
    <Sheet
      open={editor !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-lg" showCloseButton>
        <SheetHeader className="border-b">
          <SheetTitle>{offering ? "Edit offering" : "Edit voucher"}</SheetTitle>
          <SheetDescription>{offering ? offering.commodityName : voucher.name}</SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <div className="grid flex-1 gap-4 overflow-y-auto p-4">
            {offering ? (
              <OfferingFields offering={offering} />
            ) : (
              <VoucherFields voucher={voucher} />
            )}
          </div>
          <SheetFooter className="flex-row justify-end border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function VoucherFields({ voucher }: { voucher: MarketVoucherDetail }) {
  return (
    <>
      <Field id="voucher-name" label="Name" defaultValue={voucher.name} />
      <div className="grid grid-cols-2 gap-3">
        <Field id="voucher-symbol" label="Symbol" defaultValue={voucher.symbol} />
        <Field id="voucher-kind" label="Kind" defaultValue={voucher.kind} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="voucher-description">Description</Label>
        <Textarea
          id="voucher-description"
          name="description"
          defaultValue={voucher.description ?? ""}
          className="rounded-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="voucher-uoa" label="Unit" defaultValue={voucher.voucherUoa ?? ""} />
        <Field id="voucher-value" label="Value" defaultValue={voucher.voucherValue ?? ""} />
      </div>
      <Field id="voucher-location" label="Location" defaultValue={voucher.locationName ?? ""} />
      <Field id="voucher-phone" label="Phone" defaultValue={voucher.phone ?? ""} />
      <Field id="voucher-email" label="Email" defaultValue={voucher.email ?? ""} />
      <Field id="voucher-website" label="Website" defaultValue={voucher.website ?? ""} />
    </>
  );
}

function OfferingFields({ offering }: { offering: Offering }) {
  return (
    <>
      <Field id="offering-name" label="Commodity" defaultValue={offering.commodityName} />
      <Field id="offering-type" label="Type" defaultValue={offering.commodityType} />
      <div className="grid gap-1.5">
        <Label htmlFor="offering-description">Description</Label>
        <Textarea
          id="offering-description"
          name="description"
          defaultValue={offering.description}
          className="rounded-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="offering-quantity" label="Quantity" defaultValue={offering.quantity} />
        <Field id="offering-unit" label="Unit" defaultValue={offering.unit ?? ""} />
      </div>
      <Field id="offering-price" label="Price" defaultValue={offering.price ?? ""} />
    </>
  );
}

function Field({ id, label, defaultValue }: { id: string; label: string; defaultValue: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} defaultValue={defaultValue} />
    </div>
  );
}

function MonoCopy({ value, full = false }: { value: string | null; full?: boolean }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className={full ? "font-data text-xs break-all" : "font-data text-xs"}>
        {full ? value : formatVoucherAddress(value as `0x${string}`)}
      </span>
      <CopyButton value={value} label="Copy" />
    </span>
  );
}

function ExternalHref({ href }: { href: string | null }) {
  if (!href) return <span className="text-muted-foreground">—</span>;
  return (
    <Button
      variant="link"
      size="xs"
      className="h-auto px-0"
      render={<a href={href} target="_blank" rel="noreferrer" />}
    >
      {href.replace(/^https?:\/\//, "")}
    </Button>
  );
}
