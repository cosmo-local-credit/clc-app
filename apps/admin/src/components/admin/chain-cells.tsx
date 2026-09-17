import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Link } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { HiOutlineExternalLink } from "react-icons/hi";
import { CopyButton } from "#/components/admin/copy-button";
import { addressUrl, txUrl } from "#/lib/explorer";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";
import { cn } from "#/lib/utils";

/**
 * The cells every chain-backed table shares.
 *
 * They live together because they are one visual grammar rather than four
 * unrelated components: an address, a transaction, an outcome and an amount are
 * the four things a row of chain activity is made of, and they have to agree on
 * typeface, size and colour or the row stops reading as one line.
 */

/** A click the row handler must not also act on. */
function stopRowClick(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * One participant in a transaction, linked to its account screen.
 *
 * The account screen resolves an address with no CLC account to "no account"
 * rather than to an error, which is why every address here is a link: most
 * counterparties are accounts, and the few that are contracts still land
 * somewhere that says so.
 *
 * **Where an ENS name will go.** Once names are resolvable the name replaces the
 * truncated address as the cell's first line, set in the body typeface at the
 * row's base size — the same treatment a voucher's name gets in the catalog
 * table — with the address demoted beneath it in `font-mono text-xs
 * text-muted-foreground`. Identity is prose and gets the prose typeface; the
 * address is data and keeps the data one. Until then the address is the
 * identity, so it takes `font-data` alone and there is no second line.
 */
export function AddressCell({ address }: { address: string | null }) {
  if (!address) return <Muted>—</Muted>;

  return (
    <Link
      to="/users/$address"
      params={{ address }}
      search={{ tab: "transactions", perPage: DEFAULT_PAGE_SIZE }}
      className="font-data text-xs underline-offset-4 hover:underline"
      onClick={stopRowClick}
    >
      {formatVoucherAddress(address as `0x${string}`)}
    </Link>
  );
}

/** A voucher, linked to its detail screen. Falls back to the address when the
 * local catalog has no name for it — an unnamed voucher is still a real one. */
export function VoucherCell({
  address,
  name,
  symbol,
}: {
  address: string;
  name?: string;
  symbol?: string;
}) {
  return (
    <Link
      to="/vouchers/$address"
      params={{ address }}
      search={{ tab: "transactions" }}
      className="block min-w-0 underline-offset-4 hover:underline"
      onClick={stopRowClick}
    >
      {name ? (
        <>
          <span className="block truncate font-medium">{name}</span>
          <span className="text-muted-foreground block font-mono text-xs">
            {symbol || formatVoucherAddress(address as `0x${string}`)}
          </span>
        </>
      ) : (
        <span className="font-data text-xs">{formatVoucherAddress(address as `0x${string}`)}</span>
      )}
    </Link>
  );
}

/** A pool, linked to its detail screen. */
export function PoolCell({ address }: { address: string }) {
  return (
    <Link
      to="/pools/$address"
      params={{ address }}
      search={{ tab: "vouchers" }}
      className="font-data text-xs underline-offset-4 hover:underline"
      onClick={stopRowClick}
    >
      {formatVoucherAddress(address as `0x${string}`)}
    </Link>
  );
}

/**
 * A contract this pool or voucher depends on, copyable and linked to the
 * explorer.
 *
 * Distinct from `AddressCell`, which links to an account screen: a registry, a
 * limiter or a quoter has no page in this console, so the explorer is where an
 * operator verifies one and the copy button is how it reaches a support thread.
 *
 * An absent address renders as "Not recorded" rather than as a zero address or a
 * dash. The catalog merges rows from sources that carry no dependency addresses
 * at all, and on SwapPool an unset pointer is not inert — an unset registry
 * accepts every token, an unset limiter caps nothing — so a missing catalog
 * value must not be presented as a chain fact.
 */
export function ContractAddress({ address, label }: { address: string | null; label: string }) {
  if (!address) {
    return <span className="text-muted-foreground font-mono text-xs">Not recorded</span>;
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <a
        href={addressUrl(address)}
        target="_blank"
        rel="noreferrer"
        onClick={stopRowClick}
        className="font-data truncate text-xs underline-offset-4 hover:underline"
      >
        {formatVoucherAddress(address as `0x${string}`)}
      </a>
      <CopyButton value={address} label={label} />
    </span>
  );
}

/**
 * The transaction hash, opening the block explorer.
 *
 * The hash is kept rather than replaced with a bare icon: an operator reads a
 * hash off the screen into a support thread as often as they click it, and a
 * row where every identifier is truncated hex reads consistently. The external
 * glyph says the link leaves the console.
 */
export function TxLink({ txHash }: { txHash: string }) {
  return (
    <a
      href={txUrl(txHash)}
      target="_blank"
      rel="noreferrer"
      onClick={stopRowClick}
      className="font-data inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
    >
      {formatVoucherAddress(txHash as `0x${string}`)}
      <HiOutlineExternalLink className="size-3 shrink-0 opacity-60" aria-hidden="true" />
      <span className="sr-only">on the block explorer</span>
    </a>
  );
}

/**
 * A raw on-chain integer, scaled by its voucher's decimals.
 *
 * Two cases the console must not paper over:
 *
 * - **Unknown decimals.** The local catalog is the metadata home, and it does
 *   not know every contract the indexer sees. Scaling by an assumed zero would
 *   render a six-decimal amount a million times too large, so the raw integer is
 *   shown as raw and labelled.
 * - **An amount that rounds away.** A pool fee is routinely smaller than the two
 *   decimals the rest of the console shows. Printing a real fee as `0` is the one
 *   output worse than a long number, so a non-zero amount always keeps at least
 *   one significant digit.
 */
export function TokenAmount({
  amount,
  decimals,
  symbol,
  className,
}: {
  amount: string | null;
  decimals: number | null;
  /** Shown beneath the figure. Omit where the column already names the voucher. */
  symbol?: string;
  className?: string;
}) {
  if (amount === null) return <Muted>—</Muted>;

  if (decimals === null) {
    return (
      <span
        className={cn("font-data text-xs", className)}
        title="This voucher is not in the catalog, so its decimals are unknown. Shown as the raw on-chain integer."
      >
        {amount}
        <span className="text-muted-foreground ml-1 font-mono text-[0.625rem] tracking-wide uppercase">
          raw
        </span>
      </span>
    );
  }

  const rounded = formatTokenAmount(amount, decimals);
  const value =
    rounded === "0" && amount !== "0" ? formatTokenAmount(amount, decimals, decimals) : rounded;

  return (
    <span className={cn("block", className)}>
      <span className="font-data block text-xs">{value}</span>
      {symbol ? (
        <span className="text-muted-foreground block font-mono text-xs">{symbol}</span>
      ) : null}
    </span>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
