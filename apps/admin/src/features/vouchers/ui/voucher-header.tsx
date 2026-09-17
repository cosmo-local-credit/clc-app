import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { Link } from "@tanstack/react-router";
import { HiOutlineExternalLink, HiOutlinePencil, HiOutlineSwitchHorizontal } from "react-icons/hi";

import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { CopyButton } from "#/components/admin/copy-button";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import { chainLabel, addressUrl } from "#/lib/explorer";
import { initials } from "#/lib/format";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";
import { cn } from "#/lib/utils";

/**
 * Identity on the left, the places an operator leaves for on the right — the same
 * shape as the pool and account headers, because a console where each detail
 * screen arranges its own identity block makes an operator re-learn where the
 * address is on every navigation.
 *
 * The full address lives here and only here. A second copy in the record card
 * below is one more thing to keep in step, and it is the fact an operator reads
 * off the screen most often, so it belongs beside the name.
 *
 * The chain badge is not decoration. A staging console points at Alfajores and
 * every address on the screen resolves somewhere different there, so the network
 * belongs beside the voucher's id rather than being inferred from an explorer link
 * nobody has clicked yet.
 *
 * The description sits with the identity rather than in the record: it is prose a
 * steward wrote about what this voucher is for, and the record card's rows are one
 * line tall by design.
 */
export function VoucherHeader({
  voucher,
  onEdit,
}: {
  voucher: MarketVoucherDetail;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb items={[{ label: "Vouchers", to: "/vouchers" }, { label: voucher.name }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="border-border size-16 shrink-0 border">
            {voucher.iconUrl ? <AvatarImage src={voucher.iconUrl} alt="" /> : null}
            <AvatarFallback className="font-heading text-xl">
              {initials(voucher.name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="min-w-0 break-words">{voucher.name}</h1>

            <div className="flex items-center gap-1">
              <span className="font-data text-muted-foreground text-xs break-all">
                {voucher.address}
              </span>
              <CopyButton value={voucher.address} label="Copy voucher address" />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Badge variant="outline" className="font-mono text-xs uppercase">
                {voucher.symbol}
              </Badge>
              <Badge variant="outline" className="font-mono text-xs uppercase">
                {voucher.kind}
              </Badge>
              {voucher.chainId !== null ? (
                <Badge variant="outline" className="font-data text-xs">
                  {chainLabel(voucher.chainId)} · {voucher.chainId}
                </Badge>
              ) : null}
              <Badge variant="outline" className="font-data text-xs">
                ID {voucher.id}
              </Badge>
            </div>

            {voucher.description ? (
              <p className="text-muted-foreground max-w-2xl pt-0.5 text-sm leading-relaxed">
                {voucher.description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href={addressUrl(voucher.address)}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <HiOutlineExternalLink />
            Explorer
          </a>
          <Link
            to="/transactions/vouchers"
            search={{ perPage: DEFAULT_PAGE_SIZE, voucher: voucher.address }}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <HiOutlineSwitchHorizontal />
            Transactions
          </Link>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <HiOutlinePencil />
            Edit metadata
          </Button>
        </div>
      </div>
    </div>
  );
}
