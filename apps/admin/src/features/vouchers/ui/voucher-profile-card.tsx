import type { MarketVoucherDetail } from "@clc/api/features/market/client";

import {
  RecordAbsent,
  RecordData,
  RecordExternalLink,
  RecordLocation,
  RecordOwner,
  RecordRow,
} from "#/components/admin/record-fields";
import { Card, CardContent } from "#/components/ui/card";

/**
 * The voucher's record, split by what each column answers.
 *
 * **Left: what a unit is.** Who controls the contract, how divisible it is, and
 * the unit and value a steward declared it stands for — the four facts an
 * operator needs before reading any amount denominated in it.
 *
 * **Middle: who stands behind it.** Contact details the catalog holds and no
 * contract reads. This is where a support thread starts when a holder cannot
 * redeem.
 *
 * **Right: where it says it operates**, which is metadata too but is read by
 * looking rather than by reading, so it gets the space a map needs instead of a
 * row.
 *
 * That split is the card's only organising idea, which is why nothing here is
 * labelled — a heading naming the columns would say in two words what the
 * position already says.
 *
 * Nothing repeats the header: name, symbol, kind, address, chain, id and the
 * description all live up there.
 */
export function VoucherProfileCard({ voucher }: { voucher: MarketVoucherDetail }) {
  const point =
    voucher.lat !== null && voucher.lng !== null ? { lat: voucher.lat, lng: voucher.lng } : null;

  return (
    <Card className="h-full">
      {/* The map column is the one that grows. This card is the whole band — the
          voucher endpoint carries no figures to put beside it — so on a wide
          monitor there is width to spare, and spending it on the map rather than
          on stretching seven rows of text is what keeps a label and its value
          within reading distance of each other. */}
      <CardContent className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(12rem,1.3fr)]">
        <dl className="flex flex-col">
          <RecordRow label="Owner">
            <RecordOwner address={voucher.ownerAddress} />
          </RecordRow>
          {/* Not "—": the catalog merges rows from sources that carry no token
              metadata, and an assumed zero would render a six-decimal amount a
              million times too large wherever this voucher is quoted. */}
          <RecordRow label="Decimals">
            {voucher.decimals === null ? (
              <RecordAbsent>Not recorded</RecordAbsent>
            ) : (
              <RecordData>{voucher.decimals}</RecordData>
            )}
          </RecordRow>
          <RecordRow label="Unit of account">
            {voucher.voucherUoa ? (
              <span className="truncate font-mono text-xs uppercase">{voucher.voucherUoa}</span>
            ) : (
              <RecordAbsent>None</RecordAbsent>
            )}
          </RecordRow>
          <RecordRow label="Value">
            {voucher.voucherValue ? (
              <RecordData>{voucher.voucherValue}</RecordData>
            ) : (
              <RecordAbsent>None</RecordAbsent>
            )}
          </RecordRow>
        </dl>

        <dl className="flex flex-col">
          <RecordRow label="Email">
            {voucher.email ? (
              <span className="truncate">{voucher.email}</span>
            ) : (
              <RecordAbsent>None</RecordAbsent>
            )}
          </RecordRow>
          <RecordRow label="Phone">
            {voucher.phone ? (
              <RecordData>{voucher.phone}</RecordData>
            ) : (
              <RecordAbsent>None</RecordAbsent>
            )}
          </RecordRow>
          <RecordRow label="Website">
            <RecordExternalLink href={voucher.website} />
          </RecordRow>
        </dl>

        <RecordLocation point={point} name={voucher.locationName} className="min-h-56" />
      </CardContent>
    </Card>
  );
}
