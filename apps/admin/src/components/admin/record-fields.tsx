import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Link } from "@tanstack/react-router";
import { type ReactNode, Suspense } from "react";
import { HiOutlineExternalLink } from "react-icons/hi";

import { CopyButton } from "#/components/admin/copy-button";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { Skeleton } from "#/components/ui/skeleton";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";
import { cn } from "#/lib/utils";

/**
 * The grammar every detail screen's record card is written in.
 *
 * A record card is a set of `<dl>` columns grouped by who owns each fact — the
 * catalog, the chain, the steward — and the position of a row is what says which.
 * That only works if every row in every column reads identically, so the row and
 * its three value treatments live here rather than being redeclared per screen:
 * the pool, account and voucher cards were three copies of the same four
 * components, drifting a padding and a type size apart at a time.
 *
 * Deliberately separate from `chain-cells`, which is the grammar of a *table*
 * row. A cell is one of many in a column of the same thing; a record row is one
 * of a kind, so it carries its own label and its value is right-aligned against
 * the card's edge instead of the column's.
 */

/**
 * One record row.
 *
 * The label never shrinks and the value never wraps: a value that outgrows its
 * half truncates, which keeps every row one line tall. A card where one row runs
 * to three lines because somebody entered a long URL stops being scannable.
 *
 * The height is fixed rather than left to the content. Values are a mix of body
 * text, small mono and badges, whose line boxes differ by a few pixels each —
 * enough that by the seventh row two columns' rules no longer meet.
 */
export function RecordRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-border flex h-10 items-center justify-between gap-3 border-b last:border-b-0">
      <dt className="text-muted-foreground shrink-0 text-sm">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end gap-1 text-sm">{children}</dd>
    </div>
  );
}

/** A figure or an identifier: mono and tabular, so a column of them lines up. */
export function RecordData({ children }: { children: ReactNode }) {
  return <span className="font-data truncate text-xs">{children}</span>;
}

/**
 * An absent value, in the same small mono `ContractAddress` uses for a pointer
 * the catalog never recorded — so every gap in a card looks like a gap rather
 * than like a record whose email is the word "None".
 */
export function RecordAbsent({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground font-mono text-xs">{children}</span>;
}

/**
 * A steward-supplied link. The scheme is stripped because it is noise at this
 * width, and the glyph says the link leaves the console — the grammar `TxLink`
 * already uses.
 */
export function RecordExternalLink({ href }: { href: string | null }) {
  if (!href) return <RecordAbsent>None</RecordAbsent>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-w-0 items-center gap-1 underline-offset-4 hover:underline"
    >
      <span className="truncate">{href.replace(/^https?:\/\//, "")}</span>
      <HiOutlineExternalLink className="size-3 shrink-0 opacity-60" aria-hidden="true" />
    </a>
  );
}

/**
 * The record's owner, linked to their account screen.
 *
 * An owner is an account this console has a page for, so it links there rather
 * than to the explorer the dependency contracts use — those have no page, and an
 * address that can go somewhere useful should go to the more useful of the two.
 */
export function RecordOwner({ address }: { address: string | null }) {
  if (!address) return <RecordAbsent>Not recorded</RecordAbsent>;

  return (
    <>
      <Link
        to="/users/$address"
        params={{ address }}
        search={{ tab: "transactions", perPage: DEFAULT_PAGE_SIZE }}
        className="font-data truncate text-xs underline-offset-4 hover:underline"
      >
        {formatVoucherAddress(address as `0x${string}`)}
      </Link>
      <CopyButton value={address} label="Copy owner address" />
    </>
  );
}

/**
 * Where a record says it operates: the read-only half of a record card's map
 * column.
 *
 * The map takes whatever height the rows beside it settle on rather than a fixed
 * one, so the card is as tall as its longest column and no taller.
 *
 * Renders nothing when the catalog holds neither coordinates nor a place name. An
 * empty frame suggests a location that failed to load rather than one nobody
 * recorded.
 *
 * The account card does not use this: its map is an input, and a pin that can be
 * moved needs the save control and the geocoder state that go with it.
 */
export function RecordLocation({
  point,
  name,
  className,
}: {
  point: { lat: number; lng: number } | null;
  name: string | null;
  className?: string;
}) {
  if (!point && !name) return null;

  return (
    <div className={cn("flex min-h-40 flex-col gap-2", className)}>
      {point ? (
        <Suspense fallback={<Skeleton className="min-h-32 flex-1" />}>
          <div className="min-h-32 flex-1">
            <LocationMap lat={point.lat} lng={point.lng} className="h-full" />
          </div>
        </Suspense>
      ) : null}

      {name ? <p className="truncate text-sm">{name}</p> : null}

      {point ? (
        <p className="font-data text-muted-foreground text-xs">
          {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
        </p>
      ) : null}
    </div>
  );
}
