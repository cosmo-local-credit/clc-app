import type { UserPool } from "@clc/api/features/pools/client";
import { Link } from "@tanstack/react-router";
import { HiOutlineExternalLink, HiOutlinePlus, HiOutlineSwitchHorizontal } from "react-icons/hi";

import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { CopyButton } from "#/components/admin/copy-button";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import { chainLabel, explorerAddressUrl } from "#/lib/explorer";
import { formatDateTime } from "#/lib/format";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";

/**
 * Identity on the left, the two places an operator leaves for on the right.
 *
 * The full address lives here and only here, the same way the account header
 * owns the wallet address: a second copy in a metadata strip is one more thing
 * to keep in step.
 *
 * The chain badge is not decoration. A staging console points at Alfajores and
 * every address on the screen resolves somewhere different there, so the network
 * belongs beside the pool's id rather than being inferred from the explorer link
 * an operator has not clicked yet.
 *
 * Adding a voucher is the one thing an operator does *to* a pool from this
 * console, so it is the header's only filled button. It sits beside the two
 * read-only jumps rather than inside the vouchers tab: it is the screen's
 * purpose, not a property of the table.
 */
export function PoolHeader({ pool, onAddVoucher }: { pool: UserPool; onAddVoucher: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb items={[{ label: "Pools", to: "/pools" }, { label: pool.name }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="border-border size-16 shrink-0 border">
            {pool.imageUrl ? <AvatarImage src={pool.imageUrl} alt="" /> : null}
            <AvatarFallback className="font-heading text-xl">{initials(pool.name)}</AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="min-w-0 break-words">{pool.name}</h1>

            <div className="flex items-center gap-1">
              <span className="font-data text-muted-foreground text-xs break-all">
                {pool.address}
              </span>
              <CopyButton value={pool.address} label="Copy pool address" />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Badge variant="outline" className="font-mono text-xs uppercase">
                {pool.symbol}
              </Badge>
              {pool.chainId !== null ? (
                <Badge variant="outline" className="font-data text-xs">
                  {chainLabel(pool.chainId)} · {pool.chainId}
                </Badge>
              ) : null}
              <Badge variant="outline" className="font-data text-xs">
                ID {pool.id}
              </Badge>
              <span className="font-data text-muted-foreground text-xs">
                {pool.voucherCount} {pool.voucherCount === 1 ? "voucher" : "vouchers"}
              </span>
              <span className="font-data text-muted-foreground text-xs">
                {pool.updatedAt ? `Updated ${formatDateTime(pool.updatedAt)}` : "Updated —"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href={explorerAddressUrl(pool.address)}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <HiOutlineExternalLink />
            Explorer
          </a>
          <Link
            to="/transactions/pools"
            search={{ perPage: DEFAULT_PAGE_SIZE, pool: pool.address }}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <HiOutlineSwitchHorizontal />
            Transactions
          </Link>
          <Button size="sm" onClick={onAddVoucher}>
            <HiOutlinePlus />
            Add voucher
          </Button>
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.slice(0, 2).map((part) => part[0] ?? "");
  return letters.join("").toUpperCase();
}
