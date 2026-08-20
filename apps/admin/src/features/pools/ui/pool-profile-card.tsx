import type { UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Link } from "@tanstack/react-router";
import { type ReactNode, Suspense } from "react";
import { HiOutlineExternalLink } from "react-icons/hi";

import { ContractAddress } from "#/components/admin/chain-cells";
import { CopyButton } from "#/components/admin/copy-button";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent } from "#/components/ui/card";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { Skeleton } from "#/components/ui/skeleton";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";
import { poolDependencies } from "../pool-posture";

/**
 * The pool's record, split by who owns each fact.
 *
 * **Left: the catalog's.** Contact details and tags — off-chain metadata a
 * steward maintains, none of which any contract reads.
 *
 * **Middle: the chain's.** Owner, fee accounting and the contracts SwapPool
 * delegates to. `feesDecoupled` is written at `initialize` and has no setter at
 * all; the rest is owner-only and, once the matching seal bit is set, permanent.
 *
 * **Right: where it says it operates**, which is metadata too but is read by
 * looking rather than by reading, so it gets the space a map needs instead of a
 * row.
 *
 * That split is the card's only organising idea, which is why nothing here is
 * labelled. An operator asking "can I change this?" answers it from which column
 * the row is in, and a heading naming the columns would say in two words what
 * the position already says.
 *
 * Nothing repeats the header: name, symbol, address, chain and voucher count all
 * live up there, and the default fee is a tile in the column beside this one.
 */
export function PoolProfileCard({ pool }: { pool: UserPool }) {
  return (
    <Card className="h-full">
      {/* The chain column is the widest of the three by design: it carries the
          longest labels next to values that must not truncate. A clipped
          address is unreadable in a way a clipped email is not. */}
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(8rem,0.7fr)]">
        <dl className="flex flex-col">
          <Row label="Email">
            {pool.email ? <span className="truncate">{pool.email}</span> : <Absent>None</Absent>}
          </Row>
          <Row label="Phone">{pool.phone ? <Data>{pool.phone}</Data> : <Absent>None</Absent>}</Row>
          <Row label="Website">
            <ExternalHref href={pool.website} />
          </Row>
          <Row label="Terms">
            <ExternalHref href={pool.terms} />
          </Row>
          <Row label="Tags">
            {pool.tags.length > 0 ? (
              <span className="flex flex-wrap justify-end gap-1">
                {pool.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="font-mono text-xs">
                    {tag}
                  </Badge>
                ))}
              </span>
            ) : (
              <Absent>None</Absent>
            )}
          </Row>
        </dl>

        <dl className="flex flex-col">
          <Row label="Owner">
            <OwnerValue address={pool.ownerAddress} />
          </Row>
          {/* Whether a token balance is liquidity or a fee owed to the recipient. */}
          <Row label="Fee accounting">
            {pool.feesDecoupled ? "Held separately" : "Part of liquidity"}
          </Row>
          {poolDependencies(pool).map((dependency) => (
            <Row key={dependency.key} label={dependency.label}>
              <ContractAddress
                address={dependency.address}
                label={`Copy ${dependency.label.toLowerCase()} address`}
              />
            </Row>
          ))}
        </dl>

        <PoolLocation pool={pool} />
      </CardContent>
    </Card>
  );
}

/**
 * Where the pool says it operates.
 *
 * The map takes whatever height the rows beside it settle on rather than a fixed
 * one, so the card is as tall as its longest column and no taller.
 *
 * Renders nothing when the catalog holds neither coordinates nor a place name.
 * An empty frame suggests a location that failed to load rather than one nobody
 * recorded.
 */
function PoolLocation({ pool }: { pool: UserPool }) {
  const point =
    pool.geoLat !== null && pool.geoLng !== null ? { lat: pool.geoLat, lng: pool.geoLng } : null;

  if (!point && !pool.locationName) return null;

  return (
    <div className="flex min-h-40 flex-col gap-2">
      {point ? (
        <Suspense fallback={<Skeleton className="min-h-32 flex-1" />}>
          <div className="min-h-32 flex-1">
            <LocationMap lat={point.lat} lng={point.lng} className="h-full" />
          </div>
        </Suspense>
      ) : null}

      {pool.locationName ? <p className="truncate text-sm">{pool.locationName}</p> : null}

      {point ? (
        <p className="font-data text-xs text-muted-foreground">
          {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One record row.
 *
 * The label never shrinks and the value never wraps: a value that outgrows its
 * half truncates, which keeps every row one line tall. A card where one row runs
 * to three lines because somebody entered a long URL stops being scannable.
 *
 * The height is fixed rather than left to the content. Values are a mix of body
 * text, small mono and badges, whose line boxes differ by a few pixels each —
 * enough that by the seventh row the two columns' rules no longer meet.
 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-10 items-center justify-between gap-3 border-b border-border last:border-b-0">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end gap-1 text-sm">{children}</dd>
    </div>
  );
}

/** A figure or an identifier: mono and tabular, so a column of them lines up. */
function Data({ children }: { children: ReactNode }) {
  return <span className="truncate font-data text-xs">{children}</span>;
}

/**
 * An absent value, in the same small mono `ContractAddress` uses for a pointer
 * the catalog never recorded — so every gap in the card looks like a gap rather
 * than like a pool whose email is the word "None".
 */
function Absent({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs text-muted-foreground">{children}</span>;
}

/**
 * The owner, linked to their account screen.
 *
 * An owner is an account this console has a page for, so it links there rather
 * than to the explorer the dependency contracts use — those have no page, and an
 * address that can go somewhere useful should go to the more useful of the two.
 */
function OwnerValue({ address }: { address: string | null }) {
  if (!address) return <Absent>Not recorded</Absent>;

  return (
    <>
      <Link
        to="/users/$address"
        params={{ address }}
        search={{ tab: "transactions", perPage: DEFAULT_PAGE_SIZE }}
        className="truncate font-data text-xs underline-offset-4 hover:underline"
      >
        {formatVoucherAddress(address as `0x${string}`)}
      </Link>
      <CopyButton value={address} label="Copy owner address" />
    </>
  );
}

/**
 * A steward-supplied link. The scheme is stripped because it is noise at this
 * width, and the glyph says the link leaves the console — the grammar `TxLink`
 * already uses.
 */
function ExternalHref({ href }: { href: string | null }) {
  if (!href) return <Absent>None</Absent>;

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
