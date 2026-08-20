import type { Offering } from "@clc/api/features/offerings/client";
import { formatOfferingPrice, formatOfferingQuantity } from "@clc/core/features/market/logic";

import type { ReactNode } from "react";
import { HiOutlinePencil } from "react-icons/hi";

import { AddressCell } from "#/components/admin/chain-cells";
import { StateBadge } from "#/components/admin/state-badge";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";

/**
 * One thing being offered against this voucher.
 *
 * Cards rather than the table the pool screen uses for the same resource, and for
 * a reason that survives the two screens reading alike: an offering carries a
 * photograph, and the photograph is how an operator recognises the commodity a
 * seller named "bag". A table with an image column is a card grid with extra
 * rules.
 *
 * Everything inside is the console's ordinary grammar even so — `StateBadge` for
 * availability, `AddressCell` for the seller, `font-data` for the two figures —
 * so a listing reads the same here as it does in the pool's offerings table.
 */
export function VoucherOfferingCard({
  offering,
  onEdit,
}: {
  offering: Offering;
  onEdit: () => void;
}) {
  const quantity = formatOfferingQuantity(offering.quantity, offering.unit);
  const price = formatOfferingPrice(offering.price);

  return (
    <Card size="sm" className="h-full">
      {/* The frame is kept when there is no photograph: a grid whose cards are
          two different heights depending on whether a seller uploaded an image
          reads as a layout failure rather than as missing data. */}
      <div className="bg-muted -mt-(--card-spacing) aspect-square">
        {offering.imageUrl ? (
          <img
            src={offering.imageUrl}
            alt={offering.commodityName}
            className="size-full object-cover"
          />
        ) : null}
      </div>

      <CardHeader>
        <CardTitle className="truncate">{offering.commodityName}</CardTitle>
        <CardDescription className="font-mono uppercase">{offering.commodityType}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5">
        <Line label="Quantity">
          <span className="font-data text-xs">
            {quantity ? [quantity.value, quantity.unit].filter(Boolean).join(" ") : "—"}
          </span>
        </Line>
        <Line label="Price">
          <span className="font-data text-xs">
            {price
              ? `${price.value}${offering.voucherSymbol ? ` ${offering.voucherSymbol}` : ""}`
              : "—"}
          </span>
        </Line>
        <Line label="Seller">
          <AddressCell address={offering.sellerAddress} />
        </Line>
      </CardContent>

      <CardFooter className="justify-between">
        <StateBadge
          state={offering.available ? "available" : "unavailable"}
          kind="offering"
          className="text-[0.625rem]"
        />
        <Button type="button" variant="ghost" size="xs" onClick={onEdit}>
          <HiOutlinePencil />
          Edit
        </Button>
      </CardFooter>
    </Card>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}
