import type { UserPool } from "@clc/api/features/pools/client";
import { isHttpUrl } from "@clc/core/lib/contact";

import { ContractAddress } from "#/components/admin/chain-cells";
import {
  RecordAbsent,
  RecordData,
  RecordExternalLink,
  RecordLocation,
  RecordOwner,
  RecordRow,
} from "#/components/admin/record-fields";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent } from "#/components/ui/card";
import { poolDependencies } from "../pool-posture";
import { PoolSealBits } from "./pool-seal-bits";

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
 *
 * The row, the value treatments and the map column come from
 * `components/admin/record-fields`, shared with the account and voucher records
 * so all three read as one card in three shapes.
 */
export function PoolProfileCard({ pool }: { pool: UserPool }) {
  const point =
    pool.geoLat !== null && pool.geoLng !== null ? { lat: pool.geoLat, lng: pool.geoLng } : null;

  return (
    <Card className="h-full">
      {/* The chain column is the widest of the three by design: it carries the
          longest labels next to values that must not truncate. A clipped
          address is unreadable in a way a clipped email is not. */}
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(8rem,0.7fr)]">
        <dl className="flex flex-col">
          <RecordRow label="Email">
            {pool.email ? (
              <span className="truncate">{pool.email}</span>
            ) : (
              <RecordAbsent>None</RecordAbsent>
            )}
          </RecordRow>
          <RecordRow label="Phone">
            {pool.phone ? <RecordData>{pool.phone}</RecordData> : <RecordAbsent>None</RecordAbsent>}
          </RecordRow>
          <RecordRow label="Website">
            <RecordExternalLink href={pool.website} />
          </RecordRow>
          <RecordRow label="Terms">
            {pool.terms && !isHttpUrl(pool.terms) ? (
              <RecordData>{pool.terms}</RecordData>
            ) : (
              <RecordExternalLink href={pool.terms} />
            )}
          </RecordRow>
          <RecordRow label="Tags">
            {pool.tags.length > 0 ? (
              <span className="flex flex-wrap justify-end gap-1">
                {pool.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="font-mono text-xs">
                    {tag}
                  </Badge>
                ))}
              </span>
            ) : (
              <RecordAbsent>None</RecordAbsent>
            )}
          </RecordRow>
        </dl>

        <dl className="flex flex-col">
          <RecordRow label="Owner">
            <RecordOwner address={pool.ownerAddress} />
          </RecordRow>
          <RecordRow label="Pricing">
            {pool.quoterType === "relative" ? (
              "Relative rates"
            ) : pool.quoterType === "decimal" ? (
              "Decimals only"
            ) : pool.quoterType === "oracle" ? (
              "Oracle feeds"
            ) : (
              <RecordAbsent>Not recorded</RecordAbsent>
            )}
          </RecordRow>
          {/* Whether a token balance is liquidity or a fee owed to the recipient. */}
          <RecordRow label="Fee accounting">
            {pool.feesDecoupled ? "Held separately" : "Part of liquidity"}
          </RecordRow>
          <RecordRow label="Seal">
            <PoolSealBits pool={pool} />
          </RecordRow>
          {poolDependencies(pool).map((dependency) => (
            <RecordRow key={dependency.key} label={dependency.label}>
              <ContractAddress
                address={dependency.address}
                label={`Copy ${dependency.label.toLowerCase()} address`}
              />
            </RecordRow>
          ))}
        </dl>

        <RecordLocation point={point} name={pool.locationName} />
      </CardContent>
    </Card>
  );
}
